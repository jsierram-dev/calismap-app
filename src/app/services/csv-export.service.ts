import { Injectable } from '@angular/core';
import Papa from 'papaparse';
import { I18nService } from '../core/services/i18n.service';
import { ExerciseLibraryService } from './exercise-library.service';
import { TrainingHistoryService } from './training-history.service';
import { WorkoutLogService } from './workout-log.service';

// Exportador de CSV (22/09/2026, pedido explícito del usuario, mismo día
// que se construyó el importador — ver ROADMAP-calismap.md) — mucho más
// simple que importar: es DATO PROPIO, sin ambigüedad de nombre de
// ejercicio que resolver (ya sabemos exactamente qué es cada fila), así
// que no hace falta ninguna pantalla de revisión, un solo click alcanza.
//
// Los headers usan el MISMO vocabulario ya confirmado en
// core/utils/import-column-synonyms.ts (Fecha/Nombre de Entrenamiento/
// Nombre del Ejercicio/Orden de las series/Peso (kg)/Reps/Segundos) — un
// archivo exportado acá y reimportado después con el importador de esta
// misma app matchea perfecto sin ninguna ambigüedad (a diferencia de
// "Weight"/"Peso" de otras apps, acá la unidad va explícita en el header
// porque no hace falta preguntarle nada a nadie, ya la sabemos).
@Injectable({ providedIn: 'root' })
export class CsvExportService {
  constructor(
    private trainingHistory: TrainingHistoryService,
    private workoutLog: WorkoutLogService,
    private exerciseLibrary: ExerciseLibraryService,
    private i18n: I18nService,
  ) {}

  async exportAll(): Promise<{ rowCount: number }> {
    // getOverview() ya resuelve el nombre de cada sesión (rutina oficial/
    // propia, o "Sesión libre") — mismo criterio que usa el calendario de
    // Perfil, no hace falta re-derivarlo acá (routineNames/ownRoutineNames
    // quedan adentro de TrainingHistoryService, un solo lugar que sabe
    // resolver esto).
    const [{ history }, logs, catalog] = await Promise.all([
      this.trainingHistory.getOverview(),
      this.workoutLog.getAll(),
      this.exerciseLibrary.getAll(),
    ]);
    const sessionNameById = new Map(history.map((h) => [h.session.id, h.name]));
    const exerciseById = new Map(catalog.map((e) => [e.id, e]));
    const headers = this.i18n.lang() === 'en' ? HEADERS_EN : HEADERS_ES;

    // "Orden de las series" no es una columna real de WorkoutLog — se
    // deriva acá agrupando por (sessionId, exerciseId) y numerando en
    // orden cronológico, mismo criterio que el importador usa a la
    // inversa (ver CsvImportService.commit()).
    const setOrderBySessionExercise = new Map<string, number>();
    const rows = logs
      .filter((log) => sessionNameById.has(log.sessionId))
      .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt))
      .map((log) => {
        const exercise = exerciseById.get(log.exerciseId);
        if (!exercise) return null; // catálogo inconsistente, no debería pasar — se salta, mismo criterio que el resto de la app
        const groupKey = `${log.sessionId}__${log.exerciseId}`;
        const setOrder = (setOrderBySessionExercise.get(groupKey) ?? 0) + 1;
        setOrderBySessionExercise.set(groupKey, setOrder);
        return {
          [headers.date]: formatLocalDateTime(log.loggedAt),
          [headers.workoutName]: sessionNameById.get(log.sessionId)!,
          [headers.exerciseName]: exercise.name,
          [headers.setOrder]: setOrder,
          [headers.weightKg]: log.addedWeightKg,
          [headers.reps]: exercise.repUnit === 'reps' ? log.value : '',
          [headers.seconds]: exercise.repUnit === 'seconds' ? log.value : '',
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const csv = Papa.unparse(rows);
    const filename = `calismap-export-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadTextFile(csv, filename);
    return { rowCount: rows.length };
  }
}

const HEADERS_ES = {
  date: 'Fecha',
  workoutName: 'Nombre de Entrenamiento',
  exerciseName: 'Nombre del Ejercicio',
  setOrder: 'Orden de las series',
  weightKg: 'Peso (kg)',
  reps: 'Reps',
  seconds: 'Segundos',
};

const HEADERS_EN = {
  date: 'Date',
  workoutName: 'Workout Name',
  exerciseName: 'Exercise Name',
  setOrder: 'Set Order',
  weightKg: 'Weight (kg)',
  reps: 'Reps',
  seconds: 'Seconds',
};

/** "YYYY-MM-DD HH:MM:SS" en hora LOCAL — mismo formato que Strong/Liftoff (ver import-column-synonyms.ts), para que el archivo se vea igual de familiar que el de cualquier otra app y el importador de esta misma app lo reconozca sin fricción. */
function formatLocalDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Blob + <a download> temporal — descarga client-side pura, sin backend (mismo espíritu local-first que el resto de la app). */
function downloadTextFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
