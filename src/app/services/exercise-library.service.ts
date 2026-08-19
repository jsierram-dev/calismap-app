import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { Exercise, ExerciseCategory, Level, MuscleGroup, RatingThresholds, RepUnit } from '../models/exercise.model';
import { PaginatedResult } from '../models/pagination.model';
import { LocalCollection } from '../core/utils/local-collection';
import { markDeleted, newId, touch } from '../core/utils/sync-meta';
import { I18nService } from '../core/services/i18n.service';
import { LocalStorageService } from '../core/services/local-storage.service';
import { SyncService } from '../core/services/sync.service';

const KEY = 'calismap_exercises'; // catálogo + propios, mezclados — ver comentario de clase
// Tope por página — espejo de MAX_PAGE_SIZE en el backend (ver
// calismap-back/src/shared/pagination.ts), mismo criterio que RoadmapService.
const PAGE_SIZE = 10;

export interface ExerciseFilters {
  search?: string;
  category?: ExerciseCategory;
  level?: Level;
  muscleGroups?: MuscleGroup[];
  ownOnly?: boolean;
}

export type OwnExerciseInput = Pick<
  Exercise,
  | 'name'
  | 'description'
  | 'level'
  | 'category'
  | 'muscleGroups'
  | 'steps'
  | 'repUnit'
  | 'ratingThresholds'
  | 'photoId'
  | 'videoId'
>;

// Body de POST/PUT /exercises (admin, catálogo) — ver
// calismap-back/src/modules/exercises/types.ts (ExerciseInput). No incluye
// userId ni id: el backend nunca deja setearlos por acá (ver
// exercises/repository.ts, create()/update() — user_id NULL siempre en esta
// vía, guardrail explícito).
export interface AdminExerciseInput {
  name: string;
  description?: string;
  level: Level;
  category: ExerciseCategory;
  muscleGroups: MuscleGroup[];
  steps: string[];
  repUnit: RepUnit;
  ratingThresholds: RatingThresholds;
  videoUrl?: string;
  regressionExerciseId?: string;
  // Blob subido (PUT /photos/:id), distinto de videoUrl (link externo ya
  // hosteado) — hallazgo #6 de pruebas reales en móvil, ver
  // ROADMAP-calismap.md. Un admin puede cargar cualquiera de los dos, no
  // son excluyentes entre sí en el modelo.
  photoId?: string;
  videoId?: string;
}

/**
 * Un solo almacén local para todo lo que la Biblioteca necesita mostrar:
 * catálogo admin-curado (userId ausente, pull-and-cache vía GET /exercises,
 * refresco por MERGE — nunca reemplazo ciego, para no perder un ejercicio
 * propio recién creado offline que todavía no sincronizó) + ejercicios
 * PROPIOS del usuario (userId presente, local-first + sync real vía /sync,
 * ver ROADMAP-calismap.md "Ejercicios personalizados").
 *
 * Simplificación aceptada para v1: si el catálogo borra un ejercicio del
 * lado del servidor, el merge por id no lo saca de acá — no hay tombstone
 * para el catálogo (a diferencia de lo propio, que sí usa deletedAt). Caso
 * raro (solo admin) y de bajo impacto; se resuelve con un refresh completo
 * si hiciera falta más adelante.
 */
@Injectable({ providedIn: 'root' })
export class ExerciseLibraryService {
  private collection: LocalCollection<Exercise>;

  constructor(
    private http: HttpClient,
    storage: LocalStorageService,
    private sync: SyncService,
    private i18n: I18nService,
  ) {
    this.collection = new LocalCollection<Exercise>(storage, KEY);
    this.sync.registerExercises({
      // Solo la mitad PROPIA viaja por /sync — el catálogo es admin-only,
      // pull-and-cache aparte (ver refreshCatalog()).
      getAllForSync: async () => {
        const all = await this.collection.getAll();
        return all.filter((e) => !!e.userId);
      },
      applyUpdates: (updates) => this.collection.applyUpdates(updates),
    });
  }

