// Historial completo — una fila por marca registrada dentro de una sesión.
// Reemplaza a UserExercise (que era una sola fila por usuario+ejercicio con
// el "récord actual"). Sin campo "rating": se deriva con
// RatingCalculatorService agregando el MAX(effectiveValue) del historial —
// ver ROADMAP-calismap.md, "Modelo de datos".
//
// Local-first + sync: id generado por el CLIENTE. Una marca es INMUTABLE
// después de creada (solo se crea o se borra, nunca se edita) — el merge la
// trata como solo-agregado (mergeAndApply), distinto del resto de las
// entidades sincronizables.
export interface WorkoutLog {
  id: string;
  sessionId: string;
  exerciseId: string;
  value: number;              // reps o segundos, según Exercise.repUnit
  addedWeightKg: number;      // lastre agregado (dominadas/fondos) — puede ser
                               // NEGATIVO a propósito (asistencia real: banda/máquina)
  bodyWeightAtLog: number;    // FOTO del peso corporal al momento de loguear,
                               // no una referencia viva — ver ROADMAP-calismap.md
  loggedAt: string;
  deletedAt: string | null;
}

// DTO "de cable" — igual que WorkoutLog pero con updatedAt sintetizado
// (deletedAt ?? loggedAt), nunca guardado así en el dispositivo. Mismo
// mecanismo que el adapter del lado del back (ver calismap-back/src/modules/
// sync/entities/workout-log.entity.ts, toDto()) — WorkoutLog no tiene una
// columna updatedAt real, y una marca no se edita después de creada, así que
// ese sintético alcanza para que mergeAndApply la trate como Syncable.
export interface WorkoutLogSyncDto extends WorkoutLog {
  updatedAt: string;
}

export function toSyncDto(log: WorkoutLog): WorkoutLogSyncDto {
  return { ...log, updatedAt: log.deletedAt ?? log.loggedAt };
}

/** Inverso de toSyncDto() — descarta el updatedAt sintético antes de guardar localmente. */
export function fromSyncDto(dto: WorkoutLogSyncDto): WorkoutLog {
  const { updatedAt: _updatedAt, ...log } = dto;
  return log;
}

// effectiveValue = value × (bodyWeightAtLog + addedWeightKg) / 75 — mismo
// cálculo que la columna generada de Postgres (ver migrations/001_init.sql
// en calismap-back), portado acá porque el rating se calcula en el
// dispositivo, nunca en el servidor (catálogo pull-and-cache, WorkoutLog
// local-first — ver RatingCalculatorService).
export function effectiveValue(log: Pick<WorkoutLog, 'value' | 'bodyWeightAtLog' | 'addedWeightKg'>): number {
  return (log.value * (log.bodyWeightAtLog + log.addedWeightKg)) / 75;
}
