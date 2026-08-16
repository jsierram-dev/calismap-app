import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LocalStorageService } from '../services/local-storage.service';

/**
 * Pull-and-cache genérico para catálogo admin-curado (Exercise sin userId,
 * Roadmap, Routine) — GET a la API, cachea local, sirve desde cache primero
 * (cache-then-network: devuelve lo cacheado al toque si existe y refresca en
 * segundo plano) para que la app abra instantáneo y offline-tolerante. Sin
 * relación con LocalCollection<T> (eso es para entidades LOCAL-FIRST con
 * escritura propia — WorkoutSession/WorkoutLog/UserRoutine/Exercise propio);
 * acá el servidor siempre manda, el cliente nunca escribe de vuelta.
 */
export class CatalogCache<T> {
  constructor(
    private http: HttpClient,
    private storage: LocalStorageService,
    private key: string,
    private url: string,
  ) {}

  async getAll(): Promise<T[]> {
    const cached = await this.storage.get<T[]>(this.key);
    if (cached) {
      this.refreshInBackground();
      return cached;
    }
    return this.fetchAndCache();
  }

  async refresh(): Promise<T[]> {
    return this.fetchAndCache();
  }

  private async fetchAndCache(): Promise<T[]> {
    const data = await firstValueFrom(this.http.get<T[]>(this.url));
    await this.storage.set(this.key, data);
    return data;
  }

  /** Best-effort — si falla (offline, etc.) la app se queda con lo ya cacheado, sin romper nada. */
  private refreshInBackground(): void {
    this.fetchAndCache().catch(() => {});
  }
}
