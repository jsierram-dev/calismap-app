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
    this.load();
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

  private async load(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id')!;
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
