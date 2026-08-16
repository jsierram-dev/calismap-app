// Un ejercicio dentro de una UserRoutine — embebido, no una tabla hija (a
// diferencia de Routine/RoutineExercise, que sí son relacionales porque el
// catálogo se administra con CRUD real). Ver ROADMAP-calismap.md.
export interface UserRoutineExerciseEntry {
  exerciseId: string;
  order: number;
  targetSets: number;
  // Un valor por serie, no uno solo repetido (16/08/2026, hallazgo #9 de
  // pruebas reales en móvil, ver ROADMAP-calismap.md) — mismo cambio de
  // forma que RoutineExercise, acá sin migración porque ya era JSONB
  // opaco. Longitud siempre === targetSets.
  targetValues: (number | null)[];
}

// Rutina PROPIA del usuario — local-first + sync, no catálogo. El listado de
// ejercicios va DENTRO de la misma fila como JSONB: se edita/sincroniza como
// una unidad completa desde el editor (Crear rutina, RoutineManagementComponent),
// con el mismo mergeListLastWriteWins que WorkoutSession/UserProfile — sin
// necesitar una tabla hija con su propio merge.
export interface UserRoutine {
  id: string;
  name: string;
  exercises: UserRoutineExerciseEntry[];
  updatedAt: string;
  deletedAt: string | null;
}
