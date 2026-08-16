import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { Exercise, ExerciseCategory, RATING_ORDER, Rating } from '../models/exercise.model';
import {
  Roadmap,
  RoadmapDetailRaw,
  RoadmapDetailViewModel,
  RoadmapExercise,
  RoadmapExerciseInput,
  RoadmapInput,
  RoadmapStepViewModel,
} from '../models/roadmap.model';
import { effectiveValue } from '../models/workout-log.model';
import { CatalogCache } from '../core/utils/catalog-cache';
import { LocalStorageService } from '../core/services/local-storage.service';
import { ExerciseLibraryService } from './exercise-library.service';
import { RatingCalculatorService } from './rating-calculator.service';
import { UserProfileService } from './user-profile.service';
import { WorkoutLogService } from './workout-log.service';

const LIST_KEY = 'calismap_roadmaps';

interface RoadmapDetailDto extends Roadmap {
  steps: RoadmapExercise[];
}

export interface RoadmapSummary {
  roadmap: Roadmap;
  targetExercise: Exercise;
  completedCount: number;
  totalCount: number;
  // Texto tipo "coach note" para la tarjeta de la pantalla 01 (ver
  // ROADMAP-calismap.md, "coach note con el cálculo real, no texto
  // genérico") — sobre el paso actual (primero sin completar), o un mensaje
  // de ruta terminada si no queda ninguno.
  cardNote: string;
}

/**
 * Catálogo (Roadmap/RoadmapExercise, admin-curado, pull-and-cache) +
 * historial real (WorkoutLog, local-first) combinados para derivar el
 * estado de cada paso — reemplaza por completo la versión anterior con
 * arrays mock y UserExerciseService (ver ROADMAP-calismap.md, "Sesiones de
 * entrenamiento vs. ruta de evolución"). El detalle de cada roadmap (con
 * pasos) se pide fresco cada vez: el catálogo es chico (contenido real
 * cerrado, ver COMPONENTES-calismap.md) así que no vale la pena otra capa
 * de cache por id acá.
 */
@Injectable({ providedIn: 'root' })
export class RoadmapService {
  private listCache: CatalogCache<Roadmap>;

  constructor(
    private http: HttpClient,
    storage: LocalStorageService,
    private exerciseLibrary: ExerciseLibraryService,
    private workoutLog: WorkoutLogService,
    private ratingCalc: RatingCalculatorService,
    private userProfile: UserProfileService,
  ) {
    this.listCache = new CatalogCache<Roadmap>(http, storage, LIST_KEY, `${environment.apiUrl}/roadmaps`);
  }

  async getAllRoadmaps(): Promise<RoadmapSummary[]> {
    const roadmaps = await this.listCache.getAll();
    const summaries = await Promise.all(roadmaps.map((roadmap) => this.buildSummary(roadmap)));
    return summaries.filter((s): s is RoadmapSummary => s !== null);
  }

