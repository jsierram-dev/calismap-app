// Mapeo de nombres de columna de CSV → campo canónico de calismap
// (19/08/2026, pedido explícito del usuario: "recopiles todos los posibles
// nombres de columnas y tengan un enum de sinónimos... para así toda columna
// de cualquier csv de cualquier app podamos registrar las sesiones de otras
// apps"; comparar contra "las apps más usadas del mercado, ya que intentamos
// 'robar' clientes" — ver ROADMAP-calismap.md, "Investigación: nombres de
// columna CSV de las apps más usadas" para el detalle completo).
//
// SOLO esto: el diccionario de sinónimos + el detector. El parser real de
// CSV, la UI de revisión fila por fila (mostrar cada nombre de ejercicio
// importado con una sugerencia + opción de mapear a mano/crear propio/
// descartar — la falta de eso fue el motivo real de descartar el import
// automático, ver esa misma sección del ROADMAP), y la creación de
// WorkoutSession/WorkoutLog a partir de las filas ya reconocidas quedan
// PENDIENTES — esto es la base reusable para cuando se construya eso, no el
// importador en sí. Nada de este archivo se usa todavía en ninguna pantalla.
//
// Apps investigadas — 8, las más comparadas/usadas del mercado en 2026 según
// la propia cobertura de prensa especializada del rubro, más las
// específicas de calistenia (competencia directa de calismap):
//   - Strong (help.strongapp.io) — la más establecida; exporta CSV, NO
//     importa nada de vuelta. Fuente: múltiples guías independientes
//     (RepStack, Strength Journeys, blog.ayjc.net) coinciden en las mismas
//     columnas, aunque ninguna publica el header verbatim completo — el set
//     de acá es el subconjunto confirmado por al menos dos fuentes.
//   - Hevy (help.hevyapp.com) — 5-9M+ usuarios reportados, la más popular en
//     crecimiento; exporta Y IMPORTA CSV (incluido el formato de Strong
//     directo). Columnas confirmadas verbatim desde su Help Centre.
//   - FitNotes (getfitnotes.com) — Android/iOS, muy usada para pesas.
//     Columnas confirmadas verbatim (iOS; Android puede variar liviano).
//   - Fitbod (fitbod.me) — la más "data-driven" (IA ajusta la rutina según
//     lo logueado). Columnas confirmadas verbatim vía su propio tutorial.
//   - JEFIT — de las 3 más comparadas en 2026 junto a Hevy/Caliber; CSV
//     descripto como "ampliamente reconocido" por otras apps que lo
//     importan, pero sin header verbatim confirmado — columnas acá son la
//     forma genérica más probable, marcadas donde corresponde.
//   - StrongLifts 5x5 (stronglifts.com) — programa de barra muy popular;
//     CSV confirmado, header verbatim no confirmado (misma salvedad que JEFIT).
//   - Caliber (caliberstrong.com) — coaching estructurado con humano real;
//     CSV confirmado por su propio changelog, header verbatim no confirmado.
//   - Progression — Gym Workout Log (theprogressapp.com) — específica de
//     calistenia/callisthenics, competidor MÁS directo de calismap en
//     concepto. Export CSV confirmado que existe; header verbatim no
//     encontrado en la investigación — no se listan sinónimos propios acá
//     todavía, pendiente de conseguir un export real de muestra.
//
// Case-insensitive a propósito — normalizeHeader() ya resuelve
// mayúsculas/espacios/guiones-bajos antes de buscar, así "Exercise Name",
// "exercise_name" y "ExerciseName" matchean igual sin listar las 3 variantes
// a mano acá abajo.

export type ImportField =
  | 'DATE'
  | 'WORKOUT_NAME'
  | 'EXERCISE_NAME'
  | 'SET_INDEX'
  | 'REPS'
  | 'DURATION_SECONDS'
  | 'WEIGHT_KG'
  | 'WEIGHT_LBS'
  // Reconocidas pero SIN destino directo en el modelo de calismap hoy — ver
  // el comentario de cada una en COLUMN_SYNONYMS. Se listan igual (a
  // propósito, "toda columna de cualquier csv" fue el pedido explícito) para
  // que un futuro importador al menos las detecte y decida qué hacer
  // (ignorar, guardar en un campo nuevo, o filtrar filas) en vez de
  // encontrarse con una columna totalmente desconocida.
  | 'DISTANCE'
  | 'NOTES'
  | 'RPE'
  | 'SET_TYPE'
  | 'CATEGORY';

