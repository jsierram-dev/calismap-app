import { Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';
import { MuscleGroup } from '../../models/exercise.model';
import { I18nService } from '../../core/services/i18n.service';

interface MuscleRegion {
  regionKey: string;
  muscles: MuscleGroup[];
}

// Agrupado por "músculo principal" en vocabulario de gimnasio (Piernas/
// Pecho/Espalda/Hombros/Brazos/Core) — DISTINTO de MUSCLE_GROUPS_BY_REGION
// en exercise.model.ts (esa agrupación, PUSH/PULL/LEGS/CORE, es solo
// organización interna del código). Ver ROADMAP-calismap.md, "Taxonomía de
// músculos" y "Corrección de UX en el filtro de músculos".
//
// Sin label fijo acá (17/08/2026, ver ROADMAP-calismap.md "Traducciones")
// — regionKey/cada MuscleGroup se traducen recién en el template vía
// i18n.t('enums.region.'+regionKey)/i18n.t('enums.muscle.'+muscle), para
// que cambiar el idioma en Ajustes actualice esta lista sin recargar nada.
const REGIONS: MuscleRegion[] = [
  { regionKey: 'legs', muscles: ['CUADRICEPS', 'ISQUIOTIBIALES', 'GLUTEOS', 'GEMELOS', 'ADUCTORES'] },
  { regionKey: 'chest', muscles: ['PECTORAL'] },
  { regionKey: 'back', muscles: ['DORSAL_ANCHO', 'TRAPECIO', 'ROMBOIDES', 'LUMBARES'] },
  { regionKey: 'shoulders', muscles: ['DELTOIDES_ANTERIOR', 'DELTOIDES_POSTERIOR'] },
  { regionKey: 'arms', muscles: ['BICEPS', 'TRICEPS', 'ANTEBRAZOS'] },
  { regionKey: 'core', muscles: ['RECTO_ABDOMINAL', 'OBLICUOS', 'TRANSVERSO_ABDOMINAL', 'SERRATO_ANTERIOR'] },
];

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

  regions = REGIONS;
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