  async getRoadmapDetail(roadmapId: string): Promise<RoadmapDetailViewModel | null> {
    const detail = await this.fetchDetail(roadmapId);
    if (!detail) return null;

    const targetExercise = await this.exerciseLibrary.getById(detail.targetExerciseId);
    if (!targetExercise) return null;

    const steps = [...detail.steps].sort((a, b) => a.stepOrder - b.stepOrder);
    const stepViewModels: RoadmapStepViewModel[] = [];

    for (let index = 0; index < steps.length; index++) {
      const step = steps[index];
      const exercise = await this.exerciseLibrary.getById(step.exerciseId);
      if (!exercise) continue; // catálogo inconsistente — no debería pasar, se salta en vez de romper la pantalla

      const rating = await this.getCurrentRating(step.exerciseId);
      const bestLog = await this.workoutLog.getBestLog(step.exerciseId);

      // Desbloqueado si es el paso 1 (sin minRatingRequired) o si el rating
      // actual del paso ANTERIOR alcanza el mínimo pedido.
      let isUnlocked = step.minRatingRequired === null;
      if (!isUnlocked && index > 0) {
        const prevRating = await this.getCurrentRating(steps[index - 1].exerciseId);
        if (prevRating && step.minRatingRequired) {
          isUnlocked = this.ratingCalc.meetsOrExceeds(prevRating, step.minRatingRequired);
        }
      }

      stepViewModels.push({
        stepOrder: step.stepOrder,
        exercise,
        isTarget: false,
        isUnlocked,
        isCompleted: rating !== null,
        rating,
        bestValue: bestLog?.value ?? null,
        minRatingRequired: step.minRatingRequired,
      });
    }

    // El nodo objetivo se agrega al final — desbloquea cuando el último paso
    // llega a Roadmap.targetRatingRequired (dato de catálogo, default GOLD —
    // NO un 'GOLD' hardcodeado, ver ROADMAP-calismap.md "quinta pasada").
    const lastStep = steps[steps.length - 1];
    const lastRating = lastStep ? await this.getCurrentRating(lastStep.exerciseId) : null;
    const goalUnlocked = lastRating ? this.ratingCalc.meetsOrExceeds(lastRating, detail.targetRatingRequired) : false;
    const goalRating = await this.getCurrentRating(detail.targetExerciseId);
    const goalBestLog = await this.workoutLog.getBestLog(detail.targetExerciseId);

    stepViewModels.push({
      stepOrder: steps.length + 1,
      exercise: targetExercise,
      isTarget: true,
      isUnlocked: goalUnlocked,
      isCompleted: goalRating !== null,
      rating: goalRating,
      bestValue: goalBestLog?.value ?? null,
      minRatingRequired: detail.targetRatingRequired,
    });

    const completedCount = stepViewModels.filter((s) => s.isCompleted && !s.isTarget).length;

    return { roadmap: detail, targetExercise, steps: stepViewModels, completedCount, totalCount: steps.length };
  }

  async getExerciseById(id: string): Promise<Exercise | null> {
    return this.exerciseLibrary.getById(id);
  }

  async getAllCategories(): Promise<ExerciseCategory[]> {
    const roadmaps = await this.listCache.getAll();
    return Array.from(new Set(roadmaps.map((r) => r.category)));
  }

  // ─── Escritura de CATÁLOGO — solo admin, ver core/guards/admin.guard.ts.
  //     RoadmapManagementComponent llama a esto directo (no pasa por la
  //     vista enriquecida de getRoadmapDetail — acá solo hace falta el dato
  //     crudo). refresh() del listCache al final de cada escritura para que
  //     Roadmaps/el propio panel vean el cambio sin esperar el próximo pull
  //     en background. ─────────────────────────────────────────────────────
  async adminGetRaw(roadmapId: string): Promise<RoadmapDetailRaw | null> {
    try {
      return await firstValueFrom(this.http.get<RoadmapDetailRaw>(`${environment.apiUrl}/roadmaps/${roadmapId}`));
    } catch {
      return null;
    }
  }

  async adminCreate(input: RoadmapInput): Promise<Roadmap> {
    const created = await firstValueFrom(this.http.post<Roadmap>(`${environment.apiUrl}/roadmaps`, input));
    await this.listCache.refresh();
    return created;
  }

  async adminUpdate(id: string, input: Partial<RoadmapInput>): Promise<Roadmap> {
    const updated = await firstValueFrom(this.http.put<Roadmap>(`${environment.apiUrl}/roadmaps/${id}`, input));
    await this.listCache.refresh();
    return updated;
  }

