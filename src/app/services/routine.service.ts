import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { Routine, RoutineDetail } from '../models/routine.model';
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
}
