import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { Routine, RoutineDetail, RoutineExercise, RoutineExerciseInput, RoutineInput } from '../models/routine.model';
import { CatalogCache } from '../core/utils/catalog-cache';
import { LocalStorageService } from '../core/services/local-storage.service';

const LIST_KEY = 'calismap_routines';

/**
 * Catálogo puro admin-curado, pull-and-cache (ver CatalogCache) — a
 * diferencia de ExerciseLibraryService, acá no hay mitad propia que
 * proteger: una Routine nunca se crea/edita desde el dispositivo (eso es
 * UserRoutine, ver user-routine.service.ts), así que el reemplazo ciego de
 * CatalogCache es seguro. El detalle (con ejercicios) no se cachea aparte:
 * se pide fresco cada vez que se abre — es liviano y evita otra clave de
 * cache para invalidar.
 */
@Injectable({ providedIn: 'root' })
export class RoutineService {
  private listCache: CatalogCache<Routine>;

  constructor(
    private http: HttpClient,
    storage: LocalStorageService,
  ) {
    this.listCache = new CatalogCache<Routine>(http, storage, LIST_KEY, `${environment.apiUrl}/routines`);
  }

  async getAll(): Promise<Routine[]> {
    return this.listCache.getAll();
  }

  async getDetail(id: string): Promise<RoutineDetail | null> {
    try {
      return await firstValueFrom(this.http.get<RoutineDetail>(`${environment.apiUrl}/routines/${id}`));
    } catch {
      return null;
    }
  }

  // ─── Escritura de CATÁLOGO — solo admin, ver core/guards/admin.guard.ts.
  //     Mismo criterio que RoadmapService: adminReplaceExercises borra y
  //     recrea en vez de diffear, "Guardar" en el panel siempre manda la
  //     lista completa. ─────────────────────────────────────────────────────
  async adminCreate(input: RoutineInput): Promise<Routine> {
    const created = await firstValueFrom(this.http.post<Routine>(`${environment.apiUrl}/routines`, input));
    await this.listCache.refresh();
    return created;
  }

  async adminUpdate(id: string, input: Partial<RoutineInput>): Promise<Routine> {
    const updated = await firstValueFrom(this.http.put<Routine>(`${environment.apiUrl}/routines/${id}`, input));
    await this.listCache.refresh();
    return updated;
  }

  async adminDelete(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${environment.apiUrl}/routines/${id}`));
    await this.listCache.refresh();
  }

  async adminAddExercise(routineId: string, input: RoutineExerciseInput): Promise<RoutineExercise> {
    return firstValueFrom(this.http.post<RoutineExercise>(`${environment.apiUrl}/routines/${routineId}/exercises`, input));
  }

  async adminDeleteExercise(routineId: string, routineExerciseId: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${environment.apiUrl}/routines/${routineId}/exercises/${routineExerciseId}`));
  }

  async adminReplaceExercises(
    routineId: string,
    currentExerciseRowIds: string[],
    newExercises: RoutineExerciseInput[],
  ): Promise<void> {
    for (const rowId of currentExerciseRowIds) {
      await this.adminDeleteExercise(routineId, rowId);
    }
    for (const ex of newExercises) {
      await this.adminAddExercise(routineId, ex);
    }
  }
}
