import { HttpClient } from '@angular/common/http';
import { Injectable, effect, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Exercise } from '../../models/exercise.model';
import { UserProfile } from '../../models/user-profile.model';
import { UserRoutine } from '../../models/user-routine.model';
import { WorkoutLogSyncDto } from '../../models/workout-log.model';
import { WorkoutSession } from '../../models/workout-session.model';
import { AuthService } from './auth.service';
import { LocalStorageService } from './local-storage.service';

const LAST_SYNCED_AT_KEY = 'lastSyncedAt';
// Entre syncs automáticos (volver a la app, salir de ella...): el back
// admite 10/min por usuario y cada sync manda el snapshot entero.
const MIN_AUTO_INTERVAL_MS = 20_000;

/** Una colección local-first con lista (WorkoutSession/WorkoutLog/UserRoutine/Exercise propios). */
export interface SyncCollection<T> {
  /** Todas las filas locales a mandar en el próximo snapshot. */
  getAllForSync(): Promise<T[]>;
  /** Aplica las filas que ganaron del lado del servidor — upsert por id. */
  applyUpdates(updates: T[]): Promise<void>;
}

/** Un singleton local-first (UserProfile) — mismo contrato, sin lista/id. */
export interface SyncSingleton<T> {
  getForSync(): Promise<T | null>;
  applyUpdate(update: T | null): Promise<void>;
}

interface SnapshotDto {
  workoutSessions: WorkoutSession[];
  // WorkoutLogSyncDto, no WorkoutLog — necesita updatedAt sintetizado para
  // viajar (ver models/workout-log.model.ts, toSyncDto/fromSyncDto, y
  // calismap-back/src/modules/sync/entities/workout-log.entity.ts). El
  // registro real lo hace WorkoutLogService, que implementa
  // SyncCollection<WorkoutLogSyncDto> a mano en vez de delegar a
  // LocalCollection<WorkoutLog> sin más.
  workoutLogs: WorkoutLogSyncDto[];
  userRoutines: UserRoutine[];
  exercises: Exercise[];
  userProfile: UserProfile | null;
}

interface ConflictDto<T> {
  local: T;
  server: T;
}

interface ConflictsDto {
  workoutLogs: ConflictDto<WorkoutLogSyncDto>[];
}

interface SyncResponseBody {
  syncedAt: string;
  updates: SnapshotDto;
  conflicts: ConflictsDto;
}

/**
 * Motor genérico de sincronización — arma el snapshot, POST /sync, aplica la
 * respuesta. Mismo patrón que mudanza-app. Ver ROADMAP-calismap.md,
 * "Arquitectura", y calismap-back/src/modules/sync para el contrato exacto
 * (el merge en sí corre del lado del servidor, acá solo se junta/aplica).
 *
 * Las colecciones se AUTO-REGISTRAN — cada servicio de dominio
 * (WorkoutSessionService, WorkoutLogService, UserRoutineService, ExerciseService
 * propio, UserProfileService) llama a su register*() correspondiente en su
 * propio constructor. SyncService no importa ni conoce esos servicios
 * directamente: evita un ciclo de dependencias y permite que este motor
 * exista y compile ya, antes de que esos servicios de dominio estén
 * construidos (ver ROADMAP-calismap.md, "Roadmap por fases" — paso 3 vs.
 * paso 5 del frontend).
 */
@Injectable({ providedIn: 'root' })
export class SyncService {
  private workoutSessions?: SyncCollection<WorkoutSession>;
  private workoutLogs?: SyncCollection<WorkoutLogSyncDto>;
  private userRoutines?: SyncCollection<UserRoutine>;
  private exercises?: SyncCollection<Exercise>;
  private userProfile?: SyncSingleton<UserProfile>;

  syncing = signal(false);
  lastError = signal<string | null>(null);
  lastSyncedAt = signal<string | null>(null);
  conflicts = signal<ConflictsDto>({ workoutLogs: [] });
  private lastAutoAttempt = 0;
  private inFlight: Promise<void> | null = null;