  async adminDelete(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${environment.apiUrl}/roadmaps/${id}`));
    await this.listCache.refresh();
  }

  async adminAddStep(roadmapId: string, input: RoadmapExerciseInput): Promise<RoadmapExercise> {
    return firstValueFrom(this.http.post<RoadmapExercise>(`${environment.apiUrl}/roadmaps/${roadmapId}/steps`, input));
  }

  async adminDeleteStep(roadmapId: string, stepId: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${environment.apiUrl}/roadmaps/${roadmapId}/steps/${stepId}`));
  }

  // Reemplaza TODOS los pasos de un roadmap por la lista nueva (borra los
  // viejos, crea los nuevos en el orden dado) — más simple y robusto que
  // diffear qué paso cambió de cuál, aceptable para un panel de admin donde
  // "Guardar" siempre manda la lista completa (mismo criterio que
  // mergeListLastWriteWins en el resto de la app: la unidad que se
  // sincroniza/reemplaza es la lista entera, no cada fila suelta).
  async adminReplaceSteps(
    roadmapId: string,
    currentStepIds: string[],
    newSteps: RoadmapExerciseInput[],
  ): Promise<void> {
    for (const stepId of currentStepIds) {
      await this.adminDeleteStep(roadmapId, stepId);
    }
    for (const step of newSteps) {
      await this.adminAddStep(roadmapId, step);
    }
  }

  private async buildSummary(roadmap: Roadmap): Promise<RoadmapSummary | null> {
    const detail = await this.getRoadmapDetail(roadmap.id);
    if (!detail) return null; // catálogo inconsistente — no debería pasar con contenido real cerrado, se omite en vez de romper la pantalla

    const currentStep = detail.steps.find((s) => !s.isCompleted) ?? null;
    const cardNote = this.buildCardNote(currentStep);

    return {
      roadmap: detail.roadmap,
      targetExercise: detail.targetExercise,
      completedCount: detail.completedCount,
      totalCount: detail.totalCount,
      cardNote,
    };
  }

  /** Coach note real para la tarjeta de la pantalla 01 — sobre el primer paso sin completar. */
  private buildCardNote(step: RoadmapStepViewModel | null): string {
    if (!step) return '¡Completaste esta ruta!';
    if (step.bestValue === null) return `${step.exercise.name}: registrá tu primera marca`;

    const currentIndex = RATING_ORDER.indexOf(step.rating ?? 'BRONZE');
    const nextRating = RATING_ORDER[currentIndex + 1];
    if (!nextRating) return `${step.exercise.name}: ¡en tu mejor nivel!`;

    const bodyWeightKg = this.userProfile.getBodyWeightKg();
    const needed = this.ratingCalc.valueNeededFor(nextRating, bodyWeightKg, step.exercise.ratingThresholds);
    const remaining = needed - step.bestValue;
    const unit = step.exercise.repUnit === 'reps' ? 'reps' : 'seg';
    const nextLabel = nextRating.charAt(0) + nextRating.slice(1).toLowerCase();

    if (remaining <= 0) return `${step.exercise.name}: ¡ya podés avanzar al siguiente paso!`;
    return `${step.exercise.name}: te faltan ${remaining} ${unit} para ${nextLabel}`;
  }

  /** Rating actual del usuario en un ejercicio — derivado de la MEJOR marca histórica (ver workout-log.service.ts, getBestLog), nunca recalculado con datos de hoy. null = sin ninguna marca todavía. */
  private async getCurrentRating(exerciseId: string): Promise<Rating | null> {
    const bestLog = await this.workoutLog.getBestLog(exerciseId);
    if (!bestLog) return null;
    const exercise = await this.exerciseLibrary.getById(exerciseId);
    if (!exercise) return null;
    return this.ratingCalc.ratingForEffectiveValue(effectiveValue(bestLog), exercise.ratingThresholds);
  }

  private async fetchDetail(roadmapId: string): Promise<RoadmapDetailDto | null> {
    try {
      return await firstValueFrom(this.http.get<RoadmapDetailDto>(`${environment.apiUrl}/roadmaps/${roadmapId}`));
    } catch {
      return null;
    }
  }
}
