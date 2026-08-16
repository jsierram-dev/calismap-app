import { Injectable } from '@angular/core';
import { Storage } from '@ionic/storage-angular';

/**
 * Envoltorio fino sobre @ionic/storage-angular. Storage.create() tiene que
 * correr una vez antes de cualquier get/set — se memoiza esa promesa acá en
 * vez de depender de un inicializador de la app aparte, así cualquier
 * servicio que inyecte esto puede usarlo desde su propio constructor sin
 * preocuparse por el orden de arranque.
 *
 * Reemplaza a StorageService (localStorage plano) para los datos de dominio
 * (WorkoutSession/WorkoutLog/UserRoutine/Exercise propios/UserProfile,
 * lastSyncedAt) — ver ROADMAP-calismap.md, "Arquitectura". El token de auth
 * NO pasa por acá a propósito (ver core/services/auth.service.ts).
 * StorageService sigue existiendo hasta que los servicios de dominio migren
 * a este (pendiente, no en este paso).
 */
@Injectable({ providedIn: 'root' })
export class LocalStorageService {
  private ready: Promise<Storage>;

  constructor(private storage: Storage) {
    this.ready = this.storage.create();
  }

  async get<T>(key: string): Promise<T | null> {
    await this.ready;
    const value = await this.storage.get(key);
    return (value ?? null) as T | null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.ready;
    await this.storage.set(key, value);
  }

  async remove(key: string): Promise<void> {
    await this.ready;
    await this.storage.remove(key);
  }
}
