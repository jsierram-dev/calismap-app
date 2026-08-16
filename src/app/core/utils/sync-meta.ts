// Helpers compartidos por las entidades local-first (WorkoutSession/
// WorkoutLog/UserRoutine/Exercise propio) — mismo patrón que mudanza-app.
// Ver ROADMAP-calismap.md, "Arquitectura".

/** id generado por el CLIENTE — nunca gen_random_uuid() del lado del servidor, para que la misma fila se reconozca en cualquier dispositivo tras sincronizar. */
export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Estampa/actualiza updatedAt — se llama cada vez que se crea o edita una fila local, antes de guardarla. */
export function touch<T extends { updatedAt: string }>(entity: T): T {
  return { ...entity, updatedAt: nowIso() };
}

/** Tombstone de borrado — deletedAt Y updatedAt (el borrado ES un cambio, ver mergeListLastWriteWins del lado del back). */
export function markDeleted<T extends { updatedAt: string; deletedAt: string | null }>(entity: T): T {
  const at = nowIso();
  return { ...entity, updatedAt: at, deletedAt: at };
}
