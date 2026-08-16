import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { Exercise, RATING_ORDER, Rating } from '../../models/exercise.model';
import { effectiveValue } from '../../models/workout-log.model';
import { RatingCalculatorService } from '../../services/rating-calculator.service';
import { RoadmapService } from '../../services/roadmap.service';
import { UserProfileService } from '../../services/user-profile.service';
import { WorkoutLogService } from '../../services/workout-log.service';
import { WorkoutSessionService } from '../../services/workout-session.service';
import { RouteComponent, RouteNode, RouteNodeState } from '../../shared/route/route.component';

// Pantalla 03 — ExerciseInfoComponent (ver COMPONENTES-calismap.md): tag+
// título/carrusel foto→video (placeholder honesto, Fase 3 — contenido real
// pendiente)/instrucciones/RouteComponent (escalera de rating, [mini]=true)/
// registro de marca con timer de descanso/link de regresión.
//
// TODO (pendiente de esta misma ronda, no otra): registrar una marca acá
// también crea/usa una sesión (igual que la Biblioteca, ver
// ROADMAP-calismap.md) — falta LoginComponent para el prompt al crear un
// ejercicio propio; este flujo (marcar/loguear) NO es uno de los 4 momentos
// de login opcional, solo crear ejercicio/rutina propia y completar un
// roadmap lo son.
@Component({
  selector: 'app-exercise-detail',
  standalone: true,
  imports: [FormsModule, RouterLink, RouteComponent],
  templateUrl: './exercise-detail.page.html',
  styleUrl: './exercise-detail.page.css',
})
export class ExerciseDetailPage implements OnInit {
  private destroyRef = inject(DestroyRef);

  exercise = signal<Exercise | null>(null);
  regressionExercise = signal<Exercise | null>(null);
  bestValue = signal<number | null>(null);
  rating = signal<Rating | null>(null);
  ladderNodes = signal<RouteNode[]>([]);

  activeSlide = signal(0);
  repsInput = signal(10);
  weightInput = signal(0);

