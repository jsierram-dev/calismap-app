import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Rating } from '../../models/exercise.model';

export type RouteNodeState = 'done' | 'current' | 'locked';

// Un nodo del camino — cubre los dos usos (pasos de un roadmap, escalera de
// rating de un ejercicio) con el mismo shape, ver ROADMAP-calismap.md,
// "Patrón de nodos conectados". Algunos campos solo tienen sentido en un
// uso: ratingBadge (roadmap, el rating ya alcanzado en ese paso) y
// stepNumber (roadmap, el punto del nodo "current" muestra el número de
// paso; en la escalera de rating queda vacío).
export interface RouteNode {
  title: string;
  levelLabel: string;
  state: RouteNodeState;
  // id del ejercicio real — solo tiene sentido en el uso "pasos de un
  // roadmap" (hallazgo #1 de pruebas reales en móvil, 16/08/2026, ver
  // ROADMAP-calismap.md: un paso disponible ahora navega a su
  // ExerciseInfoComponent). En el uso "escalera de rating" ([mini]=true)
  // los nodos son TIERS, no ejercicios — ahí queda sin setear a propósito,
  // nunca se vuelven clickeables.
  exerciseId?: string;
  stepNumber?: number;
  isTarget?: boolean;
  ratingBadge?: Rating;
  metaText?: string;
  // Texto plano — el mockup resaltaba números en negrita dentro de la
  // oración ("12 reps y desbloqueás..."); se simplifica acá para no
  // depender de innerHTML con contenido armado por otros componentes.
  coachNote?: { headline: string; sub: string };
  progressPercent?: number;
}

// Compartido — mismo componente a dos escalas: pasos de un roadmap
// (RoadmapComponent, pantalla 02) y escalera de rating dentro de un
// ejercicio (ExerciseInfoComponent, pantalla 03, con [mini]="true"). Ver
// ROADMAP-calismap.md, "RouteComponent es un único componente
// parametrizable a dos escalas".
@Component({
  selector: 'app-route',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './route.component.html',
  styleUrl: './route.component.css',
})
export class RouteComponent {
  @Input({ required: true }) nodes: RouteNode[] = [];
  @Input() mini = false;

  ratingLabel(rating: Rating): string {
    return rating.charAt(0) + rating.slice(1).toLowerCase();
  }

  /** null desactiva el routerLink del todo (sin href, sin navegación) — ver ROADMAP-calismap.md, hallazgo #1. */
  linkFor(node: RouteNode): string[] | null {
    return node.exerciseId && node.state !== 'locked' ? ['/exercises', node.exerciseId] : null;
  }
}
