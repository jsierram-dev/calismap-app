import { LocalStorageService } from '../services/local-storage.service';

interface Identifiable {
  id: string;
}

/**
 * Colección local-first genérica sobre LocalStorageService — implementa
 * directo el contrato SyncCollection<T> de sync.service.ts (getAllForSync/
 * applyUpdates), así que un servicio de dominio solo tiene que envolver
 * esto y registrarse. Mismo motivo que EntityAdapter/ListLwwAdapter del
 * lado del back: evita repetir get/set/upsert-por-id en
 * WorkoutSessionService, WorkoutLogService, UserRoutineService y la mitad
 * "propia" de ExerciseLibraryService.
 *
 * Cache en memoria agregado el 16/08/2026 (hallazgo real: "a veces tarda
 * mucho en cargar los ejercicios de un roadmap", ver ROADMAP-calismap.md) —
 * antes CADA `getById`/`getAll` releía la colección ENTERA de IndexedDB
 * desde cero, sin memoizar nada. `RoadmapService.getRoadmapDetail()` hace
 * ~20 llamadas así (varias redundantes) por cada roadmap, todas
 * secuenciales — medido con Playwright simulando ~250 marcas acumuladas
 * (volumen realista de meses de uso real, no lo que junta una sesión de
 * pruebas con browser contexts siempre frescos): ~390-400ms consistentes
 * para el roadmap más largo, sobre localhost en desktop — peor en un
 * celular real. Con el cache: la PRIMERA llamada sigue pagando la lectura
 * real de IndexedDB, pero todas las siguientes (mismo `key`, misma
 * instancia — cada servicio de dominio es `providedIn: 'root'`, un único
 * `LocalCollection` por key en toda la vida de la app, no hay riesgo de
 * cache desincronizado entre instancias) responden desde memoria.
 * Devuelve una COPIA del array cacheado en cada `getAll()` (no la
 * referencia interna), para que nadie pueda corromper el cache mutando el
 * array recibido por fuera de `upsert`/`applyUpdates` — mismo contrato que
 * antes (siempre un array nuevo), solo que ya no cuesta una lectura real.
 */
export class LocalCollection<T extends Identifiable> {
  private cache: T[] | null = null;
  private loadPromise: Promise<T[]> | null = null;

  constructor(
    private storage: LocalStorageService,
    private key: string,
  ) {}

  async getAll(): Promise<T[]> {
    if (!this.cache) {
      if (!this.loadPromise) {
        this.loadPromise = this.storage.get<T[]>(this.key).then((v) => (this.cache = v ?? []));
      }
      await this.loadPromise;
    }
    return [...this.cache!];
  }

  /** Alias — mismo nombre que espera SyncCollection<T>. */
  async getAllForSync(): Promise<T[]> {
    return this.getAll();
  }

  async getById(id: string): Promise<T | null> {
    const all = await this.getAll();
    return all.find((e) => e.id === id) ?? null;
  }

  async upsert(entity: T): Promise<void> {
    const all = await this.getAll();
    const idx = all.findIndex((e) => e.id === entity.id);
    if (idx >= 0) {
      all[idx] = entity;
    } else {
      all.push(entity);
    }
    this.cache = all;
    await this.storage.set(this.key, all);
  }

  /** Mismo nombre que espera SyncCollection<T> — upsert por id, una fila a la vez, por cada update que ganó del servidor. */
  async applyUpdates(updates: T[]): Promise<void> {
    if (!updates.length) return;
    const all = await this.getAll();
    const map = new Map(all.map((e) => [e.id, e]));
    for (const update of updates) map.set(update.id, update);
    this.cache = Array.from(map.values());
    await this.storage.set(this.key, this.cache);
  }
}
