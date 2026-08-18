import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Exercise } from '../../models/exercise.model';
import { Routine } from '../../models/routine.model';
import { UserRoutine } from '../../models/user-routine.model';
import { WorkoutSession } from '../../models/workout-session.model';
import { ActiveSessionIndicatorService } from '../../core/services/active-session-indicator.service';
import { I18nService } from '../../core/services/i18n.service';
import { ExerciseLibraryService } from '../../services/exercise-library.service';
import { RoutineService } from '../../services/routine.service';
import { UserProfileService } from '../../services/user-profile.service';
import { UserRoutineService } from '../../services/user-routine.service';
import { WorkoutLogService } from '../../services/workout-log.service';
import { WorkoutSessionService } from '../../services/workout-session.service';
import { ItemDropdownComponent, SetDoneEvent, SetEntry } from '../../shared/item-dropdown/item-dropdown.component';
import { LibraryPage } from '../library/library.page';

interface ChecklistItem {
  exercise: Exercise;
  sets: SetEntry[];
}

const DEFAULT_TARGET_SETS = 3;
const REST_PRESETS = [30, 60, 90, 120, 180];

// Pantallas 06+07 — SessionWorkoutComponent (ver COMPONENTES-calismap.md):
// UN componente, con estado interno: sin sesión abierta muestra el
// selector (sesión libre / rutinas oficiales / propias / crear rutina);
// con una abierta muestra el checklist en curso (ItemDropdownComponent modo
// logging, uno por ejercicio) + timer de descanso editable. Las rutas
// /choose-session y /active-session apuntan a este mismo componente — cuál
// vista se muestra depende SIEMPRE de WorkoutSessionService.getActive(), no
// de cuál ruta trajo hasta acá (ver NavbarComponent, que ya elige la ruta
// correcta según haya sesión).
@Component({
  selector: 'app-session-workout',
  standalone: true,
  imports: [RouterLink, ItemDropdownComponent, LibraryPage],
  templateUrl: './session-workout.page.html',
  styleUrl: './session-workout.page.css',
})
export class SessionWorkoutPage implements OnInit {
  private destroyRef = inject(DestroyRef);

  active = signal<WorkoutSession | null>(null);
  checklist = signal<ChecklistItem[]>([]);
  nextExerciseName = signal<string | null>(null);

  officialRoutines = signal<Routine[]>([]);
  ownRoutines = signal<UserRoutine[]>([]);

  pickerOpen = signal(false);
  restDuration = signal(90);
  restRemaining = signal(0);
  restEditOpen = signal(false);
  restPresets = REST_PRESETS;

  private now = signal(Date.now());
  private nowTimerId: ReturnType<typeof setInterval>;
  private restTimerId: ReturnType<typeof setInterval> | null = null;
  // Ejercicios agregados vía "Registrar otro ejercicio" que TODAVÍA no
  // tienen ninguna marca — local, no persiste (ver load()): una vez que se
  // loguea la primera serie, WorkoutLog ya los mantiene en el checklist
  // solo, sin necesitar este set.
  private manualExtras = signal<Set<string>>(new Set());