  restRemaining = signal(0);
  private restTimerId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private route: ActivatedRoute,
    private roadmapService: RoadmapService,
    private ratingCalc: RatingCalculatorService,
    private userProfile: UserProfileService,
    private workoutLog: WorkoutLogService,
    private workoutSession: WorkoutSessionService,
  ) {
    this.destroyRef.onDestroy(() => this.clearRestTimer());
  }

  ngOnInit(): void {
    // Observa el param, no solo lo lee una vez (hallazgo #4 de pruebas
    // reales en móvil, ver ROADMAP-calismap.md) — navegar de /exercises/A a
    // /exercises/B (mismo patrón de ruta, solo cambia el id) hace que
    // Angular Router REUSE esta misma instancia de componente en vez de
    // recrearla, así que un load() que solo corriera en ngOnInit/
    // ionViewWillEnter se quedaría mostrando el ejercicio viejo con la URL
    // ya cambiada — exactamente el bug reportado ("el botón de regresión no
    // redirige a ningún lado"). Afecta a cualquier link ejercicio→ejercicio
    // (el de regresión, y los nuevos de la escalera de roadmap/menciones en
    // texto).
    //
    // El id se pasa DIRECTO desde la emisión del observable, nunca releído
    // de route.snapshot dentro de load() — probado con logging real: en el
    // mismo tick en que paramMap ya emitió el id nuevo, route.snapshot
    // todavía devolvía el viejo (no están perfectamente sincronizados acá),
    // así que load() terminaba pidiendo el ejercicio equivocado pese a que
    // la URL sí había cambiado — la app "navegaba" pero mostraba el mismo
    // contenido de siempre.
    this.route.paramMap.subscribe((pm) => this.load(pm.get('id')!));
  }

  ionViewWillEnter(): void {
    this.load();
  }

  setSlide(index: number): void {
    this.activeSlide.set(index);
  }

  /** Registro rápido — reusa la sesión activa si hay una abierta, si no crea/cierra una de una sola marca (mismo criterio que el registro rápido desde Biblioteca, ver ROADMAP-calismap.md). */
  async logMark(): Promise<void> {
    const exercise = this.exercise();
    if (!exercise || this.repsInput() <= 0) return;

    let session = await this.workoutSession.getActive();
    let ownSession = false;
    if (!session) {
      session = await this.workoutSession.startSession({ name: 'Registro rápido' });
      ownSession = true;
    }

    await this.workoutLog.logSet({
      sessionId: session.id,
      exerciseId: exercise.id,
      value: this.repsInput(),
      addedWeightKg: this.weightInput(),
      bodyWeightAtLog: this.userProfile.getBodyWeightKg(),
    });

    if (ownSession) await this.workoutSession.endSession(session.id);

    await this.load();
  }

  toggleRestTimer(): void {
    if (this.restTimerId) {
      this.clearRestTimer();
      return;
    }
    this.restRemaining.set(90);
    this.restTimerId = setInterval(() => {
      const next = this.restRemaining() - 1;
      if (next <= 0) {
        this.clearRestTimer();
      } else {
        this.restRemaining.set(next);
      }
    }, 1000);
  }

  private clearRestTimer(): void {
    if (this.restTimerId) {
      clearInterval(this.restTimerId);
      this.restTimerId = null;
    }
    this.restRemaining.set(0);
  }

  private async load(id: string = this.route.snapshot.paramMap.get('id')!): Promise<void> {
    const exercise = await this.roadmapService.getExerciseById(id);
    this.exercise.set(exercise);
    if (!exercise) return;

    this.regressionExercise.set(
      exercise.regressionExerciseId ? await this.roadmapService.getExerciseById(exercise.regressionExerciseId) : null,
    );

    const bestLog = await this.workoutLog.getBestLog(id);
    const rating = bestLog ? this.ratingCalc.ratingForEffectiveValue(effectiveValue(bestLog), exercise.ratingThresholds) : null;
    this.bestValue.set(bestLog?.value ?? null);
    this.rating.set(rating);
    this.repsInput.set(bestLog?.value ?? (exercise.repUnit === 'reps' ? 10 : 30));

    this.ladderNodes.set(this.buildLadder(exercise, rating, bestLog?.value ?? null));
  }

  private buildLadder(exercise: Exercise, currentRating: Rating | null, bestValue: number | null): RouteNode[] {
    const unit = exercise.repUnit === 'reps' ? 'reps' : 'seg';
    const currentIndex = currentRating ? RATING_ORDER.indexOf(currentRating) : -1;
    const bodyWeightKg = this.userProfile.getBodyWeightKg();

    return RATING_ORDER.map((tier, index) => {
      const state: RouteNodeState = index <= currentIndex ? 'done' : index === currentIndex + 1 ? 'current' : 'locked';
      // Ajustado al peso corporal REAL del usuario, no al umbral crudo de la
      // tabla (calibrado a 75kg) — es el diferenciador central de la app, ver
      // ROADMAP-calismap.md "investigación de mercado".
      const needed = this.ratingCalc.valueNeededFor(tier, bodyWeightKg, exercise.ratingThresholds);
      const node: RouteNode = {
        title: this.tierLabel(tier),
        levelLabel: `${needed} ${unit}`,
        state,
      };
      if (state === 'current') {
        const remaining = Math.max(0, needed - (bestValue ?? 0));
        node.coachNote =
          bestValue !== null
            ? { headline: `${needed} ${unit} y estás en ${this.tierLabel(tier)}`, sub: `Te faltan ${remaining} desde tu mejor marca (${bestValue})` }
            : { headline: `${needed} ${unit} y estás en ${this.tierLabel(tier)}`, sub: 'Registrá tu primera marca para arrancar' };
      }
      return node;
    });
  }

  private tierLabel(rating: Rating): string {
    return rating.charAt(0) + rating.slice(1).toLowerCase();
  }
}
