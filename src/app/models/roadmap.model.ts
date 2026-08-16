import { Exercise, ExerciseCategory, Rating } from './exercise.model';

export interface Roadmap {
  id: string;
  name: string;
  description: string;
  targetExerciseId: string;
  category: ExerciseCategory;
  targetRatingRequired: Rating; // dato de catálogo, ver ROADMAP-calismap.md
}

export interface RoadmapExercise {
  id: string;
  roadmapId: string;
  exerciseId: string;
  stepOrder: number;
  minRatingRequired: Rating | null; // null = paso 1, siempre accesible
}

// Body de POST/PUT /roadmaps y POST /roadmaps/:id/steps (admin, ver
// calismap-back/src/modules/roadmaps/types.ts — RoadmapInput/
// RoadmapExerciseInput). Usado solo por el panel de admin
// (RoadmapManagementComponent).
export interface RoadmapInput {
  name: string;
  description?: string;
  targetExerciseId: string;
  category: ExerciseCategory;
  targetRatingRequired?: Rating;
}

export interface RoadmapExerciseInput {
  exerciseId: string;
  stepOrder: number;
  minRatingRequired?: Rating | null;
}

// GET /roadmaps/:id crudo (sin enriquecer con progreso del usuario, a
// diferencia de RoadmapDetailViewModel) — lo que necesita el formulario de
// admin para precargar un roadmap existente.
export interface RoadmapDetailRaw extends Roadmap {
  steps: RoadmapExercise[];
}

// bestValue/rating son DERIVADOS del historial de WorkoutLog (MAX de
// effectiveValue), nunca una entidad guardada — reemplaza a la referencia
// directa a UserExercise que tenía este view model antes de que existiera
// WorkoutLog (ver ROADMAP-calismap.md, "Sesiones de entrenamiento vs. ruta
// de evolución"). null = sin ninguna marca registrada todavía.
export interface RoadmapStepViewModel {
  stepOrder: number;
  exercise: Exercise;
  isTarget: boolean;
  isUnlocked: boolean;
  isCompleted: boolean;
  rating: Rating | null;
  bestValue: number | null;
  // Copiado tal cual de RoadmapExercise.minRatingRequired (el nodo objetivo
  // usa Roadmap.targetRatingRequired en su lugar) — la página lo necesita
  // para armar el texto real de coach-note/bloqueado (a qué rating exacto
  // apunta, no un genérico "el siguiente nivel"), ver RoadmapComponent
  // (pantalla 02).
  minRatingRequired: Rating | null;
}

export interface RoadmapDetailViewModel {
  roadmap: Roadmap;
  targetExercise: Exercise;
  steps: RoadmapStepViewModel[];
  completedCount: number;
  totalCount: number;
}
