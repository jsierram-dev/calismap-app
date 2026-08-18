import { Injectable } from '@angular/core';
import { Exercise, RATING_ORDER, Rating } from '../models/exercise.model';
import { Roadmap } from '../models/roadmap.model';
import { WorkoutSession } from '../models/workout-session.model';
import { effectiveValue } from '../models/workout-log.model';
import { ExerciseLibraryService } from './exercise-library.service';
import { RatingCalculatorService } from './rating-calculator.service';
import { RoadmapService } from './roadmap.service';
import { WorkoutLogService } from './workout-log.service';
import { WorkoutSessionService } from './workout-session.service';

export interface PrAchievement {
  exercise: Exercise;
  value: number;
  previousValue: number | null; // null = primera marca registrada de este ejercicio
}

export interface TierUpAchievement {
  exercise: Exercise;
  fromRating: Rating; // nunca null acá — ver ratingChanges más abajo, el primer registro NO cuenta como "subida de tier"
  toRating: Rating;
}

export interface RoadmapStepUnlockedAchievement {
  roadmap: Roadmap;
  exercise: Exercise; // el paso que se acaba de desbloquear
}

export interface RoadmapTargetReachedAchievement {
  roadmap: Roadmap;
  targetExercise: Exercise;
}

export interface SessionSummary {
  session: WorkoutSession;
  durationMinutes: number;
  exerciseCount: number;
  setCount: number;
  weeklySessionCount: number;
  prs: PrAchievement[];
  tierUps: TierUpAchievement[];
  roadmapStepsUnlocked: RoadmapStepUnlockedAchievement[];
  roadmapTargetsReached: RoadmapTargetReachedAchievement[];
  hasAchievements: boolean;
}

/**
 * Calcula qué pasó de nuevo en una sesión ya terminada — récords
 * personales, subidas de tier, avances de roadmap y la racha semanal (ver
 * ROADMAP-calismap.md "Pantalla de logros", 18/08/2026). Puramente de
 * LECTURA: no guarda nada, solo cruza servicios que ya existían
 * (WorkoutLogService/RatingCalculatorService/RoadmapService), sin
 * duplicar ninguna de sus reglas — ver detectRoadmapAdvances() para el caso
 * más delicado.
 *
 * Todo se compara contra un "antes" reconstruido a partir del historial
 * completo de cada ejercicio EXCLUYENDO esta sesión (WorkoutLog es
 * inmutable y ya trae sessionId — ver workout-log.model.ts), nunca contra
 * un snapshot guardado aparte al empezar la sesión.
 */
@Injectable({ providedIn: 'root' })
export class SessionAchievementsService {
  constructor(
    private workoutSession: WorkoutSessionService,
    private workoutLog: WorkoutLogService,
    private exerciseLibrary: ExerciseLibraryService,
    private ratingCalc: RatingCalculatorService,
    private roadmapService: RoadmapService,
  ) {}

