import { Component, EventEmitter, Input, OnChanges, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RepUnit } from '../../models/exercise.model';

export interface SetEntry {
  // id real del WorkoutLog — solo en series YA registradas (done), permite
  // deshacer una marca puntual sin ambigüedad de a cuál se refiere
  // (hallazgo #5 de pruebas reales en móvil, ver ROADMAP-calismap.md).
  id?: string;
  value: number | null;
  addedWeightKg: number;
  done: boolean;
}

export interface SetDoneEvent {
  setIndex: number;
  value: number;
  addedWeightKg: number;
}

export type ItemDropdownMode = 'logging' | 'prescription';

// Compartido — mismo shell (fila colapsable + formulario) en 2 modos:
// logging (dentro de SessionWorkoutComponent, una fila por serie ya
// registrada, con botón "hecho") y prescripción (dentro de
// RoutineManagementComponent, series/objetivo con stepper, sin botón
// "hecho"). Nombrado por el mecanismo (desplegable), no por el contexto de
// sesión — el usuario lo corrigió de "SessionItemComponent" a este nombre.
// Ver ROADMAP-calismap.md.
@Component({
  selector: 'app-item-dropdown',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './item-dropdown.component.html',
  styleUrl: './item-dropdown.component.css',
})
export class ItemDropdownComponent implements OnChanges {
  @Input({ required: true }) mode: ItemDropdownMode = 'logging';
  @Input({ required: true }) exerciseName = '';
  @Input({ required: true }) repUnit: RepUnit = 'reps';
  @Input() customBadge = false;

  // Modo logging
  @Input() sets: SetEntry[] = [];
  @Output() setDone = new EventEmitter<SetDoneEvent>();
  // Hallazgos #5 y #10 de pruebas reales en móvil (16/08/2026, ver
  // ROADMAP-calismap.md) — el círculo entre la foto y el nombre ahora
  // togglea TODAS las series de una: checkAll con los valores actuales de
  // cada serie pendiente (mismo criterio que markDone, uno por serie) si
  // todavía falta alguna; uncheckAll (borra los WorkoutLog reales, vuelve
  // todo a pendiente) si ya estaban todas hechas. undoSet deshace una serie
  // puntual sin tocar el resto — el checkmark estático de una serie hecha
  // pasa a ser un botón real.
  @Output() checkAll = new EventEmitter<SetDoneEvent[]>();
  @Output() uncheckAll = new EventEmitter<void>();
  @Output() undoSet = new EventEmitter<string>();

  // Modo prescripción
  @Input() targetSets = 3;
  @Input() targetValue: number | null = null;
  @Output() targetSetsChange = new EventEmitter<number>();
  @Output() targetValueChange = new EventEmitter<number | null>();
  @Output() removed = new EventEmitter<void>();

  expanded = signal(false);

  // Borrador editable de cada serie pendiente (reps/peso propuestos antes
  // de tocar "hecho") — clonado de @Input() sets, nunca lo muta directo:
  // una serie ya registrada es inmutable (ver WorkoutLog en el modelo).
  draftValue: (number | null)[] = [];
  draftWeight: number[] = [];

  ngOnChanges(): void {
    this.draftValue = this.sets.map((s) => s.value);
    this.draftWeight = this.sets.map((s) => s.addedWeightKg);
  }

  toggle(): void {
    this.expanded.update((v) => !v);
  }

  get doneCount(): number {
    return this.sets.filter((s) => s.done).length;
  }

  get allDone(): boolean {
    return this.sets.length > 0 && this.doneCount === this.sets.length;
  }

  get progressDeg(): number {
    return this.sets.length ? (this.doneCount / this.sets.length) * 360 : 0;
  }

  get subtitle(): string {
    const unit = this.repUnit === 'reps' ? 'reps' : 'seg';
    if (this.mode === 'logging') {
      return this.targetValue ? `${this.sets.length} series × ${this.targetValue} ${unit}` : `${this.sets.length} series`;
    }
    return this.targetValue ? `${this.targetSets} series × ${this.targetValue} ${unit}` : `${this.targetSets} series · las que puedas`;
  }

  markDone(index: number): void {
    this.setDone.emit({
      setIndex: index,
      value: this.draftValue[index] ?? 0,
      addedWeightKg: this.draftWeight[index] ?? 0,
    });
  }

  /** Click en el círculo — togglea según el estado ACTUAL, nunca los dos a la vez. */
  onCheckClick(event: Event): void {
    event.stopPropagation(); // no debe también expandir/colapsar la fila
    if (this.allDone) {
      this.uncheckAll.emit();
    } else {
      const events: SetDoneEvent[] = [];
      this.sets.forEach((set, index) => {
        if (!set.done) {
          events.push({ setIndex: index, value: this.draftValue[index] ?? 0, addedWeightKg: this.draftWeight[index] ?? 0 });
        }
      });
      this.checkAll.emit(events);
    }
  }

  onUndoSet(id: string | undefined, event: Event): void {
    event.stopPropagation();
    if (id) this.undoSet.emit(id);
  }

  stepWeight(index: number, delta: number): void {
    this.draftWeight[index] = (this.draftWeight[index] ?? 0) + delta;
  }

  stepTargetSets(delta: number): void {
    this.targetSetsChange.emit(Math.max(1, this.targetSets + delta));
  }

  stepTargetValue(delta: number): void {
    this.targetValueChange.emit(Math.max(0, (this.targetValue ?? 0) + delta));
  }

  onRowClick(event: Event): void {
    // El botón de quitar/marcar hecho vive DENTRO de la fila clickeable —
    // sin esto, tocarlo también dispararía el toggle de expandir/colapsar.
    if ((event.target as HTMLElement).closest('.remove-btn, .set-done-btn')) return;
    this.toggle();
  }
}