  // ─── Lectura para la Biblioteca ──────────────────────────────────────────
  async getAll(filters: ExerciseFilters = {}): Promise<Exercise[]> {
    await this.ensureCatalogLoaded();
    const all = await this.collection.getAll();
    return all.filter((e) => {
      if (e.deletedAt) return false;
      if (filters.ownOnly && !e.userId) return false;
      if (filters.search && !e.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
      if (filters.category && e.category !== filters.category) return false;
      if (filters.level && e.level !== filters.level) return false;
      if (filters.muscleGroups?.length && !e.muscleGroups.some((m) => filters.muscleGroups!.includes(m))) return false;
      return true;
    });
  }

  async getById(id: string): Promise<Exercise | null> {
    await this.ensureCatalogLoaded();
    return this.collection.getById(id);
  }

  // ─── Escritura — SOLO ejercicios propios (el catálogo es admin-only) ────
  async createOwn(input: OwnExerciseInput, userId: string): Promise<Exercise> {
    const exercise: Exercise = touch({
      id: newId(),
      ...input,
      // Un ejercicio propio no tiene traducción real posible — los tres
      // campos de nombre son el mismo valor tal cual lo tipeó el usuario
      // (ver el comentario de estos campos en models/exercise.model.ts).
      nameSpanish: input.name,
      nameEnglish: input.name,
      userId,
      updatedAt: '',
      deletedAt: null,
    });
    await this.collection.upsert(exercise);
    return exercise;
  }

  async deleteOwn(id: string): Promise<void> {
    const exercise = await this.collection.getById(id);
    if (!exercise || !exercise.userId) return; // guardrail — nunca borra catálogo desde acá
    await this.collection.upsert(markDeleted(exercise));
  }

  // Faltaba (19/08/2026, pedido explícito del usuario: "botones de editar y
  // eliminar ejercicios... creados por el usuario") — createOwn/deleteOwn ya
  // existían, esto cierra el CRUD de lo propio. Mismo guardrail que
  // deleteOwn: nunca toca una fila de catálogo (userId ausente) aunque
  // alguien llegue acá con un id de catálogo a mano (ej. URL escrita
  // directo). nameSpanish/nameEnglish se pisan junto con name — un
  // ejercicio propio no tiene traducción real, los tres siguen siendo el
  // mismo valor tal cual lo escribió el usuario (mismo criterio que
  // createOwn).
  async updateOwn(id: string, patch: Partial<OwnExerciseInput>): Promise<Exercise | null> {
    const existing = await this.collection.getById(id);
    if (!existing || !existing.userId) return null;
    const updated: Exercise = touch({
      ...existing,
      ...patch,
      nameSpanish: patch.name ?? existing.nameSpanish,
      nameEnglish: patch.name ?? existing.nameEnglish,
    });
    await this.collection.upsert(updated);
    return updated;
  }

  // ─── Pull-and-cache del catálogo ─────────────────────────────────────────
  // Guarda la PROMESA en vuelo, no un booleano — encontrado el 16/08/2026
  // armando el panel de admin: getAllRoadmaps() dispara varias llamadas a
  // getById()/getAll() EN PARALELO (Promise.all sobre los roadmaps, cada
  // uno resolviendo su ejercicio objetivo + los de cada paso). Con un
  // booleano, la primera llamada marcaba catalogLoaded=true de forma
  // síncrona y recién DESPUÉS empezaba a esperar el fetch — cualquier
  // llamada concurrente que llegara en el mismo tick (todas, en ese
  // Promise.all) veía el flag ya en true y seguía de largo contra una
  // colección todavía vacía, devolviendo null. Con el catálogo real ya
  // sembrado, esto hacía que Roadmaps mostrara 0 rutas en el primer arranque
  // frío de un usuario nuevo (se autocorregía en la siguiente visita, una
  // vez poblada la colección — por eso no se notaba navegando de a una
  // pantalla por vez). Guardando la promesa, todos los llamadores
  // concurrentes esperan el MISMO fetch en vez de carrerear contra él.
  private catalogLoadPromise: Promise<void> | null = null;

  private ensureCatalogLoaded(): Promise<void> {
    if (!this.catalogLoadPromise) {
      this.catalogLoadPromise = this.refreshCatalog().catch(() => {
        // Offline en el primer arranque — se sigue con lo que ya haya en el device (o vacío), no es fatal.
        // Sin catch acá, un fallo dejaría catalogLoadPromise resuelto en rechazo para siempre — un reintento
        // más adelante (ej. reconexión) nunca podría volver a intentarlo.
        this.catalogLoadPromise = null;
      });
    }
    return this.catalogLoadPromise;
  }

  /**
   * Público — para un futuro pull-to-refresh en la Biblioteca (paso 6), y
   * para SettingsPage cuando el usuario cambia de idioma (17/08/2026, ver
   * ROADMAP-calismap.md "Traducciones") — a diferencia de CatalogCache,
   * esto SIEMPRE refetchea al llamarse (sin promesa memoizada de por
   * vida), así que alcanza con volver a llamarlo con el idioma nuevo para
   * que el catálogo ya visible se actualice, sin necesitar un método de
   * invalidación aparte.
   */
  async refreshCatalog(): Promise<void> {
    await this.fetchAllExercisesPaged();
  }

  private exercisesUrl(page: number): string {
    const base = `${environment.apiUrl}/exercises?page=${page}&pageSize=${PAGE_SIZE}`;
    return this.i18n.lang() === 'en' ? `${base}&lang=en` : base;
  }

  /**
   * Paginado (18/08/2026, ver ROADMAP-calismap.md "Paginación del
   * catálogo") — antes un solo GET /exercises sin límite. Ahora se pagina de
   * a PAGE_SIZE y cada página se aplica (merge por id, applyUpdates) a
   * medida que llega, sin esperar a juntar el catálogo entero en memoria
   * primero. Sigue trayendo TODO el catálogo igual (no solo lo que la
   * Biblioteca muestra de entrada) porque RoadmapService.getRoadmapDetail()
   * necesita poder resolver CUALQUIER ejercicio de CUALQUIER paso de
   * CUALQUIER roadmap sin importar si el usuario ya scrolleó hasta ahí en
   * la Biblioteca (ver el mismo razonamiento en
   * RoadmapService.fetchAllRoadmapsPaged()). Lo que cambia es que ningún
   * pedido de red individual crece sin límite con el catálogo — y es
   * LibraryPage quien decide cuánto de lo ya cargado MUESTRA de entrada
   * (ver visibleCount en ese archivo), no esta capa.
   */
  private async fetchAllExercisesPaged(): Promise<void> {
    let page = 1;
    let loaded = 0;
    // Tope defensivo (500 ejercicios) — mismo criterio que RoadmapService,
    // solo evita un loop infinito si el backend devolviera un total inconsistente.
    while (page <= 50) {
      const result = await firstValueFrom(this.http.get<PaginatedResult<Exercise>>(this.exercisesUrl(page)));
      await this.collection.applyUpdates(result.items); // merge por id — nunca pisa un ejercicio propio sin sincronizar todavía
      loaded += result.items.length;
      if (result.items.length < result.pageSize || loaded >= result.total) break;
      page++;
    }
  }

  // ─── Escritura de CATÁLOGO — solo admin, ver core/guards/admin.guard.ts.
  //     Pasa por POST/PUT/DELETE /exercises (requireAdmin en el backend,
  //     rechaza con 403 a cualquier otro), a diferencia de createOwn/
  //     deleteOwn de arriba que van por /sync. refreshCatalog() al final de
  //     cada escritura para que la Biblioteca (y este mismo panel) vean el
  //     cambio sin esperar el próximo refresh en background. ──────────────
  async adminCreate(input: AdminExerciseInput): Promise<Exercise> {
    const created = await firstValueFrom(this.http.post<Exercise>(`${environment.apiUrl}/exercises`, input));
    await this.refreshCatalog();
    return created;
  }

  async adminUpdate(id: string, input: Partial<AdminExerciseInput>): Promise<Exercise> {
    const updated = await firstValueFrom(this.http.put<Exercise>(`${environment.apiUrl}/exercises/${id}`, input));
    await this.refreshCatalog();
    return updated;
  }

  async adminDelete(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${environment.apiUrl}/exercises/${id}`));
    await this.refreshCatalog();
  }
}
