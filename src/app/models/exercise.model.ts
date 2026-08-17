export type Level = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
export type Rating = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND';
export type ExerciseCategory = 'PUSH' | 'PULL' | 'CORE' | 'LEGS' | 'STATIC' | 'MOBILITY';
export type RepUnit = 'reps' | 'seconds';

export const RATING_ORDER: Rating[] = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];

export interface RatingThresholds {
  SILVER: number;
  GOLD: number;
  PLATINUM: number;
  DIAMOND: number;
}

// Vocabulario fijo, igual que Level/Rating/ExerciseCategory — no una tabla
// nueva (ver ROADMAP-calismap.md, "Taxonomía de músculos"). Agrupado por
// REGIÓN del cuerpo (4 grupos), no por las 6 ExerciseCategory — es solo
// organización interna, la Biblioteca filtra por "músculo principal" en
// vocabulario de gimnasio (Piernas/Pecho/Espalda/Hombros/Brazos/Core), no
// por estos nombres técnicos directamente (ver FilterComponent).
export type MuscleGroup =
  | 'PECTORAL' | 'DELTOIDES_ANTERIOR' | 'TRICEPS' | 'SERRATO_ANTERIOR'          // empuje
  | 'DORSAL_ANCHO' | 'TRAPECIO' | 'ROMBOIDES' | 'BICEPS' | 'ANTEBRAZOS' | 'DELTOIDES_POSTERIOR'  // tracción
  | 'CUADRICEPS' | 'ISQUIOTIBIALES' | 'GLUTEOS' | 'GEMELOS' | 'ADUCTORES'       // piernas
  | 'RECTO_ABDOMINAL' | 'OBLICUOS' | 'TRANSVERSO_ABDOMINAL' | 'LUMBARES';       // core

export const MUSCLE_GROUPS_BY_REGION: Record<'PUSH' | 'PULL' | 'LEGS' | 'CORE', MuscleGroup[]> = {
  PUSH: ['PECTORAL', 'DELTOIDES_ANTERIOR', 'TRICEPS', 'SERRATO_ANTERIOR'],
  PULL: ['DORSAL_ANCHO', 'TRAPECIO', 'ROMBOIDES', 'BICEPS', 'ANTEBRAZOS', 'DELTOIDES_POSTERIOR'],
  LEGS: ['CUADRICEPS', 'ISQUIOTIBIALES', 'GLUTEOS', 'GEMELOS', 'ADUCTORES'],
  CORE: ['RECTO_ABDOMINAL', 'OBLICUOS', 'TRANSVERSO_ABDOMINAL', 'LUMBARES'],
};

export interface Exercise {
  id: string;
  name: string;
  // Siempre presentes, sin importar en qué idioma haya pedido `name` el
  // cliente (17/08/2026, ver ROADMAP-calismap.md "Traducciones") — para
  // que la búsqueda pueda encontrar "Pull-up" buscando "dominada" y
  // viceversa, sin importar el idioma activo de la UI en ese momento (ver
  // LibraryPage.filtered()). Para un ejercicio PROPIO (sin traducción
  // real posible) los tres campos terminan siendo idénticos a `name`.
  nameSpanish: string;
  nameEnglish: string;
  description: string;
  level: Level;
  category: ExerciseCategory;
  muscleGroups: MuscleGroup[];
  steps: string[];
  repUnit: RepUnit;
  ratingThresholds: RatingThresholds;
  videoUrl?: string;              // link externo, video curado ya hosteado en otro lado
  videoId?: string;               // referencia a Photo, blob subido — DISTINTO de videoUrl
  photoId?: string;               // referencia a Photo, blob subido — foto de portada
  regressionExerciseId?: string;  // variante más fácil sugerida, ver "Rutas de regresión"
  // undefined/null = catálogo (admin-curado, pull-and-cache); con valor =
  // ejercicio PROPIO de ese usuario (local-first + sync, ver
  // ROADMAP-calismap.md "Ejercicios personalizados"). Mismo shape para los
  // dos casos, sin tabla aparte — la única diferencia real es el dueño.
  userId?: string;
  // Columna real en Postgres para los dos casos (catálogo y propio) — se
  // incluye acá también en el catálogo (no solo el DTO de /sync) porque el
  // cliente cachea GET /exercises tal cual como su Exercise local. El merge
  // de un ejercicio propio la usa de verdad en mergeListLastWriteWins (ver
  // calismap-back/src/modules/sync/entities/owned-exercise.entity.ts).
  updatedAt: string;
  // string | null (no opcional) — mismo criterio que WorkoutSession/
  // UserRoutine/WorkoutLog, para poder reusar el helper compartido
  // markDeleted() (ver core/utils/sync-meta.ts) sin casos especiales. Solo
  // aplica de verdad a un ejercicio propio; el catálogo nunca llega con
  // valor acá (el WHERE del backend ya excluye las filas borradas).
  deletedAt: string | null;
}
