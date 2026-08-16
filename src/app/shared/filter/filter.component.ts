import { Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';
import { MuscleGroup } from '../../models/exercise.model';

interface MuscleOption {
  value: MuscleGroup;
  label: string;
}

interface MuscleRegion {
  label: string;
  muscles: MuscleOption[];
}

// Agrupado por "músculo principal" en vocabulario de gimnasio (Piernas/
// Pecho/Espalda/Hombros/Brazos/Core) — DISTINTO de MUSCLE_GROUPS_BY_REGION
// en exercise.model.ts (esa agrupación, PUSH/PULL/LEGS/CORE, es solo
// organización interna del código). Ver ROADMAP-calismap.md, "Taxonomía de
// músculos" y "Corrección de UX en el filtro de músculos".
const REGIONS: MuscleRegion[] = [
  {
    label: 'Piernas',
    muscles: [
      { value: 'CUADRICEPS', label: 'Cuádriceps' },
      { value: 'ISQUIOTIBIALES', label: 'Isquiotibiales' },
      { value: 'GLUTEOS', label: 'Glúteos' },
      { value: 'GEMELOS', label: 'Gemelos' },
      { value: 'ADUCTORES', label: 'Aductores' },
    ],
  },
  {
    label: 'Pecho',
    muscles: [{ value: 'PECTORAL', label: 'Pectoral' }],
  },
  {
    label: 'Espalda',
    muscles: [
      { value: 'DORSAL_ANCHO', label: 'Dorsales' },
      { value: 'TRAPECIO', label: 'Trapecio' },
      { value: 'ROMBOIDES', label: 'Romboides' },
      { value: 'LUMBARES', label: 'Lumbares' },
    ],
  },
  {
    label: 'Hombros',
    muscles: [
      { value: 'DELTOIDES_ANTERIOR', label: 'Deltoides anterior' },
      { value: 'DELTOIDES_POSTERIOR', label: 'Deltoides posterior' },
    ],
  },
  {
    label: 'Brazos',
    muscles: [
      { value: 'BICEPS', label: 'Bíceps' },
      { value: 'TRICEPS', label: 'Tríceps' },
      { value: 'ANTEBRAZOS', label: 'Antebrazos' },
    ],
  },
  {
    label: 'Core',
    muscles: [
      { value: 'RECTO_ABDOMINAL', label: 'Abdominales' },
      { value: 'OBLICUOS', label: 'Oblicuos' },
      { value: 'TRANSVERSO_ABDOMINAL', label: 'Transverso abdominal' },
      { value: 'SERRATO_ANTERIOR', label: 'Serrato anterior' },
    ],
  },
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
