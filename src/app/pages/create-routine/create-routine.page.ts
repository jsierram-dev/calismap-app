import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ModalController } from '@ionic/angular/standalone';
import { Exercise } from '../../models/exercise.model';
import { RoutineExerciseInput } from '../../models/routine.model';
import { UserRoutineExerciseEntry } from '../../models/user-routine.model';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { ExerciseLibraryService } from '../../services/exercise-library.service';
import { RoutineService } from '../../services/routine.service';
import { UserRoutineService } from '../../services/user-routine.service';
import { ItemDropdownComponent } from '../../shared/item-dropdown/item-dropdown.component';
import { LoginComponent } from '../../shared/login/login.component';
import { LibraryPage } from '../library/library.page';

interface DraftItem {
  exercise: Exercise;
  targetSets: number;
  // Un valor por serie, no uno solo repetido (hallazgo #9 de pruebas reales
  // en móvil, 16/08/2026, ver ROADMAP-calismap.md) — longitud siempre ===
  // targetSets, mantenida así por updateTargetSets() de acá abajo.
  targetValues: (number | null)[];
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
    public i18n: I18nService,
  ) {}

  // Ampliado (19/08/2026, pedido explícito del usuario) — antes esto
  // cortaba de entrada para cualquier rutina NO admin, igual que el mismo
  // hallazgo en CreateExercisePage.ngOnInit(): editar una rutina PROPIA no
  // existía a nivel de ruta, `UserRoutineService.update()` ya estaba
  // escrito pero nada de la UI lo llamaba.
  async ngOnInit(): Promise<void> {
    this.isAdminMode = this.route.snapshot.data['admin'] === true;
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    if (this.isAdminMode) {
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
        draftItems.push({ exercise, targetSets: row.targetSets, targetValues: row.targetValues });
      }
      this.items.set(draftItems);
      return;
    }

    const own = await this.userRoutineService.getById(id);
    if (!own) return; // guardrail — un id de ruta se puede escribir a mano; sin la rutina propia, queda como formulario de creación vacío
    this.editingId.set(id);
    this.name.set(own.name);

    const sorted = [...own.exercises].sort((a, b) => a.order - b.order);
    const draftItems: DraftItem[] = [];
    for (const entry of sorted) {
      const exercise = await this.exerciseLibrary.getById(entry.exerciseId);
      if (!exercise) continue;
      draftItems.push({ exercise, targetSets: entry.targetSets, targetValues: entry.targetValues });
    }
    this.items.set(draftItems);
  }

  onExercisePicked(exercise: Exercise): void {
    this.pickerOpen.set(false);
    if (this.items().some((it) => it.exercise.id === exercise.id)) return;
    const defaultValue = exercise.repUnit === 'reps' ? 10 : 30;
    this.items.update((list) => [...list, { exercise, targetSets: 3, targetValues: [defaultValue, defaultValue, defaultValue] }]);
  }

  /** Crece/achica targetValues junto con la cantidad de series, para que siempre midan lo mismo (hallazgo #9, ver ROADMAP-calismap.md). */
  updateTargetSets(index: number, value: number): void {
    this.items.update((list) =>
      list.map((it, i) => {
        if (i !== index) return it;
        const values = it.targetValues.slice(0, value);
        while (values.length < value) {
          values.push(values.at(-1) ?? (it.exercise.repUnit === 'reps' ? 10 : 30)); // fila nueva: repite la última, no arranca en blanco
        }
        return { ...it, targetSets: value, targetValues: values };
      }),
    );
  }

  updateTargetValues(index: number, values: (number | null)[]): void {
    this.items.update((list) => list.map((it, i) => (i === index ? { ...it, targetValues: values } : it)));
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
          targetValues: it.targetValues,
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
      targetValues: it.targetValues,
    }));

    // Editar una rutina propia ya existente (19/08/2026) — antes esta rama
    // SIEMPRE creaba una nueva, sin importar si `editingId()` venía seteado
    // (no podía pasar hasta ahora, ver ngOnInit). Sin aviso de login acá —
    // editar no es uno de los 4 momentos reales (ver ROADMAP-calismap.md
    // "Login: OPCIONAL"), solo crear.
    const editId = this.editingId();
    if (editId) {
      await this.userRoutineService.update(editId, { name: this.name().trim(), exercises });
      this.router.navigateByUrl('/choose-session');
      return;
    }

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

  // Ampliado (19/08/2026) — antes esto SOLO existía para modo admin;
  // `UserRoutineService.remove` ya existía del lado del servicio pero nada
  // de la UI lo llamaba todavía. Mismo branch que ya usa save().
  async remove(): Promise<void> {
    const id = this.editingId();
    if (!id) return;
    if (!confirm(this.i18n.t('createRoutine.confirmDelete', { name: this.name() }))) return;

    if (!this.isAdminMode) {
      await this.userRoutineService.remove(id);
      this.router.navigateByUrl('/choose-session');
      return;
    }

    await this.routineService.adminDelete(id);
    this.router.navigateByUrl('/admin/routines');
  }
}
