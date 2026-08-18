import { Injectable } from '@angular/core';
import { WorkoutSession } from '../models/workout-session.model';
import { LocalCollection } from '../core/utils/local-collection';
import { newId, touch } from '../core/utils/sync-meta';
import { ActiveSessionIndicatorService } from '../core/services/active-session-indicator.service';
import { LocalStorageService } from '../core/services/local-storage.service';
import { SyncService } from '../core/services/sync.service';

const KEY = 'calismap_workout_sessions';
// Solo local, nunca sincroniza — WorkoutSession no guarda un nombre para
// mostrar (routineId/userRoutineId son la fuente de verdad real), así que
// esto es apenas una copia de lectura rápida para poder repoblar
// ActiveSessionIndicatorService al reabrir la app sin depender de
// RoutineService/UserRoutineService acá (ver rehydrateIndicator()).
const ACTIVE_NAME_KEY = 'calismap_active_session_name';

/**
 * Local-first, sincroniza con "el más reciente gana" (mergeListLastWriteWins
 * — ver workout-session.model.ts). El nombre a mostrar en el indicador
 * (NavbarComponent/NoticeSessionComponent vía ActiveSessionIndicatorService)
 * lo resuelve quien llama a startSession() — en "Elegir sesión" (paso 6) ya
 * se tiene la Routine/UserRoutine elegida en mano, así que no hace falta que
 * este servicio dependa de los servicios de catálogo/rutina propia.
 */
@Injectable({ providedIn: 'root' })
export class WorkoutSessionService {
  private collection: LocalCollection<WorkoutSession>;

  constructor(
    private storage: LocalStorageService,
    private sync: SyncService,
    private indicator: ActiveSessionIndicatorService,
  ) {
    this.collection = new LocalCollection<WorkoutSession>(storage, KEY);
    this.sync.registerWorkoutSessions(this.collection);
    this.rehydrateIndicator();
  }

  async getAll(): Promise<WorkoutSession[]> {
    return this.collection.getAll();
  }

  /** null = no hay ninguna sesión abierta ahora mismo (ver "Elegir sesión" vs. "Sesión activa" en la navbar). */
  async getActive(): Promise<WorkoutSession | null> {
    const all = await this.collection.getAll();
    return all.find((s) => s.endedAt === null && !s.deletedAt) ?? null;
  }

  /** Usado por SessionAchievementsService para resolver la sesión recién terminada por id (ver session-summary). */
  async getById(id: string): Promise<WorkoutSession | null> {
    return this.collection.getById(id);
  }

  /**
   * Sesiones de ESTA SEMANA CALENDARIO (lunes a hoy) — "¿entrenaste esta
   * semana?", no un conteo de sesiones sueltas (ver ROADMAP-calismap.md,
   * "Corrige algo mal resuelto en la ronda anterior"). Extraído el
   * 18/08/2026 de RoadmapsPage.load() (ver ROADMAP-calismap.md "Pantalla de
   * logros") para que StreakComponent lo reuse tal cual en la pantalla de
   * resumen de sesión, sin duplicar esta cuenta de días en dos archivos.
   */
  async getWeeklySessionCount(): Promise<number> {
    const sessions = await this.getAll();
    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    const day = weekStart.getDay(); // 0=domingo
    const diffToMonday = day === 0 ? 6 : day - 1;
    weekStart.setDate(weekStart.getDate() - diffToMonday);
    return sessions.filter((s) => !s.deletedAt && new Date(s.startedAt) >= weekStart).length;
  }

  async startSession(options: {
    name: string;
    routineId?: string | null;
    userRoutineId?: string | null;
  }): Promise<WorkoutSession> {
    const session: WorkoutSession = touch({
      id: newId(),
      startedAt: new Date().toISOString(),
      endedAt: null,
      source: 'app',
      routineId: options.routineId ?? null,
      userRoutineId: options.userRoutineId ?? null,
      updatedAt: '',
      deletedAt: null,
    });
    await this.collection.upsert(session);
    await this.storage.set(ACTIVE_NAME_KEY, options.name);
    this.indicator.set({ name: options.name, startedAt: session.startedAt });
    return session;
  }

  async endSession(id: string): Promise<void> {
    const session = await this.collection.getById(id);
    if (!session) return;
    const ended = touch({ ...session, endedAt: new Date().toISOString() });
    await this.collection.upsert(ended);
    await this.storage.remove(ACTIVE_NAME_KEY);
    this.indicator.clear();
  }

  /** Repuebla el indicador compartido al arrancar la app, si quedó una sesión abierta de antes (cierre inesperado, F5, etc.). */
  private async rehydrateIndicator(): Promise<void> {
    const active = await this.getActive();
    if (!active) return;
    const name = (await this.storage.get<string>(ACTIVE_NAME_KEY)) ?? 'Sesión libre';
    this.indicator.set({ name, startedAt: active.startedAt });
  }
}