  /**
   * Cuándo se sincroniza solo (antes no lo llamaba nada y todo vivía solo en
   * el navegador): al arrancar con una cuenta de Google y justo tras iniciar
   * sesión (este effect, lo hecho como invitado se sube a la cuenta), al
   * salir de la app o volver a ella (visibilitychange) y al terminar un
   * entrenamiento (WorkoutSessionService.endSession). No tras cada escritura:
   * el snapshot va entero y durante un entrenamiento sería uno por serie.
   */
  constructor(
    private http: HttpClient,
    private localStorage: LocalStorageService,
    private auth: AuthService,
  ) {
    this.localStorage.get<string>(LAST_SYNCED_AT_KEY).then((v) => this.lastSyncedAt.set(v));
    effect(() => {
      if (this.auth.user()?.isGuest === false) untracked(() => this.syncInBackground(true));
    });
    document.addEventListener('visibilitychange', () => this.syncInBackground());
  }

  /** Sync sin esperar ni propagar el error: el estado queda en lastError (Ajustes lo muestra). */
  syncInBackground(force = false): void {
    if (!force && Date.now() - this.lastAutoAttempt < MIN_AUTO_INTERVAL_MS) return;
    this.lastAutoAttempt = Date.now();
    this.sync().catch(() => undefined);
  }

  registerWorkoutSessions(collection: SyncCollection<WorkoutSession>): void {
    this.workoutSessions = collection;
  }

  registerWorkoutLogs(collection: SyncCollection<WorkoutLogSyncDto>): void {
    this.workoutLogs = collection;
  }

  registerUserRoutines(collection: SyncCollection<UserRoutine>): void {
    this.userRoutines = collection;
  }

  registerExercises(collection: SyncCollection<Exercise>): void {
    this.exercises = collection;
  }

  registerUserProfile(singleton: SyncSingleton<UserProfile>): void {
    this.userProfile = singleton;
  }

  /**
   * Corre un ciclo completo de sync. Sale temprano (sin error) si algún
   * servicio de dominio todavía no se registró — pasa mientras el frontend
   * se termina de construir (paso 5), no debería pasar nunca en la app
   * terminada, así que no hace falta más que un log.
   */
  sync(): Promise<void> {
    // Si ya hay uno en vuelo se devuelve ese mismo (candado del lado del
    // cliente, mismo motivo que syncsInProgress en el back): quien espera un
    // sync, como el logout antes de borrar los datos, espera al real.
    if (!this.inFlight) this.inFlight = this.run().finally(() => (this.inFlight = null));
    return this.inFlight;
  }

  private async run(): Promise<void> {
    // Un invitado no tiene cuenta a la que subir (el back responde 403), y una
    // sesión caducada espera a que vuelva a entrar.
    if (this.auth.isGuest() || this.auth.sessionExpired()) return;
    if (!this.workoutSessions || !this.workoutLogs || !this.userRoutines || !this.exercises || !this.userProfile) {
      console.warn('SyncService.sync(): faltan colecciones por registrar todavía, se omite este ciclo.');
      return;
    }

    this.syncing.set(true);
    this.lastError.set(null);

    try {
      const lastSyncedAt = await this.localStorage.get<string>(LAST_SYNCED_AT_KEY);
      const snapshot: SnapshotDto = {
        workoutSessions: await this.workoutSessions.getAllForSync(),
        workoutLogs: await this.workoutLogs.getAllForSync(),
        userRoutines: await this.userRoutines.getAllForSync(),
        exercises: await this.exercises.getAllForSync(),
        userProfile: await this.userProfile.getForSync(),
      };

      const response = await firstValueFrom(
        this.http.post<SyncResponseBody>(`${environment.apiUrl}/sync`, { lastSyncedAt, snapshot }),
      );

      await this.workoutSessions.applyUpdates(response.updates.workoutSessions);
      await this.workoutLogs.applyUpdates(response.updates.workoutLogs);
      await this.userRoutines.applyUpdates(response.updates.userRoutines);
      await this.exercises.applyUpdates(response.updates.exercises);
      await this.userProfile.applyUpdate(response.updates.userProfile);

      await this.localStorage.set(LAST_SYNCED_AT_KEY, response.syncedAt);
      this.lastSyncedAt.set(response.syncedAt);
      this.conflicts.set(response.conflicts);
    } catch (err) {
      // Solo para depurar: la UI muestra su propio texto traducido, no este.
      this.lastError.set(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      this.syncing.set(false);
    }
  }
}
