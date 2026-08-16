import { Component, input } from '@angular/core';

/**
 * Indicador de carga reusable — misma cadena de puntos que el splash
 * pre-Angular de index.html (16/08/2026, ver ROADMAP-calismap.md "Pantalla
 * de carga inicial") y que .path-dot/.path-line de las tarjetas de roadmap:
 * reusa a propósito el mismo lenguaje visual de "progresión" en vez de un
 * spinner genérico. `label` opcional para pantallas donde conviene decir
 * qué se está cargando (RoadmapsPage la usa sin label, ya tiene su propio
 * título arriba).
 */
@Component({
  selector: 'app-path-loader',
  standalone: true,
  templateUrl: './path-loader.component.html',
  styleUrl: './path-loader.component.css',
})
export class PathLoaderComponent {
  label = input<string | null>(null);
}
