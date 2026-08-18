import { MuscleGroup } from '../../models/exercise.model';

export interface MuscleRegion {
  regionKey: string;
  muscles: MuscleGroup[];
}

/**
 * Agrupado por "músculo principal" en vocabulario de gimnasio (Piernas/
 * Pecho/Espalda/Hombros/Brazos/Core) — extraído el 18/08/2026 de
 * FilterComponent (ver ROADMAP-calismap.md "Pantalla de Perfil") para que
 * la pantalla de Perfil (calendario/historial + temporizador de descanso
 * por parte del cuerpo) use la MISMA taxonomía que el filtro de músculos,
 * no una propia. DISTINTO de MUSCLE_GROUPS_BY_REGION en calismap-back (esa
 * agrupación, PUSH/PULL/LEGS/CORE, es solo organización interna del
 * código del servidor) — ver el comentario original en filter.component.ts
 * y ROADMAP-calismap.md "Taxonomía de músculos".
 */
export const MUSCLE_REGIONS: MuscleRegion[] = [
  { regionKey: 'legs', muscles: ['CUADRICEPS', 'ISQUIOTIBIALES', 'GLUTEOS', 'GEMELOS', 'ADUCTORES'] },
  { regionKey: 'chest', muscles: ['PECTORAL'] },
  { regionKey: 'back', muscles: ['DORSAL_ANCHO', 'TRAPECIO', 'ROMBOIDES', 'LUMBARES'] },
  { regionKey: 'shoulders', muscles: ['DELTOIDES_ANTERIOR', 'DELTOIDES_POSTERIOR'] },
  { regionKey: 'arms', muscles: ['BICEPS', 'TRICEPS', 'ANTEBRAZOS'] },
  { regionKey: 'core', muscles: ['RECTO_ABDOMINAL', 'OBLICUOS', 'TRANSVERSO_ABDOMINAL', 'SERRATO_ANTERIOR'] },
];

/** Qué regiones toca un ejercicio (puede ser más de una — ej. Planche pega en pecho+hombros+core a la vez). */
export function regionsForMuscleGroups(muscleGroups: MuscleGroup[]): string[] {
  const set = new Set(muscleGroups);
  return MUSCLE_REGIONS.filter((region) => region.muscles.some((m) => set.has(m))).map((region) => region.regionKey);
}
