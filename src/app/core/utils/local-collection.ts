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
 */
export class LocalCollection<T extends Identifiable> {
  constructor(
    private storage: LocalStorageService,
    private key: string,
  ) {}

  async getAll(): Promise<T[]> {
    return (await this.storage.get<T[]>(this.key)) ?? [];
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
    await this.storage.set(this.key, all);
  }

  /** Mismo nombre que espera SyncCollection<T> — upsert por id, una fila a la vez, por cada update que ganó del servidor. */
  async applyUpdates(updates: T[]): Promise<void> {
    if (!updates.length) return;
    const all = await this.getAll();
    const map = new Map(all.map((e) => [e.id, e]));
    for (const update of updates) map.set(update.id, update);
    await this.storage.set(this.key, Array.from(map.values()));
  }
}
