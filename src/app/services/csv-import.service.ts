import { Injectable } from '@angular/core';
import Papa from 'papaparse';
import { Exercise, MuscleGroup, RatingThresholds } from '../models/exercise.model';
import { IMPORT_FIELD_META, ImportField, detectImportField } from '../core/utils/import-column-synonyms';
import { matchesNameQuery } from '../core/utils/name-match';
import { newId } from '../core/utils/sync-meta';
import { AuthService } from '../core/services/auth.service';
import { ExerciseLibraryService } from './exercise-library.service';
import { UserProfileService } from './user-profile.service';
import { WorkoutLogService } from './workout-log.service';
import { WorkoutSessionService } from './workout-session.service';

// Importador real de CSV (22/09/2026, ver ROADMAP-calismap.md
// "Investigación: import/export..." y el diccionario en
// core/utils/import-column-synonyms.ts, construido en rondas anteriores) —
// esta es la pieza que de verdad LEE un archivo y arma sesiones/marcas
// reales, sobre esa base ya investigada. El problema real (confirmado por
// la investigación, no una suposición) nunca fue parsear el CSV — es
// matchear el nombre de ejercicio del archivo contra el catálogo angosto
// de calismap (25 ejercicios de calistenia específicos vs. cientos de
// ejercicios de gimnasio en Strong/Hevy/etc.) — por eso el flujo real es
// parse() -> el usuario revisa/decide cada nombre distinto -> commit(),
// nunca "parsear y guardar" directo.

// "Weight"/"Peso" a secas son AMBIGUOS de verdad (ver el comentario en
// COLUMN_SYNONYMS.WEIGHT_KG) — la unidad es una preferencia GLOBAL de la
// cuenta en la app de origen (Strong, Liftoff), no algo que venga indicado
// por fila. Si el header detectado es UNO DE ESTOS, hay que preguntarle al
// usuario la unidad real antes de confiar en el valor — si en cambio vino
// "Weight (kg)"/"weight_lbs"/etc., la unidad ya viene sin ambigüedad y no
// hace falta preguntar nada.
const AMBIGUOUS_WEIGHT_HEADERS = new Set(['weight', 'peso']);
const LBS_TO_KG = 0.453592;

export interface ParsedSetRow {
  exerciseName: string;
  reps: number | null;
  durationSeconds: number | null;
  weightKg: number;
  isWarmup: boolean;
}

export interface ParsedSession {
  key: string; // Nombre de Entrenamiento + Fecha (sin hora) — clave de agrupamiento, no se persiste
  startedAt: string; // ISO
  rows: ParsedSetRow[];
}

export interface ParsedImport {
  sessions: ParsedSession[];
  distinctExerciseNames: string[];
  skippedRowCount: number;
  ignoredColumns: ImportField[]; // reconocidas pero sin destino en el modelo de calismap — ver IMPORT_FIELD_META
  weightColumnAmbiguous: boolean; // true = hace falta preguntarle al usuario kg o lbs antes de confiar en el peso
}

/** "confirm" = usar la sugerencia tal cual. "map" = el usuario eligió OTRO ejercicio del catálogo a mano. "create" = crear como ejercicio PROPIO nuevo. "skip" = descartar todas las filas de ese nombre. */
export type ExerciseDecision =
  | { kind: 'confirm' | 'map'; exerciseId: string }
  | { kind: 'create' }
  | { kind: 'skip' };

@Injectable({ providedIn: 'root' })
export class CsvImportService {
  constructor(
    private exerciseLibrary: ExerciseLibraryService,
    private userProfile: UserProfileService,
    private workoutSession: WorkoutSessionService,
    private workoutLog: WorkoutLogService,
    private auth: AuthService,
  ) {}

