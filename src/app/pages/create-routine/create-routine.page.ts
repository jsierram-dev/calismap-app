import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ModalController } from '@ionic/angular/standalone';
import { Exercise } from '../../models/exercise.model';
import { UserRoutineExerciseEntry } from '../../models/user-routine.model';
import { AuthService } from '../../core/services/auth.service';
import { UserRoutineService } from '../../services/user-routine.service';
import { ItemDropdownComponent } from '../../shared/item-dropdown/item-dropdown.component';
import { LoginComponent } from '../../shared/login/login.component';
import { LibraryPage } from '../library/library.page';

interface DraftItem {
  exercise: Exercise;
  targetSets: number;
  targetValue: number | null;
}

// Pantalla 08 — RoutineManagementComponent (ver COMPONENTES-calismap.md):
// cada fila reusa ItemDropdownComponent en modo "prescripción" (series+
// objetivo con stepper, sin check de logging) — mismo componente que la
// sesión activa (paso 07). "Agregar ejercicio" abre LibraryComponent en
// modal (mismo mecanismo picker que "Registrar otro ejercicio" en
// SessionWorkoutComponent, ver ese archivo).
@Component({
  selector: 'app-create-routine',
  standalone: true,
  imports: [FormsModule, ItemDropdownComponent, LibraryPage],
  templateUrl: './create-routine.page.html',
  styleUrl: './create-routine.page.css',
})
export class CreateRoutinePage {
  name = signal('');
  items = signal<DraftItem[]>([]);
  pickerOpen = signal(false);

  constructor(
    private userRoutineService: UserRoutineService,
    private auth: AuthService,
    private router: Router,
    private modalCtrl: ModalController,
  ) {}

  onExercisePicked(exercise: Exercise): void {
    this.pickerOpen.set(false);
    if (this.items().some((it) => it.exercise.id === exercise.id)) return;
    this.items.update((list) => [...list, { exercise, targetSets: 3, targetValue: exercise.repUnit === 'reps' ? 10 : 30 }]);
  }

  updateTargetSets(index: number, value: number): void {
    this.items.update((list) => list.map((it, i) => (i === index ? { ...it, targetSets: value } : it)));
  }

  updateTargetValue(index: number, value: number | null): void {
    this.items.update((list) => list.map((it, i) => (i === index ? { ...it, targetValue: value } : it)));
  }

  removeItem(index: number): void {
    this.items.update((list) => list.filter((_, i) => i !== index));
  }

  get canSave(): boolean {
    return this.name().trim().length > 0 && this.items().length > 0;
  }

  async save(): Promise<void> {
    if (!this.canSave) return;
    const exercises: UserRoutineExerciseEntry[] = this.items().map((it, order) => ({
      exerciseId: it.exercise.id,
      order,
      targetSets: it.targetSets,
      targetValue: it.targetValue,
    }));
    await this.userRoutineService.create(this.name().trim(), exercises);

    // Guardar una rutina propia es uno de los 4 momentos con motivo real
    // para pedirle cuenta a un invitado (ver ROADMAP-calismap.md "Login:
    // OPCIONAL") — no bloqueante, la rutina ya se guardó antes de mostrarlo.
    if (this.auth.isGuest()) {
      const modal = await this.modalCtrl.create({ component: LoginComponent });
      await modal.present();
    }
    this.router.navigateByUrl('/choose-session');
  }
}
