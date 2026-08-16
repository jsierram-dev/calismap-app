import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LocalStorageService } from '../services/local-storage.service';

/**
 * Pull-and-cache genérico para catálogo admin-curado (Exercise sin userId,
 * Roadmap, Routine) — GET a la API, cachea local para tolerar estar offline.
 * Sin relación con LocalCollection<T> (eso es para entidades LOCAL-FIRST con
 * escritura propia — WorkoutSession/WorkoutLog/UserRoutine/Exercise propio);
 * acá el servidor siempre manda, el cliente nunca escribe de vuelta.
 *
 * NETWORK-FIRST, no cache-then-network (corregido 16/08/2026 — ver
 * ROADMAP-calismap.md, "Bug: catálogo no aparecía ni con doble recarga").
 * La versión anterior devolvía lo cacheado al toque si existía CUALQUIER
 * valor guardado y refrescaba recién, en segundo plano, sin que la pantalla
 * ya dibujada se enterara — un array vacío cacheado (`[]`, ej. de antes de
 * sembrar el catálogo, o de un fetch que falló una vez) es un valor
 * "truthy" en JS, así que `if (cached)` lo trataba como dato válido para
 * siempre: la pantalla se quedaba vacía indefinidamente, ni una recarga (ni
 * dos) lo arreglaban, porque cada carga volvía a leer el mismo `[]` viejo
 * antes de que el refresco de fondo llegara a pisarlo. Ahora: SIEMPRE se
 * espera el fetch de red primero (con guardado en memoria — mismo patrón
 * que ExerciseLibraryService.ensureCatalogLoaded — para que llamados
 * concurrentes esperen el mismo pedido en vez de dispararlo varias veces);
 * el caché local solo se usa como respaldo si ese fetch falla de verdad
 * (sin conexión), nunca como la fuente por default.
 */
export class CatalogCache<T> {
  private loadPromise: Promise<T[]> | null = null;

  constructor(
    private http: HttpClient,
    private storage: LocalStorageService,
    private key: string,
    private url: string,
  ) {}

  getAll(): Promise<T[]> {
    if (!this.loadPromise) {
      this.loadPromise = this.fetchAndCache().catch(async () => {
        this.loadPromise = null; // permite reintentar en el próximo getAll() (ej. se recuperó la conexión)
        const cached = await this.storage.get<T[]>(this.key);
        return cached ?? []; // sin red Y sin nada guardado todavía (primera vez, offline) — vacío es lo único honesto acá
      });
    }
    return this.loadPromise;
  }

  refresh(): Promise<T[]> {
    this.loadPromise = null;
    return this.getAll();
  }

  private async fetchAndCache(): Promise<T[]> {
    const data = await firstValueFrom(this.http.get<T[]>(this.url));
    await this.storage.set(this.key, data);
    return data;
  }
}
