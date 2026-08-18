import { Injectable } from '@angular/core';
import { WorkoutSession } from '../models/workout-session.model';
import { MUSCLE_REGIONS, regionsForMuscleGroups } from '../core/utils/muscle-regions';
import { I18nService } from '../core/services/i18n.service';
import { ExerciseLibraryService } from './exercise-library.service';
import { RoutineService } from './routine.service';
import { UserRoutineService } from './user-routine.service';
import { WorkoutLogService } from './workout-log.service';
import { WorkoutSessionService } from './workout-session.service';

/**
 * Horas de descanso recomendadas para el mismo grupo muscular antes de
 * volver a entrenarlo — 18/08/2026, ver ROADMAP-calismap.md "Pantalla de
 * Perfil". Un solo número para las 6 regiones (no uno distinto por región)
 * a propósito: es el piso mínimo, consistente y ampliamente citado (ACSM,
 * ver fuentes reales en catalog-sources.page.ts) — algunas fuentes de menor
 * calidad dan números más finos por músculo (ej. "pecho 56h, piernas 60h")
 * sin respaldo real consistente entre ellas, así que en vez de inventar
 * precisión que no se puede sostener, se usa el piso de 48h para las 6.
 */
export const RECOVERY_HOURS = 48;

export interface SessionHistoryEntry {
  session: WorkoutSession;
  name: string; // nombre de la rutina oficial/propia, o "Sesión libre" — mismo fallback que "Elegir sesión"
  regionKeys: string[]; // regiones tocadas ese día — vacío si no se logueó ninguna marca (sesión sin registrar nada)
}

export interface RegionRecovery {
  regionKey: string;
  lastTrainedAt: string | null; // ISO de la marca más reciente que tocó esta región — null = nunca entrenada
  readyAt: string | null; // lastTrainedAt + RECOVERY_HOURS — null = ya lista (nunca entrenada, nada que esperar)
  isReady: boolean;
}

/**
 * Historial de entrenamiento derivado de WorkoutSession/WorkoutLog — mismo
 * criterio que RoadmapService/SessionAchievementsService: nada se guarda
 * acá, todo se recalcula sobre datos que ya existen (local-first). Un solo
 * recorrido de todas las sesiones alimenta a la vez el calendario/historial
 * Y el temporizador de descanso por región, para no recorrer el mismo
 * WorkoutLog dos veces.
 */
@Injectable({ providedIn: 'root' })
export class TrainingHistoryService {
  constructor(
    private workoutSession: WorkoutSessionService,
    private workoutLog: WorkoutLogService,
    private exerciseLibrary: ExerciseLibraryService,
    private routineService: RoutineService,
    private userRoutineService: UserRoutineService,
    private i18n: I18nService,
  ) {}

  async getOverview(): Promise<{ history: SessionHistoryEntry[]; recovery: RegionRecovery[] }> {
    const sessions = (await this.workoutSession.getAll()).filter((s) => !s.deletedAt);
    const [routines, ownRoutines] = await Promise.all([this.routineService.getAll(), this.userRoutineService.getAll()]);
    const routineNames = new Map(routines.map((r) => [r.id, r.name]));
    const ownRoutineNames = new Map(ownRoutines.map((r) => [r.id, r.name]));

    // regionKey -> loggedAt ISO más reciente visto hasta ahora — comparación
    // lexicográfica de strings ISO 8601 (mismo formato siempre, toISOString())
    // refleja el orden cronológico real sin necesitar parsear a Date cada vez.
    const lastTrainedAt = new Map<string, string>();
    const history: SessionHistoryEntry[] = [];

    for (const session of sessions) {
      const logs = await this.workoutLog.getForSession(session.id);
      const regionSet = new Set<string>();
      for (const log of logs) {
        const exercise = await this.exerciseLibrary.getById(log.exerciseId);
        if (!exercise) continue; // catálogo inconsistente — no debería pasar, se salta (mismo criterio que el resto de la app)
        for (const regionKey of regionsForMuscleGroups(exercise.muscleGroups)) {
          regionSet.add(regionKey);
          const prev = lastTrainedAt.get(regionKey);
          if (!prev || log.loggedAt > prev) lastTrainedAt.set(regionKey, log.loggedAt);
        }
      }

      const name = session.routineId
        ? (routineNames.get(session.routineId) ?? this.i18n.t('session.freeSessionFallback'))
        : session.userRoutineId
          ? (ownRoutineNames.get(session.userRoutineId) ?? this.i18n.t('session.freeSessionFallback'))
          : this.i18n.t('session.freeSessionFallback');

      history.push({ session, name, regionKeys: [...regionSet] });
    }

    const now = Date.now();
    const recovery: RegionRecovery[] = MUSCLE_REGIONS.map((region) => {
      const last = lastTrainedAt.get(region.regionKey) ?? null;
      const readyAt = last ? new Date(new Date(last).getTime() + RECOVERY_HOURS * 3_600_000).toISOString() : null;
      return { regionKey: region.regionKey, lastTrainedAt: last, readyAt, isReady: !readyAt || new Date(readyAt).getTime() <= now };
    });

    return { history, recovery };
  }
}
