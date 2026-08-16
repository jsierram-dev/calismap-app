import { Injectable } from '@angular/core';
import { RATING_ORDER, Rating, RatingThresholds } from '../models/exercise.model';

const REFERENCE_BODYWEIGHT = 75; // kg

@Injectable({ providedIn: 'root' })
export class RatingCalculatorService {
  /**
   * effectiveValue = value × (bodyWeight + addedWeight) / 75 — mismo cálculo
   * que la columna generada de Postgres en calismap-back (ver
   * migrations/001_init.sql y models/workout-log.model.ts). addedWeight
   * puede ser NEGATIVO a propósito (asistencia real con banda/máquina para
   * variantes que todavía no se pueden a peso completo) — la fórmula lo
   * resuelve sin casos especiales.
   *
   * Corregido 15 de agosto de 2026: la versión anterior no sumaba
   * addedWeight — quedó desalineada quedó el día que se agregó ese campo al
   * modelo (ver ROADMAP-calismap.md).
   */
  calculate(value: number, bodyWeight: number, addedWeight: number, thresholds: RatingThresholds): Rating {
    if (value <= 0) return 'BRONZE';

    const effective = (value * (bodyWeight + addedWeight)) / REFERENCE_BODYWEIGHT;

    if (effective >= thresholds.DIAMOND) return 'DIAMOND';
    if (effective >= thresholds.PLATINUM) return 'PLATINUM';
    if (effective >= thresholds.GOLD) return 'GOLD';
    if (effective >= thresholds.SILVER) return 'SILVER';
    return 'BRONZE';
  }

  /** Rating derivado del MEJOR effectiveValue ya calculado (ver workout-log.model.ts). */
  ratingForEffectiveValue(effective: number, thresholds: RatingThresholds): Rating {
    if (effective >= thresholds.DIAMOND) return 'DIAMOND';
    if (effective >= thresholds.PLATINUM) return 'PLATINUM';
    if (effective >= thresholds.GOLD) return 'GOLD';
    if (effective >= thresholds.SILVER) return 'SILVER';
    return 'BRONZE';
  }

  /** Valor mínimo (reps/segundos, sin peso agregado) para llegar al rating pedido, a este peso corporal. */
  valueNeededFor(targetRating: Rating, bodyWeight: number, thresholds: RatingThresholds): number {
    const threshold = thresholds[targetRating as keyof RatingThresholds] ?? 1;
    return Math.ceil((threshold * REFERENCE_BODYWEIGHT) / bodyWeight);
  }

  /** True si ratingA >= ratingB en el orden de progresión. */
  meetsOrExceeds(ratingA: Rating, ratingB: Rating): boolean {
    return RATING_ORDER.indexOf(ratingA) >= RATING_ORDER.indexOf(ratingB);
  }

  /** Umbral de la tabla para un rating dado (null/BRONZE = 1). */
  getThresholdFor(rating: Rating, thresholds: RatingThresholds): number {
    if (rating === 'BRONZE') return 1;
    return thresholds[rating as keyof RatingThresholds];
  }
}
