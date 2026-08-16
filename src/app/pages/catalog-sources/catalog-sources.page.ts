import { Component } from '@angular/core';

// Página de contenido estático (mismo patrón que un "Términos y
// condiciones": texto fijo, sin datos del usuario ni llamadas a servicios)
// — pedida por el usuario el 16/08/2026 para que quede claro, con fuentes
// reales y enlaces, de dónde sale el catálogo (roadmaps/ejercicios/
// umbrales) y qué parte es estimación de diseño vs. dato publicado. Ver
// ROADMAP-calismap.md, sección "Contenido real del catálogo (plan)" — el
// texto de acá refleja exactamente lo que ese documento ya reconocía
// (un solo umbral respaldado por un estándar publicado, el resto son
// estimaciones razonables), no una versión más optimista para quedar bien.
@Component({
  selector: 'app-catalog-sources',
  standalone: true,
  templateUrl: './catalog-sources.page.html',
  styleUrl: './catalog-sources.page.css',
})
export class CatalogSourcesPage {}
