// Contenedor real de un entrenamiento (una ida a entrenar) — distinto de la
// ruta de evolución (Roadmap), que es un estado DERIVADO recalculado sobre
// el historial de WorkoutLog, nunca una entidad guardada en sí misma. Ver
// ROADMAP-calismap.md, "Sesiones de entrenamiento vs. ruta de evolución".
//
// Local-first + sync: id generado por el CLIENTE (crypto.randomUUID()), se
// sincroniza con "el más reciente gana" (mergeListLastWriteWins), no el
// merge campo a campo de WorkoutLog — ver core/services/sync.service.ts.
export interface WorkoutSession {
  id: string;
  startedAt: string;
  endedAt: string | null;
  source: 'app' | 'import'; // 'import' reservado para v2, no se usa todavía
  // A lo sumo uno de los dos no null — qué se eligió en "Elegir sesión".
  // Null en ambos = sesión libre. No restringe qué se puede loguear durante
  // la sesión, solo prellena la lista sugerida en "Sesión activa".
  routineId: string | null;
  userRoutineId: string | null;
  updatedAt: string;
  deletedAt: string | null;
}
