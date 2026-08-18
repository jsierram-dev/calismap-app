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
import { PaginatedResult } from '../models/pagination.model';
import { I18nService } from '../core/services/i18n.service';
import { LocalStorageService } from '../core/services/local-storage.service';
import { ExerciseLibraryService } from './exercise-library.service';
import { RatingCalculatorService } from './rating-calculator.service';
import { UserProfileService } from './user-profile.service';
import { WorkoutLogService } from './workout-log.service';

// _v2 (18/08/2026, ver ROADMAP-calismap.md "Paginación del catálogo") — el
// shape guardado bajo esta key cambió (ver fetchAllRoadmapsPaged() más
// abajo), key nueva a propósito para que un dispositivo con el catálogo
// viejo ya cacheado (bajo la key vieja) no lo lea de vuelta con el shape
// equivocado; simplemente vuelve a pedirlo una vez, como si fuera la
// primera carga.
const LIST_KEY = 'calismap_roadmaps_v2';
// Tope por página — espejo de MAX_PAGE_SIZE en el backend (ver
// calismap-back/src/shared/pagination.ts). No hace falta importarlo de
// ahí (repos separados): si cambia de un lado, cambia del otro, no es un
// valor que vaya a divergir por accidente en el uso normal.
const PAGE_SIZE = 10;

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
  private detailCache = new Map<string, RoadmapDetailDto>();
  private detailLoadPromises = new Map<string, Promise<RoadmapDetailDto | null>>();
  // Promesa en vuelo del catálogo completo (páginas ya unidas) — mismo
  // patrón NETWORK-FIRST-con-fallback-a-caché que tenía CatalogCache, ver
  // fetchAllRoadmapsPaged()/getAllRoadmapsList() más abajo. Ya no usa
  // CatalogCache<Roadmap> (18/08/2026, ver ROADMAP-calismap.md "Paginación
  // del catálogo") porque el shape de GET /roadmaps cambió: ahora devuelve
  // {items, total, page, pageSize} en vez de un array plano, y cada item
  // trae sus pasos embebidos — CatalogCache asume siempre un array plano en
  // la URL, no encaja con eso.
  private roadmapsLoadPromise: Promise<Roadmap[]> | null = null;

  constructor(
    private http: HttpClient,
    private storage: LocalStorageService,
    private exerciseLibrary: ExerciseLibraryService,
    private workoutLog: WorkoutLogService,
    private ratingCalc: RatingCalculatorService,
    private userProfile: UserProfileService,
    private i18n: I18nService,
  ) {}

  private roadmapsUrl(page: number): string {
    const base = `${environment.apiUrl}/roadmaps?page=${page}&pageSize=${PAGE_SIZE}`;
    return this.i18n.lang() === 'en' ? `${base}&lang=en` : base;
  }

  async getAllRoadmaps(): Promise<RoadmapSummary[]> {
    const roadmaps = await this.getAllRoadmapsList();
    const summaries = await Promise.all(roadmaps.map((roadmap) => this.buildSummary(roadmap)));
    return summaries.filter((s): s is RoadmapSummary => s !== null);
  }

  private getAllRoadmapsList(): Promise<Roadmap[]> {
    if (!this.roadmapsLoadPromise) {
      this.roadmapsLoadPromise = this.fetchAllRoadmapsPaged().catch(async () => {
        this.roadmapsLoadPromise = null; // permite reintentar en el próximo llamado (ej. se recuperó la conexión)
        const cached = await this.storage.get<Roadmap[]>(LIST_KEY);
        return cached ?? []; // sin red Y sin nada guardado todavía (primera vez, offline) — vacío es lo único honesto acá
      });
    }
    return this.roadmapsLoadPromise;
  }

  /**
   * Trae TODO el catálogo paginando de a PAGE_SIZE (18/08/2026, ver
   * ROADMAP-calismap.md "Paginación del catálogo") — hallazgo real del
   * usuario: la pantalla de Roadmaps hacía un GET /roadmaps (liviano) y
   * DESPUÉS un GET /roadmaps/:id POR CADA roadmap para poder calcular el
   * progreso — N+1 de verdad, visible en la pestaña de Red. Ahora cada
   * página YA trae los pasos de cada roadmap embebidos (ver
   * calismap-back/src/modules/roadmaps/repository.ts, list()), así que acá
   * se van precargando en detailCache a medida que llegan: cuando
   * buildSummary() de abajo llame a getRoadmapDetail() -> fetchDetail() para
   * cada uno, ya lo va a encontrar cacheado y NO va a disparar ningún GET
   * /roadmaps/:id — eso es lo que elimina el N+1, sin duplicar acá ninguna
   * de las reglas de negocio que ya vive en getRoadmapDetail() (rating
   * actual, desbloqueo de pasos, cardNote…).
   *
   * El catálogo entero sigue trayéndose completo (no solo la primera
   * página) porque OTRAS partes de la app dependen de tenerlo entero
   * disponible localmente sin importar qué esté mostrando la pantalla de
   * Roadmaps en ese momento — ej. resolver el ejercicio de un paso
   * (ExerciseLibraryService.getById) para un roadmap que todavía no se
   * cargó en pantalla, o el panel de admin (AdminRoadmapsPage, que sigue
   * llamando a getAllRoadmaps() esperando la lista completa). Lo que sí
   * queda acotado es el tamaño de CADA pedido de red (máximo PAGE_SIZE),
   * en vez de un único GET sin límite que crece con el catálogo — y es
   * RoadmapsPage quien decide cuánto de esa lista ya cargada se MUESTRA de
   * entrada (ver visibleCount en ese archivo), no esta capa.
   */
  private async fetchAllRoadmapsPaged(): Promise<Roadmap[]> {
    const all: Roadmap[] = [];
    let page = 1;
    // Tope defensivo (500 roadmaps) — nunca debería alcanzarse con un
    // catálogo admin-curado, solo evita un loop infinito si el backend
    // devolviera un `total` inconsistente.
    while (page <= 50) {
      const result = await firstValueFrom(this.http.get<PaginatedResult<RoadmapDetailDto>>(this.roadmapsUrl(page)));
      for (const detail of result.items) {
        this.detailCache.set(detail.id, detail);
        all.push(detail);
      }
      if (result.items.length < result.pageSize || all.length >= result.total) break;
      page++;
    }
    await this.storage.set(LIST_KEY, all);
    return all;
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
    this.refreshRoadmapsList();
  }

  async getExerciseById(id: string): Promise<Exercise | null> {
    return this.exerciseLibrary.getById(id);
  }

  async getAllCategories(): Promise<ExerciseCategory[]> {
    const roadmaps = await this.getAllRoadmapsList();
    return Array.from(new Set(roadmaps.map((r) => r.category)));
  }

  // Fuerza un refetch completo del catálogo (todas las páginas de nuevo) —
  // usado después de cada escritura de admin y de un cambio de idioma, para
  // que la lista ya visible se actualice sin esperar el próximo getAllRoadmaps() natural.
  private refreshRoadmapsList(): Promise<Roadmap[]> {
    this.roadmapsLoadPromise = null;
    return this.getAllRoadmapsList();
  }

  // ─── Escritura de CATÁLOGO — solo admin, ver core/guards/admin.guard.ts.
  //     RoadmapManagementComponent llama a esto directo (no pasa por la
  //     vista enriquecida de getRoadmapDetail — acá solo hace falta el dato
  //     crudo). refreshRoadmapsList() al final de cada escritura para que
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
    await this.refreshRoadmapsList();
    return created;
  }

  async adminUpdate(id: string, input: Partial<RoadmapInput>): Promise<Roadmap> {
    const updated = await firstValueFrom(this.http.put<Roadmap>(`${environment.apiUrl}/roadmaps/${id}`, input));
    this.detailCache.delete(id); // sin esto, el propio admin seguiría viendo su versión vieja hasta recargar la app
    await this.refreshRoadmapsList();
    return updated;
  }

  async adminDelete(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${environment.apiUrl}/roadmaps/${id}`));
    this.detailCache.delete(id);
    await this.refreshRoadmapsList();
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
