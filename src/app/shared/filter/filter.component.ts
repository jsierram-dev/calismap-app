import { Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';
import { MuscleGroup } from '../../models/exercise.model';
import { I18nService } from '../../core/services/i18n.service';
import { MUSCLE_REGIONS } from '../../core/utils/muscle-regions';

// Agrupado por "músculo principal" en vocabulario de gimnasio (Piernas/
// Pecho/Espalda/Hombros/Brazos/Core) — extraído a core/utils/muscle-regions.ts
// el 18/08/2026 (ver ROADMAP-calismap.md "Pantalla de Perfil"), la pantalla
// de Perfil usa la misma taxonomía para el temporizador de descanso por
// parte del cuerpo. DISTINTO de MUSCLE_GROUPS_BY_REGION en calismap-back
// (esa agrupación, PUSH/PULL/LEGS/CORE, es solo organización interna del
// código del servidor). Ver ROADMAP-calismap.md, "Taxonomía de músculos" y
// "Corrección de UX en el filtro de músculos".
//
// Sin label fijo acá (17/08/2026, ver ROADMAP-calismap.md "Traducciones")
// — regionKey/cada MuscleGroup se traducen recién en el template vía
// i18n.t('enums.region.'+regionKey)/i18n.t('enums.muscle.'+muscle), para
// que cambiar el idioma en Ajustes actualice esta lista sin recargar nada.

// Compartido — hermano de SearchComponent, no anidado adentro (corrección
// del usuario, 15 de agosto). El botón de filtro vive en SearchComponent,
// pero abre este componente vía evento hacia el padre — ver
// ROADMAP-calismap.md, "Nombres propuestos por el usuario".
@Component({
  selector: 'app-filter',
  standalone: true,
  templateUrl: './filter.component.html',
  styleUrl: './filter.component.css',
})
export class FilterComponent {
  @Input() open = false;
  @Output() closed = new EventEmitter<void>();
  @Output() applied = new EventEmitter<MuscleGroup[]>();

  regions = MUSCLE_REGIONS;
  private selected = signal<Set<MuscleGroup>>(new Set());
  selectedCount = computed(() => this.selected().size);

  constructor(public i18n: I18nService) {}

  isChecked(value: MuscleGroup): boolean {
    return this.selected().has(value);
  }

  toggle(value: MuscleGroup): void {
    const next = new Set(this.selected());
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    this.selected.set(next);
  }

  clear(): void {
    this.selected.set(new Set());
  }

  apply(): void {
    this.applied.emit(Array.from(this.selected()));
    this.closed.emit();
  }

  close(): void {
    this.closed.emit();
  }
}
