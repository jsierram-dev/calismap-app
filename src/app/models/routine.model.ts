// Rutina de sesión (catálogo, admin-curado) — distinta de Roadmap
// (progresión de largo plazo, un ejercicio a la vez con desbloqueo). Una
// Routine es "qué hacer HOY, en una sola sesión": lista plana de ejercicios
// con series/objetivo, sin lógica de desbloqueo. Pull-and-cache, igual que
// Exercise/Roadmap. Las rutinas PROPIAS del usuario son UserRoutine (ver
// user-routine.model.ts), no esta — ver ROADMAP-calismap.md.
export interface Routine {
  id: string;
  name: string;
  description: string;
}

// targetValues: un valor por serie (ej. pirámide 12/10/8), no uno solo
// repetido para todas — cambiado el 16/08/2026 (hallazgo #9 de pruebas
// reales en móvil, ver ROADMAP-calismap.md; migración real en
// calismap-back, migrations/002_routine_exercise_target_values.sql). Cada
// posición null = "las que puedas" para esa serie puntual. Longitud
// siempre === targetSets.
export interface RoutineExercise {
  id: string;
  routineId: string;
  exerciseId: string;
  stepOrder: number;
  targetSets: number;
  targetValues: (number | null)[];
}

export interface RoutineDetail extends Routine {
  exercises: RoutineExercise[];
}

// Body de POST/PUT /routines y POST /routines/:id/exercises (admin, ver
// calismap-back/src/modules/routines/types.ts). Usado solo por el panel de
// admin (RoutineManagementComponent en modo admin).
export interface RoutineInput {
  name: string;
  description?: string;
}

export interface RoutineExerciseInput {
  exerciseId: string;
  stepOrder: number;
  targetSets?: number;
  targetValues?: (number | null)[];
}
