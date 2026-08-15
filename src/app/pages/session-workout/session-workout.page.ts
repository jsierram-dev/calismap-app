import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ModalController } from '@ionic/angular/standalone';
import { Exercise } from '../../models/exercise.model';
import { Routine } from '../../models/routine.model';
import { UserRoutine } from '../../models/user-routine.model';
import { WorkoutSession } from '../../models/workout-session.model';
import { ActiveSessionIndicatorService } from '../../core/services/active-session-indicator.service';
import { AuthService } from '../../core/services/auth.service';
import { ExerciseLibraryService } from '../../services/exercise-library.service';
import { RoutineService } from '../../services/routine.service';
import { UserProfileService } from '../../services/user-profile.service';
import { UserRoutineService } from '../../services/user-routine.service';
import { WorkoutLogService } from '../../services/workout-log.service';
import { WorkoutSessionService } from '../../services/workout-session.service';
import { ItemDropdownComponent, SetDoneEvent, SetEntry } from '../../shared/item-dropdown/item-dropdown.component';
import { LoginComponent } from '../../shared/login/login.component';
import { LibraryPage } from '../library/library.page';

interface ChecklistItem {
  exercise: Exercise;
  targetValue: number | null;
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
    public auth: AuthService,
    public sessionIndicator: ActiveSessionIndicatorService,
    private workoutSession: WorkoutSessionService,
    private workoutLog: WorkoutLogService,
    private exerciseLibrary: ExerciseLibraryService,
    private routineService: RoutineService,
    private userRoutineService: UserRoutineService,
    private userProfile: UserProfileService,
    private modalCtrl: ModalController,
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
    await this.workoutSession.startSession({ name: 'Sesión libre' });
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

  async endSession(): Promise<void> {
    const session = this.active();
    if (!session) return;
    await this.workoutSession.endSession(session.id);
    this.clearRest();
    // Terminar la sesión es uno de los 4 momentos con motivo real para
    // pedirle cuenta a un invitado (ver ROADMAP-calismap.md "Login:
    // OPCIONAL") — no bloqueante, la sesión ya se cerró antes de mostrarlo.
    if (this.auth.isGuest()) {
      const modal = await this.modalCtrl.create({ component: LoginComponent });
      await modal.present();
    }
    await this.load();
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

    let prescribed: { exerciseId: string; targetSets: number; targetValue: number | null }[] = [];
    if (session.routineId) {
      const detail = await this.routineService.getDetail(session.routineId);
      prescribed = detail?.exercises.map((e) => ({ exerciseId: e.exerciseId, targetSets: e.targetSets, targetValue: e.targetValue })) ?? [];
    } else if (session.userRoutineId) {
      const userRoutine = await this.userRoutineService.getById(session.userRoutineId);
      prescribed = userRoutine?.exercises.map((e) => ({ exerciseId: e.exerciseId, targetSets: e.targetSets, targetValue: e.targetValue })) ?? [];
    }

    const logs = await this.workoutLog.getForSession(session.id);
    const loggedExerciseIds = new Set(logs.map((l) => l.exerciseId));
    const extraLoggedIds = [...loggedExerciseIds].filter((id) => !prescribed.some((p) => p.exerciseId === id));
    const extraManualIds = [...this.manualExtras()].filter(
      (id) => !prescribed.some((p) => p.exerciseId === id) && !extraLoggedIds.includes(id),
    );

    const entries = [
      ...prescribed,
      ...extraLoggedIds.map((exerciseId) => ({
        exerciseId,
        targetSets: logs.filter((l) => l.exerciseId === exerciseId).length,
        targetValue: null as number | null,
      })),
      ...extraManualIds.map((exerciseId) => ({ exerciseId, targetSets: DEFAULT_TARGET_SETS, targetValue: null as number | null })),
    ];

    const items: ChecklistItem[] = [];
    for (const entry of entries) {
      const exercise = await this.exerciseLibrary.getById(entry.exerciseId);
      if (!exercise) continue;
      const exerciseLogs = logs.filter((l) => l.exerciseId === entry.exerciseId);
      const doneSets: SetEntry[] = exerciseLogs.map((l) => ({ value: l.value, addedWeightKg: l.addedWeightKg, done: true }));
      const pendingCount = Math.max(0, entry.targetSets - doneSets.length);
      const pendingSets: SetEntry[] = Array.from({ length: pendingCount }, () => ({
        value: entry.targetValue,
        addedWeightKg: 0,
        done: false,
      }));
      items.push({ exercise, targetValue: entry.targetValue, sets: [...doneSets, ...pendingSets] });
    }
    this.checklist.set(items);

    const next = items.find((item) => item.sets.some((s) => !s.done));
    this.nextExerciseName.set(next?.exercise.name ?? null);
  }
}
