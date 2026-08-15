import { Injectable, signal } from '@angular/core';

// Resumen mínimo para el navbar/barra flotante — no el WorkoutSession
// completo, solo lo que hace falta pintar.
export interface ActiveSessionSummary {
  name: string; // nombre de la rutina, o "Sesión libre"
  startedAt: string;
}

/**
 * Estado compartido de "hay una sesión corriendo, en cualquier pantalla" —
 * NavbarComponent (dot-badge del tab) y NoticeSessionComponent (barra
 * flotante) leen esto, WorkoutSessionService (paso 5, todavía no existe) lo
 * escribe al empezar/terminar una sesión. Mismo motivo que las colecciones
 * auto-registradas de SyncService: evita que estos 2 componentes globales
 * dependan de un servicio de dominio que se construye después — ver
 * ROADMAP-calismap.md, "Roadmap por fases".
 */
@Injectable({ providedIn: 'root' })
export class ActiveSessionIndicatorService {
  current = signal<ActiveSessionSummary | null>(null);

  set(summary: ActiveSessionSummary): void {
    this.current.set(summary);
  }

  clear(): void {
    this.current.set(null);
  }
}