  elapsedLabel = computed(() => {
    const session = this.active();
    if (!session) return '';
    const totalSeconds = Math.max(0, Math.floor((this.now() - new Date(session.startedAt).getTime()) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  });

  restLabel = computed(() => {
    const total = this.restRemaining();
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  });

  constructor(
    public sessionIndicator: ActiveSessionIndicatorService,
    private workoutSession: WorkoutSessionService,
    private workoutLog: WorkoutLogService,
    private exerciseLibrary: ExerciseLibraryService,
    private routineService: RoutineService,
    private userRoutineService: UserRoutineService,
    private userProfile: UserProfileService,
    private router: Router,
    public i18n: I18nService,
  ) {
    this.nowTimerId = setInterval(() => this.now.set(Date.now()), 1000);
    this.destroyRef.onDestroy(() => {
      clearInterval(this.nowTimerId);
      this.clearRest();
    });
  }

  ngOnInit(): void {
    this.load();
  }

  ionViewWillEnter(): void {
    this.load();
  }

  // ─── Elegir sesión ────────────────────────────────────────────────────
  async startFree(): Promise<void> {
    this.manualExtras.set(new Set());
    await this.workoutSession.startSession({ name: this.i18n.t('session.freeSessionFallback') });
    await this.load();
  }

  async startFromRoutine(routine: Routine): Promise<void> {
    this.manualExtras.set(new Set());
    await this.workoutSession.startSession({ name: routine.name, routineId: routine.id });
    await this.load();
  }

  async startFromUserRoutine(userRoutine: UserRoutine): Promise<void> {
    this.manualExtras.set(new Set());
    await this.workoutSession.startSession({ name: userRoutine.name, userRoutineId: userRoutine.id });
    await this.load();
  }

  // ─── Sesión en curso ──────────────────────────────────────────────────
  async onSetDone(exerciseId: string, event: SetDoneEvent): Promise<void> {
    const session = this.active();
    if (!session) return;
    await this.workoutLog.logSet({
      sessionId: session.id,
      exerciseId,
      value: event.value,
      addedWeightKg: event.addedWeightKg,
      bodyWeightAtLog: this.userProfile.getBodyWeightKg(),
    });
    this.startRest();
    await this.load();
  }

  // ─── Hallazgos #5 y #10 de pruebas reales en móvil (16/08/2026, ver
  //     ROADMAP-calismap.md) — el círculo de ItemDropdownComponent togglea
  //     TODAS las series de un ejercicio de una, y cada serie ya registrada
  //     se puede deshacer individualmente sin tocar las demás. ─────────────
  async onCheckAll(exerciseId: string, events: SetDoneEvent[]): Promise<void> {
    const session = this.active();
    if (!session || !events.length) return;
    for (const event of events) {
      await this.workoutLog.logSet({
        sessionId: session.id,
        exerciseId,
        value: event.value,
        addedWeightKg: event.addedWeightKg,
        bodyWeightAtLog: this.userProfile.getBodyWeightKg(),
      });
    }
    this.startRest(); // mismo criterio que onSetDone — una sola vez, no una por serie
    await this.load();
  }

  async onUncheckAll(item: ChecklistItem): Promise<void> {
    const doneIds = item.sets.filter((s) => s.done && s.id).map((s) => s.id!);
    for (const id of doneIds) {
      await this.workoutLog.remove(id);
    }
    await this.load();
  }

  async onUndoSet(logId: string): Promise<void> {
    await this.workoutLog.remove(logId);
    await this.load();
  }

  onExercisePicked(exercise: Exercise): void {
    this.manualExtras.update((set) => new Set(set).add(exercise.id));
    this.pickerOpen.set(false);
    this.load();
  }

  setRestPreset(seconds: number): void {
    this.restDuration.set(seconds);
    this.restEditOpen.set(false);
  }

  addRest(seconds: number): void {
    if (!this.restTimerId) return; // +30s solo tiene sentido con un descanso ya corriendo
    this.restRemaining.update((v) => Math.max(0, v + seconds));
  }

  skipRest(): void {
    this.clearRest();
  }

  // Navega a la pantalla de logros (18/08/2026, ver ROADMAP-calismap.md
  // "Pantalla de logros") en vez de recargar el selector acá mismo — esta
  // página vuelve a mostrar "Elegir sesión" recién cuando el usuario
  // vuelva por su cuenta (ionViewWillEnter ya la recarga sola). El modal de
  // login de invitado ya NO se dispara acá (18/08/2026, pedido explícito
  // del usuario) — se movió al botón de esa misma pantalla
  // (SessionSummaryComponent.backToRoadmaps()), no automático al terminar.
  async endSession(): Promise<void> {
    const session = this.active();
    if (!session) return;
    await this.workoutSession.endSession(session.id);
    this.clearRest();
    await this.router.navigate(['/session-summary', session.id]);
  }

  private startRest(): void {
    this.clearRest();
    this.restRemaining.set(this.restDuration());
    this.restTimerId = setInterval(() => {
      const next = this.restRemaining() - 1;
      if (next <= 0) this.clearRest();
      else this.restRemaining.set(next);
    }, 1000);
  }

  private clearRest(): void {
    if (this.restTimerId) {
      clearInterval(this.restTimerId);
      this.restTimerId = null;
    }
    this.restRemaining.set(0);
  }

  private async load(): Promise<void> {
    const session = await this.workoutSession.getActive();
    this.active.set(session);

    if (!session) {
      const [official, own] = await Promise.all([this.routineService.getAll(), this.userRoutineService.getAll()]);
      this.officialRoutines.set(official);
      this.ownRoutines.set(own);
      return;
    }

    // targetValues: un valor POR SERIE, no uno solo repetido para todas
    // (hallazgo #9 de pruebas reales en móvil, 16/08/2026, ver
    // ROADMAP-calismap.md) — ej. pirámide 12/10/8. Rutinas oficiales y
    // propias ya guardan el array real cada una (ver RoutineExercise/
    // UserRoutineExerciseEntry), acá solo se combinan al mismo shape.
    let prescribed: { exerciseId: string; targetSets: number; targetValues: (number | null)[] }[] = [];
    if (session.routineId) {
      const detail = await this.routineService.getDetail(session.routineId);
      prescribed = detail?.exercises.map((e) => ({ exerciseId: e.exerciseId, targetSets: e.targetSets, targetValues: e.targetValues })) ?? [];
    } else if (session.userRoutineId) {
      const userRoutine = await this.userRoutineService.getById(session.userRoutineId);
      prescribed = userRoutine?.exercises.map((e) => ({ exerciseId: e.exerciseId, targetSets: e.targetSets, targetValues: e.targetValues })) ?? [];
    }

    const logs = await this.workoutLog.getForSession(session.id);
    const loggedExerciseIds = new Set(logs.map((l) => l.exerciseId));
    const extraLoggedIds = [...loggedExerciseIds].filter((id) => !prescribed.some((p) => p.exerciseId === id));
    const extraManualIds = [...this.manualExtras()].filter(
      (id) => !prescribed.some((p) => p.exerciseId === id) && !extraLoggedIds.includes(id),
    );

    const entries = [
      ...prescribed,
      // Bug real 18/08/2026 (ver ROADMAP-calismap.md): targetSets acá era
      // logs.filter(...).length a secas — el número de series YA
      // registradas, no el objetivo real. Un ejercicio agregado a mano
      // (3 series por defecto, DEFAULT_TARGET_SETS) que pasa de
      // extraManualIds a ESTE branch en cuanto se marca la PRIMERA serie
      // (ver el comentario de manualExtras más arriba) recalculaba su
      // propio objetivo como "1 hecha, entonces el objetivo era 1" — las
      // otras 2 series pendientes desaparecían del checklist en vez de
      // seguir mostrándose sin marcar. Math.max con DEFAULT_TARGET_SETS
      // conserva el objetivo original mientras haya menos marcas que eso,
      // y crece solo si en algún momento se registran más de las 3 de
      // partida (nunca se achica).
      ...extraLoggedIds.map((exerciseId) => ({
        exerciseId,
        targetSets: Math.max(logs.filter((l) => l.exerciseId === exerciseId).length, DEFAULT_TARGET_SETS),
        targetValues: [] as (number | null)[],
      })),
      ...extraManualIds.map((exerciseId) => ({ exerciseId, targetSets: DEFAULT_TARGET_SETS, targetValues: [] as (number | null)[] })),
    ];

    const items: ChecklistItem[] = [];
    for (const entry of entries) {
      const exercise = await this.exerciseLibrary.getById(entry.exerciseId);
      if (!exercise) continue;
      const exerciseLogs = logs.filter((l) => l.exerciseId === entry.exerciseId);
      const doneSets: SetEntry[] = exerciseLogs.map((l) => ({ id: l.id, value: l.value, addedWeightKg: l.addedWeightKg, done: true }));
      const pendingCount = Math.max(0, entry.targetSets - doneSets.length);
      // El índice real de cada pendiente sigue después de las ya hechas —
      // una pirámide 12/10/8 con la serie 1 ya registrada debe proponer 10
      // para la próxima, no volver a arrancar en 12.
      const pendingSets: SetEntry[] = Array.from({ length: pendingCount }, (_, i) => ({
        value: entry.targetValues[doneSets.length + i] ?? null,
        addedWeightKg: 0,
        done: false,
      }));
      items.push({ exercise, sets: [...doneSets, ...pendingSets] });
    }
    this.checklist.set(items);

    const next = items.find((item) => item.sets.some((s) => !s.done));
    this.nextExerciseName.set(next?.exercise.name ?? null);
  }
}
