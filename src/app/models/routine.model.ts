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

// targetValue null = "las que puedas", sin objetivo prescrito.
export interface RoutineExercise {
  id: string;
  routineId: string;
  exerciseId: string;
  stepOrder: number;
  targetSets: number;
  targetValue: number | null;
}

export interface RoutineDetail extends Routine {
  exercises: RoutineExercise[];
}
