import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { Exercise, ExerciseCategory, Level, MuscleGroup } from '../models/exercise.model';
import { LocalCollection } from '../core/utils/local-collection';
import { markDeleted, newId, touch } from '../core/utils/sync-meta';
import { LocalStorageService } from '../core/services/local-storage.service';
import { SyncService } from '../core/services/sync.service';

const KEY = 'calismap_exercises'; // catálogo + propios, mezclados — ver comentario de clase

export interface ExerciseFilters {
  search?: string;
  category?: ExerciseCategory;
  level?: Level;
  muscleGroups?: MuscleGroup[];
  ownOnly?: boolean;
}

export type OwnExerciseInput = Pick<
  Exercise,
  'name' | 'description' | 'level' | 'category' | 'muscleGroups' | 'steps' | 'repUnit' | 'ratingThresholds' | 'photoId'
>;

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
  private catalogLoaded = false;

  constructor(
    private http: HttpClient,
    storage: LocalStorageService,
    private sync: SyncService,
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

  // ─── Pull-and-cache del catálogo ─────────────────────────────────────────
  private async ensureCatalogLoaded(): Promise<void> {
    if (this.catalogLoaded) return;
    this.catalogLoaded = true;
    try {
      await this.refreshCatalog();
    } catch {
      // Offline en el primer arranque — se sigue con lo que ya haya en el device (o vacío), no es fatal.
    }
  }

  /** Público — para un futuro pull-to-refresh en la Biblioteca (paso 6). */
  async refreshCatalog(): Promise<void> {
    const fresh = await firstValueFrom(this.http.get<Exercise[]>(`${environment.apiUrl}/exercises`));
    await this.collection.applyUpdates(fresh); // merge por id — nunca pisa un ejercicio propio sin sincronizar todavía
  }
}