interface FieldMeta {
  /** true = calismap tiene un campo real donde este valor entra directo (WorkoutLog.value/addedWeightKg/loggedAt, etc.). false = reconocida pero sin destino todavía. */
  actionable: boolean;
  note: string;
}

export const IMPORT_FIELD_META: Record<ImportField, FieldMeta> = {
  DATE: { actionable: true, note: 'WorkoutLog.loggedAt / WorkoutSession.startedAt.' },
  WORKOUT_NAME: { actionable: true, note: 'Nombre sugerido para la WorkoutSession importada (source: "import", ver migrations/001_init.sql).' },
  EXERCISE_NAME: { actionable: true, note: 'A matchear contra el catálogo de calismap (matchesNameQuery, mismo helper que ya usa LibraryPage/CreateExercisePage) — el paso que de verdad necesita revisión manual, ver el ROADMAP.' },
  SET_INDEX: { actionable: true, note: 'Orden dentro del ejercicio en esa sesión — no todas las apps lo traen explícito, algunas alcanza con el orden de fila.' },
  REPS: { actionable: true, note: 'WorkoutLog.value cuando Exercise.repUnit === "reps".' },
  DURATION_SECONDS: { actionable: true, note: 'WorkoutLog.value cuando Exercise.repUnit === "seconds" (holds estáticos — Planche, L-sit, Wall Handstand Hold).' },
  WEIGHT_KG: { actionable: true, note: 'WorkoutLog.addedWeightKg directo.' },
  WEIGHT_LBS: { actionable: true, note: 'WorkoutLog.addedWeightKg tras convertir ×0.453592 — calismap guarda SIEMPRE en kg internamente (mismo criterio que UserProfile.weightUnit, ver migrations/001_init.sql).' },
  DISTANCE: { actionable: false, note: 'Sin ejercicios basados en distancia en el catálogo de calismap (calistenia, no running/rowing) — se reconoce para no tratarla como columna desconocida, pero no tiene a dónde ir.' },
  NOTES: { actionable: false, note: 'WorkoutLog no tiene campo de notas hoy — requeriría una columna nueva si se quisiera conservar.' },
  RPE: { actionable: false, note: 'calismap no trackea esfuerzo percibido — mismo caso que NOTES.' },
  SET_TYPE: { actionable: false, note: 'Warmup/failure/dropset (Hevy) o isWarmup booleano (Fitbod) — útil como FILTRO (ej. no importar warmups) más que como dato a guardar; calismap no distingue tipos de serie hoy.' },
  CATEGORY: { actionable: false, note: 'Categoría propia de la app de origen (ej. FitNotes) — no se mapea a ExerciseCategory de calismap, taxonomías distintas sin correspondencia 1 a 1 confiable.' },
};

