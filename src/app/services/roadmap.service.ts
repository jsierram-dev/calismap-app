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
import { I18nService } from '../core/services/i18n.service';
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
 * entrenamiento vs. ruta de evolución").
 *
 * El detalle de cada roadmap SÍ se cachea en memoria por id (corregido
 * 16/08/2026 — hallazgo real: "a veces tarda mucho en cargar los ejercicios
 * de un roadmap", ver ROADMAP-calismap.md). La decisión original decía lo
 * contrario ("el catálogo es chico, no vale la pena otra capa de cache") —
 * medido con datos reales, `GET /roadmaps/:id` solo (sin nada del
 * procesamiento local) tarda 250-900ms bien variable: es Neon (arranque en
 * frío del compute serverless tras inactividad + latencia de red), no el
 * procesamiento de esta app. La lista de pasos/umbrales de un roadmap
 * prácticamente nunca cambia para un usuario normal (solo un admin la
 * edita) — cachearla es seguro. Con el precalentamiento que ya hace
 * app.config.ts al arrancar (getAllRoadmaps() de los 6 roadmaps), esto dej
 * cada detalle tibio ANTES de que el usuario llegue a tocarlo — entrar a un
 * roadmap se siente instantáneo, el costo de red ya se pagó durante el
 * splash. Solo en memoria (no localStorage): sobrevive la sesión de la
 * pestaña, no hace falta más para el problema real reportado.
 */
@Injectable({ providedIn: 'root' })
export class RoadmapService {
  private listCache: CatalogCache<Roadmap>;
  private detailCache = new Map<string, RoadmapDetailDto>();
  private detailLoadPromises = new Map<string, Promise<RoadmapDetailDto | null>>();

  constructor(
    private http: HttpClient,
    storage: LocalStorageService,
    private exerciseLibrary: ExerciseLibraryService,
    private workoutLog: WorkoutLogService,
    private ratingCalc: RatingCalculatorService,
    private userProfile: UserProfileService,
    private i18n: I18nService,
  ) {
    // URL como función, no string fijo (17/08/2026, ver ROADMAP-calismap.md
    // "Traducciones") — se resuelve recién en cada fetch real, así que lee
    // el idioma vigente EN ESE MOMENTO (i18n.lang() puede cambiar después de
    // construido este servicio, ver setLanguageAndRefreshCatalog() en
    // SettingsPage) en vez del que hubiera al arrancar la app.
    this.listCache = new CatalogCache<Roadmap>(http, storage, LIST_KEY, () => this.roadmapsUrl());
  }

  private roadmapsUrl(): string {
    return this.i18n.lang() === 'en' ? `${environment.apiUrl}/roadmaps?lang=en` : `${environment.apiUrl}/roadmaps`;
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

  // Cambiar el idioma en Ajustes (17/08/2026, ver ROADMAP-calismap.md
  // "Traducciones") no alcanza solo con que roadmapsUrl()/fetchDetail()
  // lean i18n.lang() en el próximo fetch — el catálogo ya está cacheado
  // (en memoria acá, y en localStorage dentro de CatalogCache) con el texto
  // del idioma VIEJO. SettingsPage.setLanguage() llama a esto para que el
  // contenido ya visible se actualice sin esperar un refresh natural (que
  // podría tardar mucho, ver CatalogCache — solo refetchea si nunca se
  // pidió antes en esta pestaña).
  invalidateForLanguageChange(): void {
    this.detailCache.clear();
    this.listCache.refresh();
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
    this.detailCache.delete(id); // sin esto, el propio admin seguiría viendo su versión vieja hasta recargar la app
    await this.listCache.refresh();
    return updated;
  }

  async adminDelete(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${environment.apiUrl}/roadmaps/${id}`));
    this.detailCache.delete(id);
    await this.listCache.refresh();
  }

  async adminAddStep(roadmapId: string, input: RoadmapExerciseInput): Promise<RoadmapExercise> {
    const step = await firstValueFrom(this.http.post<RoadmapExercise>(`${environment.apiUrl}/roadmaps/${roadmapId}/steps`, input));
    this.detailCache.delete(roadmapId);
    return step;
  }

  async adminDeleteStep(roadmapId: string, stepId: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${environment.apiUrl}/roadmaps/${roadmapId}/steps/${stepId}`));
    this.detailCache.delete(roadmapId);
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
    if (!step) return this.i18n.t('roadmapService.routeComplete');
    if (step.bestValue === null) return this.i18n.t('roadmapService.registerFirst', { name: step.exercise.name });

    const currentIndex = RATING_ORDER.indexOf(step.rating ?? 'BRONZE');
    const nextRating = RATING_ORDER[currentIndex + 1];
    if (!nextRating) return this.i18n.t('roadmapService.bestLevel', { name: step.exercise.name });

    const bodyWeightKg = this.userProfile.getBodyWeightKg();
    const needed = this.ratingCalc.valueNeededFor(nextRating, bodyWeightKg, step.exercise.ratingThresholds);
    const remaining = needed - step.bestValue;
    const unit = this.i18n.t(step.exercise.repUnit === 'reps' ? 'enums.unit.reps' : 'enums.unit.seconds');
    const nextLabel = nextRating.charAt(0) + nextRating.slice(1).toLowerCase();

    if (remaining <= 0) return this.i18n.t('roadmapService.canAdvance', { name: step.exercise.name });
    return this.i18n.t('roadmapService.remaining', { name: step.exercise.name, remaining, unit, tier: nextLabel });
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
    const cached = this.detailCache.get(roadmapId);
    if (cached) return cached;

    // Promesa en vuelo compartida (mismo patrón que CatalogCache.getAll/
    // ExerciseLibraryService.ensureCatalogLoaded) — getAllRoadmaps() pide
    // los 6 roadmaps en paralelo, y puede pedirse dos veces casi juntas
    // (precalentamiento del arranque + ngOnInit de RoadmapsPage) — sin
    // esto, ambas llamadas dispararían su propio GET /roadmaps/:id en vez
    // de esperar el mismo pedido.
    let promise = this.detailLoadPromises.get(roadmapId);
    if (!promise) {
      const url = this.i18n.lang() === 'en' ? `${environment.apiUrl}/roadmaps/${roadmapId}?lang=en` : `${environment.apiUrl}/roadmaps/${roadmapId}`;
      promise = firstValueFrom(this.http.get<RoadmapDetailDto>(url))
        .then((detail) => {
          this.detailCache.set(roadmapId, detail);
          return detail;
        })
        .catch(() => null)
        .finally(() => this.detailLoadPromises.delete(roadmapId));
      this.detailLoadPromises.set(roadmapId, promise);
    }
    return promise;
  }
}
