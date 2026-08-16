// Reemplaza los campos sueltos que tenía antes — ahora sincroniza (ver
// ROADMAP-calismap.md, "Modelo de datos"). Singleton por usuario, no una
// lista, se sincroniza con "el más reciente gana" (mergeSingletonLastWriteWins).
export interface UserProfile {
  bodyWeightKg: number;
  // Preferencia de PRESENTACIÓN únicamente (pantalla de Ajustes) —
  // bodyWeightKg/addedWeightKg/bodyWeightAtLog siguen siempre en kg
  // internamente, la fórmula del rating no lo sabe. La conversión a libras
  // pasa solo en la UI al mostrar/ingresar valores.
  weightUnit: 'kg' | 'lbs';
  // Es del USUARIO, no del dispositivo, por eso sincroniza acá — a
  // diferencia del tema (claro/oscuro/sistema), que es del dispositivo y NO
  // sincroniza a propósito (ver ROADMAP-calismap.md, "Idioma y tema").
  language: 'es' | 'en';
  updatedAt: string;
}

export const DEFAULT_PROFILE: UserProfile = {
  bodyWeightKg: 75,
  weightUnit: 'kg',
  language: 'es',
  updatedAt: new Date(0).toISOString(), // "nunca actualizado" — cualquier cambio real le gana
};
