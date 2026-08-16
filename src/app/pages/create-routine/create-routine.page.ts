import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ModalController } from '@ionic/angular/standalone';
import { Exercise } from '../../models/exercise.model';
import { RoutineExerciseInput } from '../../models/routine.model';
import { UserRoutineExerciseEntry } from '../../models/user-routine.model';
import { AuthService } from '../../core/services/auth.service';
import { ExerciseLibraryService } from '../../services/exercise-library.service';
import { RoutineService } from '../../services/routine.service';
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
//
// Modo admin (agregado 16/08/2026, ver ROADMAP-calismap.md "Panel de
// administración"): mismo componente reusado — pedido explícito del
// usuario — para /admin/routines/new y /admin/routines/:id/edit (route
// data `{ admin: true }`). En modo admin guarda contra el catálogo real de
// Routine (adminCreate + adminReplaceExercises) en vez de UserRoutine
// propia, y habilita edición de una ya existente.
@Component({
  selector: 'app-create-routine',
  standalone: true,
  imports: [FormsModule, ItemDropdownComponent, LibraryPage],
  templateUrl: './create-routine.page.html',
  styleUrl: './create-routine.page.css',
})
export class CreateRoutinePage implements OnInit {
  isAdminMode = false;
  editingId = signal<string | null>(null);
  currentExerciseRowIds = signal<string[]>([]); // ids reales de RoutineExercise, para poder borrarlos al re-guardar

  name = signal('');
  description = signal('');
  items = signal<DraftItem[]>([]);
  pickerOpen = signal(false);
  saving = signal(false);

  constructor(
    private userRoutineService: UserRoutineService,
    private routineService: RoutineService,
    private exerciseLibrary: ExerciseLibraryService,
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private modalCtrl: ModalController,
  ) {}

  async ngOnInit(): Promise<void> {
    this.isAdminMode = this.route.snapshot.data['admin'] === true;
    if (!this.isAdminMode) return;

    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.editingId.set(id);
    const detail = await this.routineService.getDetail(id);
    if (!detail) return;
    this.name.set(detail.name);
    this.description.set(detail.description);
    this.currentExerciseRowIds.set(detail.exercises.map((e) => e.id));

    const sorted = [...detail.exercises].sort((a, b) => a.stepOrder - b.stepOrder);
    const draftItems: DraftItem[] = [];
    for (const row of sorted) {
      const exercise = await this.exerciseLibrary.getById(row.exerciseId);
      if (!exercise) continue;
      draftItems.push({ exercise, targetSets: row.targetSets, targetValue: row.targetValue });
    }
    this.items.set(draftItems);
  }

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
    if (!this.canSave || this.saving()) return;

    if (this.isAdminMode) {
      this.saving.set(true);
      try {
        const input = { name: this.name().trim(), description: this.description().trim() };
        const id = this.editingId();
        const routineId = id ? (await this.routineService.adminUpdate(id, input)).id : (await this.routineService.adminCreate(input)).id;

        const exerciseInputs: RoutineExerciseInput[] = this.items().map((it, i) => ({
          exerciseId: it.exercise.id,
          stepOrder: i + 1,
          targetSets: it.targetSets,
          targetValue: it.targetValue,
        }));
        await this.routineService.adminReplaceExercises(routineId, this.currentExerciseRowIds(), exerciseInputs);

        this.router.navigateByUrl('/admin/routines');
      } finally {
        this.saving.set(false);
      }
      return;
    }

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

  async remove(): Promise<void> {
    const id = this.editingId();
    if (!id) return;
    if (!confirm(`¿Borrar la rutina "${this.name()}"? Esta acción no se puede deshacer.`)) return;
    await this.routineService.adminDelete(id);
    this.router.navigateByUrl('/admin/routines');
  }
}
