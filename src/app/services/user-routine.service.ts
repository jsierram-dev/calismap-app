import { Injectable } from '@angular/core';
import { UserRoutine, UserRoutineExerciseEntry } from '../models/user-routine.model';
import { LocalCollection } from '../core/utils/local-collection';
import { markDeleted, newId, touch } from '../core/utils/sync-meta';
import { LocalStorageService } from '../core/services/local-storage.service';
import { SyncService } from '../core/services/sync.service';

const KEY = 'calismap_user_routines';

/**
 * Rutina PROPIA del usuario — local-first, sincroniza como una unidad
 * completa con "el más reciente gana" (mergeListLastWriteWins, ver
 * user-routine.model.ts). Se edita/crea entera desde "Crear rutina" (paso
 * 6), nunca ejercicio por ejercicio contra el servidor.
 */
@Injectable({ providedIn: 'root' })
export class UserRoutineService {
  private collection: LocalCollection<UserRoutine>;

  constructor(
    storage: LocalStorageService,
    private sync: SyncService,
  ) {
    this.collection = new LocalCollection<UserRoutine>(storage, KEY);
    this.sync.registerUserRoutines(this.collection);
  }

  async getAll(): Promise<UserRoutine[]> {
    const all = await this.collection.getAll();
    return all.filter((r) => !r.deletedAt);
  }

  async getById(id: string): Promise<UserRoutine | null> {
    return this.collection.getById(id);
  }

  async create(name: string, exercises: UserRoutineExerciseEntry[]): Promise<UserRoutine> {
    const routine: UserRoutine = touch({ id: newId(), name, exercises, updatedAt: '', deletedAt: null });
    await this.collection.upsert(routine);
    return routine;
  }

  async update(id: string, patch: Partial<Pick<UserRoutine, 'name' | 'exercises'>>): Promise<void> {
    const existing = await this.collection.getById(id);
    if (!existing) return;
    await this.collection.upsert(touch({ ...existing, ...patch }));
  }

  async remove(id: string): Promise<void> {
    const existing = await this.collection.getById(id);
    if (!existing) return;
    await this.collection.upsert(markDeleted(existing));
  }
}