// Sinónimos reales, uno por app investigada que efectivamente tiene esa
// columna (una app ausente en la lista de una fila = no se confirmó que
// tenga ese campo, no que use un nombre distinto sin documentar).
export const COLUMN_SYNONYMS: Record<ImportField, string[]> = {
  DATE: [
    'Date', // Strong, FitNotes, Fitbod
    'start_time', // Hevy — hay también "end_time", ver WORKOUT_NAME/duración de sesión
    'date', // StrongLifts, Caliber, JEFIT (forma genérica, header exacto no confirmado)
    'Workout Date',
  ],
  WORKOUT_NAME: [
    'Workout Name', // Strong, StrongLifts
    'title', // Hevy
    'description', // Hevy también reusa esta para el título largo de la rutina
  ],
  EXERCISE_NAME: [
    'Exercise Name', // Strong
    'exercise_title', // Hevy
    'Exercise', // FitNotes, Fitbod, JEFIT/StrongLifts/Caliber (forma genérica)
    'Movement',
    'Exercise Type',
  ],
  SET_INDEX: [
    'Set Order', // Strong
    'set_index', // Hevy
    'Set', 'Set #', 'Set Number',
  ],
  REPS: [
    'Reps', // Strong, FitNotes, Fitbod
    'reps', // Hevy
    'Repetitions',
  ],
  DURATION_SECONDS: [
    'Seconds', // Strong (ejercicios cronometrados)
    'duration_seconds', // Hevy
    'Duration(s)', // Fitbod
    'Time', // FitNotes — OJO: en FitNotes suele venir en formato mm:ss, no segundos crudos, hay que parsear distinto que las demás
    'Duration',
  ],
  WEIGHT_KG: [
    'Weight (kg)', // FitNotes
    'Weight(kg)', // Fitbod
    'Weight', // Strong — OJO: la unidad de "Weight" en Strong depende de una preferencia GLOBAL de la cuenta (kg o lbs), no viene indicada por fila; hay que preguntarle al usuario o asumir kg si no hay forma de saberlo
    'weight_kg',
  ],
  WEIGHT_LBS: [
    'Weight (lbs)', // FitNotes
    'weight_lbs', // Hevy — Hevy SIEMPRE trae la unidad en el nombre de columna, sin ambigüedad
  ],
  DISTANCE: [
    'Distance', // FitNotes
    'distance_miles', // Hevy
    'Distance(m)', // Fitbod
    'Distance Unit', // FitNotes (columna aparte con la unidad)
  ],
  NOTES: [
    'Notes', // Strong, FitNotes
    'Workout Notes', // Strong (nota de la SESIÓN completa, distinta de la nota por serie)
    'exercise_notes', // Hevy
    'Note', // Fitbod
    'Comment', 'Comments',
  ],
  RPE: [
    'RPE', // Strong, Hevy
    'Effort', 'rpe',
  ],
  SET_TYPE: [
    'set_type', // Hevy — valores como "warmup"/"normal"/"failure"/"dropset", no booleano
    'isWarmup', // Fitbod — este SÍ es booleano
    'Warmup', 'Kind', // FitNotes usa "Kind" con otro sentido (tipo de serie/registro) — revisar caso por caso, no asumir
  ],
  CATEGORY: [
    'Category', // FitNotes
  ],
};

/**
 * Normaliza un header de CSV real antes de buscarlo — minúsculas, guiones
 * bajos y espacios de más colapsados. Necesario porque las mismas 8 apps ya
 * mezclan `Exercise Name` / `exercise_title` / `Exercise` para el mismo
 * concepto — comparar tal cual el string crudo fallaría todo el tiempo.
 *
 * Bug real encontrado con un smoke test propio (19/08/2026) — la primera
 * versión SACABA el contenido completo entre paréntesis ("Weight (kg)" ->
 * "weight"), no solo los paréntesis. Eso hacía que "Weight (kg)" y
 * "Weight (lbs)" normalizaran IGUAL ("weight") y colisionaran en
 * REVERSE_INDEX — la unidad es la ÚNICA señal real que distingue
 * WEIGHT_KG de WEIGHT_LBS, sacarla del todo perdía justo el dato que
 * hacía falta para decidir. Ahora solo se sacan los paréntesis EN SÍ,
 * dejando las letras de adentro — "Weight (kg)"/"Weight(kg)"/"weight_kg"
 * normalizan los 3 a "weight kg" (coinciden entre sí, que es lo que
 * importa), sin pisarse con "weight lbs" ni con el "Weight" a secas de
 * Strong (ese sigue mapeado a WEIGHT_KG como default razonable, ver el
 * comentario en COLUMN_SYNONYMS sobre por qué es ambiguo de por sí).
 */
export function normalizeHeader(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Índice invertido armado una sola vez al cargar el módulo — buscar en un
// Map es O(1), evita recorrer las ~13 listas de sinónimos por cada columna
// de cada CSV importado.
const REVERSE_INDEX = new Map<string, ImportField>();
for (const [field, synonyms] of Object.entries(COLUMN_SYNONYMS) as [ImportField, string[]][]) {
  for (const synonym of synonyms) {
    REVERSE_INDEX.set(normalizeHeader(synonym), field);
  }
}

/** Header crudo de una columna de CSV -> campo canónico reconocido, o null si no matchea ninguno de los sinónimos conocidos. */
export function detectImportField(rawHeader: string): ImportField | null {
  return REVERSE_INDEX.get(normalizeHeader(rawHeader)) ?? null;
}