  async parseFile(file: File, weightUnit: 'kg' | 'lbs' = 'kg'): Promise<ParsedImport> {
    const text = await file.text();
    const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    const headers = result.meta.fields ?? [];

    // Un solo detectImportField() por HEADER (no por celda) — arma un mapa
    // columna cruda -> campo canónico, reusado para las N filas.
    const fieldByHeader = new Map<string, ImportField>();
    for (const header of headers) {
      const field = detectImportField(header);
      if (field) fieldByHeader.set(header, field);
    }
    const headerFor = (field: ImportField): string | undefined =>
      [...fieldByHeader.entries()].find(([, f]) => f === field)?.[0];

    const dateHeader = headerFor('DATE');
    const workoutNameHeader = headerFor('WORKOUT_NAME');
    const exerciseNameHeader = headerFor('EXERCISE_NAME');
    const repsHeader = headerFor('REPS');
    const durationHeader = headerFor('DURATION_SECONDS');
    const weightHeader = headerFor('WEIGHT_KG') ?? headerFor('WEIGHT_LBS');
    const weightIsLbsColumn = !!headerFor('WEIGHT_LBS') && !headerFor('WEIGHT_KG');
    const setTypeHeader = headerFor('SET_TYPE');

    const weightColumnAmbiguous = !!weightHeader && AMBIGUOUS_WEIGHT_HEADERS.has(weightHeader.trim().toLowerCase());
    const ignoredColumns = [...new Set(fieldByHeader.values())].filter((f) => !IMPORT_FIELD_META_ACTIONABLE.has(f));

    const sessionsByKey = new Map<string, ParsedSession>();
    const exerciseNames = new Set<string>();
    let skippedRowCount = 0;

    for (const row of result.data) {
      const rawDate = dateHeader ? row[dateHeader]?.trim() : '';
      const rawExercise = exerciseNameHeader ? row[exerciseNameHeader]?.trim() : '';
      const date = rawDate ? new Date(rawDate) : null;
      const reps = repsHeader ? toNumber(row[repsHeader]) : null;
      const duration = durationHeader ? toNumber(row[durationHeader]) : null;

      // Fila inservible: sin fecha válida, sin nombre de ejercicio, o sin
      // NINGÚN valor de reps/segundos — se cuenta aparte, nunca bloquea el
      // resto del archivo (ver ROADMAP-calismap.md, el plan de esta ronda).
      if (!rawExercise || !date || isNaN(date.getTime()) || (reps === null && duration === null)) {
        skippedRowCount++;
        continue;
      }

      const isWarmup = setTypeHeader ? isWarmupValue(row[setTypeHeader]) : false;
      if (isWarmup) continue; // excluida de la vista previa por default, no cuenta como "no se pudo leer"

      let weightKg = weightHeader ? (toNumber(row[weightHeader]) ?? 0) : 0;
      if (weightIsLbsColumn || weightUnit === 'lbs') weightKg = weightKg * LBS_TO_KG;

      const workoutName = workoutNameHeader ? row[workoutNameHeader]?.trim() : '';
      const dateOnly = date.toISOString().slice(0, 10);
      const key = `${workoutName || 'Sesión libre'}__${dateOnly}`;

      let session = sessionsByKey.get(key);
      if (!session) {
        session = { key, startedAt: date.toISOString(), rows: [] };
        sessionsByKey.set(key, session);
      }
      session.rows.push({ exerciseName: rawExercise, reps, durationSeconds: duration, weightKg, isWarmup: false });
      exerciseNames.add(rawExercise);
    }

    return {
      sessions: [...sessionsByKey.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
      distinctExerciseNames: [...exerciseNames].sort((a, b) => a.localeCompare(b)),
      skippedRowCount,
      ignoredColumns,
      weightColumnAmbiguous,
    };
  }

  /**
   * Mejor candidato del catálogo para un nombre crudo del CSV — no el
   * primer match de matchesNameQuery (ese alcanza para el dropdown de
   * "parecidos" de CreateExercisePage, que solo necesita ALGO razonable),
   * acá conviene el MEJOR: coincidencia exacta normalizada > el nombre real
   * empieza con la query > la query aparece en cualquier lado del nombre.
   */
  suggestMatch(rawName: string, catalog: Exercise[]): Exercise | null {
    const q = rawName.trim().toLowerCase();
    if (!q) return null;
    const candidates = catalog.filter((e) => matchesNameQuery(rawName, e.name, e.nameSpanish, e.nameEnglish));
    if (!candidates.length) return null;

    const exact = candidates.find((e) => [e.name, e.nameSpanish, e.nameEnglish].some((n) => n.toLowerCase() === q));
    if (exact) return exact;
    const startsWith = candidates.find((e) => [e.name, e.nameSpanish, e.nameEnglish].some((n) => n.toLowerCase().startsWith(q)));
    if (startsWith) return startsWith;
    return candidates[0];
  }

  /**
   * Arma y guarda las WorkoutSession/WorkoutLog reales a partir de un
   * ParsedImport ya revisado — recién ACÁ se escribe algo, parseFile()
   * nunca toca el storage. `decisions` tiene que traer una entrada por
   * CADA nombre de `distinctExerciseNames`, ya resuelta (confirmar/mapear/
   * crear/descartar) — la pantalla de revisión no deja avanzar hasta que
   * sea así.
   */
  async commit(parsed: ParsedImport, decisions: Map<string, ExerciseDecision>): Promise<{ sessions: number; logs: number }> {
    const bodyWeightKg = this.userProfile.getBodyWeightKg();
    const userId = this.auth.user()?.id;

    // Un ejercicio propio nuevo se crea UNA sola vez por nombre distinto
    // (no una vez por fila) — cacheado acá mismo durante el commit.
    const resolvedExerciseIds = new Map<string, string>();
    for (const name of parsed.distinctExerciseNames) {
      const decision = decisions.get(name);
      if (!decision || decision.kind === 'skip') continue;
      if (decision.kind === 'confirm' || decision.kind === 'map') {
        resolvedExerciseIds.set(name, decision.exerciseId);
        continue;
      }
      if (!userId) continue; // no debería pasar — ensureSession() ya garantiza algún usuario
      const repUnit = this.inferRepUnit(name, parsed.sessions);
      const created = await this.exerciseLibrary.createOwn(
        {
          name,
          description: '',
          level: 'BEGINNER',
          category: 'PUSH',
          muscleGroups: [],
          steps: [],
          repUnit,
          ratingThresholds: { SILVER: 5, GOLD: 10, PLATINUM: 15, DIAMOND: 20 },
        },
        userId,
      );
      resolvedExerciseIds.set(name, created.id);
    }

    const sessionsToImport: { id: string; startedAt: string; endedAt: string }[] = [];
    const logsToImport: { id: string; sessionId: string; exerciseId: string; value: number; addedWeightKg: number; bodyWeightAtLog: number; loggedAt: string }[] = [];

    for (const session of parsed.sessions) {
      const rowsToKeep = session.rows.filter((r) => resolvedExerciseIds.has(r.exerciseName));
      if (!rowsToKeep.length) continue;

      const sessionId = newId();
      const startedAt = new Date(session.startedAt);
      // Cada marca necesita un loggedAt propio y distinto — separadas 1
      // minuto entre sí en el orden en que aparecían en el archivo, para
      // que el historial ordene igual que el CSV original sin necesitar
      // guardar un "set index" real (WorkoutLog no tiene esa columna).
      rowsToKeep.forEach((row, i) => {
        const loggedAt = new Date(startedAt.getTime() + i * 60_000);
        logsToImport.push({
          id: newId(),
          sessionId,
          exerciseId: resolvedExerciseIds.get(row.exerciseName)!,
          value: row.reps ?? row.durationSeconds ?? 0,
          addedWeightKg: row.weightKg,
          bodyWeightAtLog: bodyWeightKg,
          loggedAt: loggedAt.toISOString(),
        });
      });
      const lastLoggedAt = new Date(startedAt.getTime() + (rowsToKeep.length - 1) * 60_000);
      sessionsToImport.push({ id: sessionId, startedAt: session.startedAt, endedAt: lastLoggedAt.toISOString() });
    }

    await this.workoutSession.importSessions(sessionsToImport);
    await this.workoutLog.importLogs(logsToImport);
    return { sessions: sessionsToImport.length, logs: logsToImport.length };
  }

  /** 'seconds' si la mayoría de las filas de ese nombre trajeron duración y no reps; 'reps' en cualquier otro caso (default más común). */
  private inferRepUnit(exerciseName: string, sessions: ParsedSession[]): 'reps' | 'seconds' {
    let repsCount = 0;
    let durationCount = 0;
    for (const session of sessions) {
      for (const row of session.rows) {
        if (row.exerciseName !== exerciseName) continue;
        if (row.reps !== null) repsCount++;
        if (row.durationSeconds !== null) durationCount++;
      }
    }
    return durationCount > repsCount ? 'seconds' : 'reps';
  }
}

// Set derivado de IMPORT_FIELD_META una sola vez al cargar el módulo — evita
// recorrer Object.entries por cada columna reconocida de cada archivo.
const IMPORT_FIELD_META_ACTIONABLE = new Set(
  (Object.entries(IMPORT_FIELD_META) as [ImportField, { actionable: boolean }][]).filter(([, m]) => m.actionable).map(([f]) => f),
);

function toNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw.trim().replace(',', '.'));
  return isNaN(n) ? null : n;
}

function isWarmupValue(raw: string | undefined): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === 'true' || v === 'warmup' || v === 'yes' || v === '1';
}
