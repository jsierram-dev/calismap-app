import { Injectable } from '@angular/core';
import { WorkoutLog, effectiveValue, fromSyncDto, toSyncDto } from '../models/workout-log.model';
import { LocalCollection } from '../core/utils/local-collection';
import { newId } from '../core/utils/sync-meta';
import { LocalStorageService } from '../core/services/local-storage.service';
import { SyncService } from '../core/services/sync.service';

const KEY = 'calismap_workout_logs';

/**
 * Local-first, merge campo-a-campo (mergeAndApply, no
 * mergeListLastWriteWins — ver models/workout-log.model.ts). A diferencia
 * del resto de los servicios de dominio, acá el registro con SyncService no
 * delega directo a LocalCollection: necesita traducir a/desde
 * WorkoutLogSyncDto (con el updatedAt sintetizado) en el borde, sin que ese
 * campo exista nunca en el WorkoutLog guardado localmente (ver toSyncDto/
 * fromSyncDto).
 */
@Injectable({ providedIn: 'root' })
export class WorkoutLogService {
  private collection: LocalCollection<WorkoutLog>;

  constructor(
    storage: LocalStorageService,
    private sync: SyncService,
  ) {
    this.collection = new LocalCollection<WorkoutLog>(storage, KEY);
    this.sync.registerWorkoutLogs({
      getAllForSync: async () => (await this.collection.getAll()).map(toSyncDto),
      applyUpdates: (updates) => this.collection.applyUpdates(updates.map(fromSyncDto)),
    });
  }

  async logSet(input: {
    sessionId: string;
    exerciseId: string;
    value: number;
    addedWeightKg: number;
    bodyWeightAtLog: number;
  }): Promise<WorkoutLog> {
    const log: WorkoutLog = {
      id: newId(),
      sessionId: input.sessionId,
      exerciseId: input.exerciseId,
      value: input.value,
      addedWeightKg: input.addedWeightKg,
      bodyWeightAtLog: input.bodyWeightAtLog,
      loggedAt: new Date().toISOString(),
      deletedAt: null,
    };
    await this.collection.upsert(log);
    return log;
  }

  /** Una marca es inmutable — borrar es la única "edición" posible (ver ROADMAP-calismap.md). */
  async remove(id: string): Promise<void> {
    const log = await this.collection.getById(id);
    if (!log) return;
    await this.collection.upsert({ ...log, deletedAt: new Date().toISOString() });
  }

  async getForExercise(exerciseId: string): Promise<WorkoutLog[]> {
    const all = await this.collection.getAll();
    return all.filter((l) => l.exerciseId === exerciseId && !l.deletedAt);
  }

  async getForSession(sessionId: string): Promise<WorkoutLog[]> {
    const all = await this.collection.getAll();
    return all.filter((l) => l.sessionId === sessionId && !l.deletedAt);
  }

  /** Mejor marca histórica de un ejercicio — MAX(effectiveValue), nunca recalculado con el peso de HOY (ver ROADMAP-calismap.md, la marca guarda su propia foto de bodyWeightAtLog). null = todavía sin ninguna marca. */
  async getBestLog(exerciseId: string): Promise<WorkoutLog | null> {
    const logs = await this.getForExercise(exerciseId);
    if (!logs.length) return null;
    return logs.reduce((best, log) => (effectiveValue(log) > effectiveValue(best) ? log : best));
  }
}
