import { Component, OnDestroy, OnInit, input, signal } from '@angular/core';

// Mismo copy y mismos umbrales (4s/20s) que el splash pre-Angular de
// index.html (16/08/2026, ver ROADMAP-calismap.md "Pantalla de carga
// inicial") — el back vive en Render free tier, así que CUALQUIER pantalla
// que dependa de una red fría (no solo el arranque de la app) puede tardar
// de verdad. Extendido acá el 17/08/2026 (ver ROADMAP-calismap.md "Segunda
// ronda de pulido real") — RoadmapsPage/LibraryPage tienen su propio
// loading() de RESPALDO para cuando el precalentamiento de app.config.ts
// falla o todavía no terminó (ver ese archivo); antes ese respaldo mostraba
// un label estático sin escalar, así que una espera larga ahí se sentía
// exactamente igual de "colgada" que el problema original que motivó el
// splash — con la diferencia de que esta vez no había ningún mensaje
// explicando el porqué.
const PROGRESSIVE_MESSAGES: [number, string][] = [
  [4000, 'Despertando el servidor, puede tardar unos segundos…'],
  [20000, 'Esto está tardando más de lo normal. Podés seguir esperando o volver a intentar.'],
];

/**
 * Indicador de carga reusable — misma cadena de puntos que el splash
 * pre-Angular de index.html y que .path-dot/.path-line de las tarjetas de
 * roadmap: reusa a propósito el mismo lenguaje visual de "progresión" en
 * vez de un spinner genérico. `label` es el mensaje inicial (específico de
 * la pantalla, ej. "Cargando tus roadmaps…") — si la carga se extiende,
 * escala solo a los mismos mensajes genéricos del splash, sin que cada
 * página tenga que repetir esa lógica.
 */
@Component({
  selector: 'app-path-loader',
  standalone: true,
  templateUrl: './path-loader.component.html',
  styleUrl: './path-loader.component.css',
})
export class PathLoaderComponent implements OnInit, OnDestroy {
  label = input<string | null>(null);
  displayLabel = signal<string | null>(null);
  private timers: ReturnType<typeof setTimeout>[] = [];

  ngOnInit(): void {
    this.displayLabel.set(this.label());
    this.timers = PROGRESSIVE_MESSAGES.map(([delay, message]) => setTimeout(() => this.displayLabel.set(message), delay));
  }

  ngOnDestroy(): void {
    this.timers.forEach(clearTimeout);
  }
}