  async summarize(sessionId: string): Promise<SessionSummary | null> {
    const session = await this.workoutSession.getById(sessionId);
    if (!session) return null;

    const logs = await this.workoutLog.getForSession(sessionId);
    const exerciseIds = [...new Set(logs.map((l) => l.exerciseId))];

    const prs: PrAchievement[] = [];
    // exerciseId -> rating antes/después de HOY — solo entra acá un
    // ejercicio si terminó la sesión en un rating más alto que antes
    // (incluido el caso "no tenía ninguno todavía"). Esta versión completa
    // (con before=null incluido) alimenta detectRoadmapAdvances() más
    // abajo; tierUps (la tarjeta que ve el usuario) filtra el before=null
    // por separado, ver ahí el porqué.
    const ratingChanges = new Map<string, { before: Rating | null; after: Rating }>();

    for (const exerciseId of exerciseIds) {
      const exercise = await this.exerciseLibrary.getById(exerciseId);
      if (!exercise) continue; // catálogo inconsistente — no debería pasar, se salta en vez de romper la pantalla (mismo criterio que RoadmapService)

      const allLogs = await this.workoutLog.getForExercise(exerciseId);
      const beforeLogs = allLogs.filter((l) => l.sessionId !== sessionId);
      const beforeBest = beforeLogs.length
        ? beforeLogs.reduce((best, l) => (effectiveValue(l) > effectiveValue(best) ? l : best))
        : null;
      const afterBest = await this.workoutLog.getBestLog(exerciseId); // ya incluye esta sesión, que ya quedó guardada antes de llamar acá

      if (afterBest && afterBest.sessionId === sessionId && (!beforeBest || effectiveValue(afterBest) > effectiveValue(beforeBest))) {
        prs.push({ exercise, value: afterBest.value, previousValue: beforeBest?.value ?? null });
      }

      const beforeRating = beforeBest ? this.ratingCalc.ratingForEffectiveValue(effectiveValue(beforeBest), exercise.ratingThresholds) : null;
      const afterRating = afterBest ? this.ratingCalc.ratingForEffectiveValue(effectiveValue(afterBest), exercise.ratingThresholds) : null;
      if (afterRating && (beforeRating === null || RATING_ORDER.indexOf(afterRating) > RATING_ORDER.indexOf(beforeRating))) {
        ratingChanges.set(exerciseId, { before: beforeRating, after: afterRating });
      }
    }

    const tierUps: TierUpAchievement[] = [];
    for (const [exerciseId, change] of ratingChanges) {
      // El primer registro de un ejercicio ya se cuenta como récord arriba
      // — mostrar TAMBIÉN "subiste a Bronze" para el mismo evento sería
      // ruido, no una segunda noticia real (ver PrAchievement).
      if (change.before === null) continue;
      const exercise = await this.exerciseLibrary.getById(exerciseId);
      if (exercise) tierUps.push({ exercise, fromRating: change.before, toRating: change.after });
    }

    const { roadmapStepsUnlocked, roadmapTargetsReached } = await this.detectRoadmapAdvances(ratingChanges);
    const weeklySessionCount = await this.workoutSession.getWeeklySessionCount();

    const durationMinutes = session.endedAt
      ? Math.max(0, Math.round((new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 60000))
      : 0;

    return {
      session,
      durationMinutes,
      exerciseCount: exerciseIds.length,
      setCount: logs.length,
      weeklySessionCount,
      prs,
      tierUps,
      roadmapStepsUnlocked,
      roadmapTargetsReached,
      hasAchievements: prs.length > 0 || tierUps.length > 0 || roadmapStepsUnlocked.length > 0 || roadmapTargetsReached.length > 0,
    };
  }

  /**
   * Cruza los ejercicios que cambiaron de rating HOY (ratingChanges,
   * incluye before=null a propósito — ver el comentario ahí) contra cada
   * roadmap que los use como paso previo a otro. Reusa EXACTAMENTE la
   * misma regla de desbloqueo que RoadmapService.getRoadmapDetail() (el
   * rating del paso ANTERIOR cruza minRatingRequired del paso siguiente,
   * ver ese archivo) en vez de reimplementarla — solo la evalúa dos veces
   * (antes/después) para los pasos afectados, no para el roadmap entero.
   *
   * detail.steps ya incluye el nodo objetivo como última entrada (con
   * minRatingRequired = targetRatingRequired, ver RoadmapService), así que
   * el mismo walk sirve para "se desbloqueó el siguiente paso" y "se
   * alcanzó el objetivo" sin un caso aparte — isTarget en esa última
   * entrada es lo único que distingue a cuál de las dos listas va.
   */
  private async detectRoadmapAdvances(
    ratingChanges: Map<string, { before: Rating | null; after: Rating }>,
  ): Promise<{ roadmapStepsUnlocked: RoadmapStepUnlockedAchievement[]; roadmapTargetsReached: RoadmapTargetReachedAchievement[] }> {
    const roadmapStepsUnlocked: RoadmapStepUnlockedAchievement[] = [];
    const roadmapTargetsReached: RoadmapTargetReachedAchievement[] = [];
    if (!ratingChanges.size) return { roadmapStepsUnlocked, roadmapTargetsReached };

    const summaries = await this.roadmapService.getAllRoadmaps();
    for (const summary of summaries) {
      const detail = await this.roadmapService.getRoadmapDetail(summary.roadmap.id);
      if (!detail) continue;

      for (let i = 1; i < detail.steps.length; i++) {
        const prevExercise = detail.steps[i - 1].exercise;
        const change = ratingChanges.get(prevExercise.id);
        if (!change) continue; // el paso anterior no cambió de rating hoy — no puede haber desbloqueado nada acá

        const required = detail.steps[i].minRatingRequired;
        if (!required) continue; // solo el paso 1 puede tener esto en null, y el paso 1 siempre está desbloqueado

        const metBefore = change.before !== null && this.ratingCalc.meetsOrExceeds(change.before, required);
        const metAfter = this.ratingCalc.meetsOrExceeds(change.after, required);
        if (metBefore || !metAfter) continue; // no cruzó el umbral justo con este cambio de hoy

        if (detail.steps[i].isTarget) {
          roadmapTargetsReached.push({ roadmap: detail.roadmap, targetExercise: detail.steps[i].exercise });
        } else {
          roadmapStepsUnlocked.push({ roadmap: detail.roadmap, exercise: detail.steps[i].exercise });
        }
      }
    }
    return { roadmapStepsUnlocked, roadmapTargetsReached };
  }
}
