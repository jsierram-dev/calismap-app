import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ModalController } from '@ionic/angular/standalone';
import { Exercise, ExerciseCategory, Level, MuscleGroup, RatingThresholds, RepUnit } from '../../models/exercise.model';
import { AuthService } from '../../core/services/auth.service';
import { ExerciseLibraryService } from '../../services/exercise-library.service';
import { LoginComponent } from '../../shared/login/login.component';

const LEVELS: { value: Level; label: string }[] = [
  { value: 'BEGINNER', label: 'Beginner' },
  { value: 'INTERMEDIATE', label: 'Intermediate' },
  { value: 'ADVANCED', label: 'Advanced' },
  { value: 'EXPERT', label: 'Expert' },
];

const CATEGORIES: { value: ExerciseCategory; label: string }[] = [
  { value: 'PUSH', label: 'Push' },
  { value: 'PULL', label: 'Pull' },
  { value: 'LEGS', label: 'Legs' },
  { value: 'CORE', label: 'Core' },
  { value: 'STATIC', label: 'Static' },
  { value: 'MOBILITY', label: 'Mobility' },
];

// Mismos 19 valores que FilterComponent, acá en lista plana (sin agrupar
// por región) — es un formulario de creación, no un filtro, no hace falta
// la misma jerarquía visual (ver ROADMAP-calismap.md "Taxonomía de músculos").
const MUSCLES: { value: MuscleGroup; label: string }[] = [
  { value: 'CUADRICEPS', label: 'Cuádriceps' },
  { value: 'ISQUIOTIBIALES', label: 'Isquiotibiales' },
  { value: 'GLUTEOS', label: 'Glúteos' },
  { value: 'GEMELOS', label: 'Gemelos' },
  { value: 'ADUCTORES', label: 'Aductores' },
  { value: 'PECTORAL', label: 'Pectoral' },
  { value: 'DORSAL_ANCHO', label: 'Dorsales' },
  { value: 'TRAPECIO', label: 'Trapecio' },
  { value: 'ROMBOIDES', label: 'Romboides' },
  { value: 'LUMBARES', label: 'Lumbares' },
  { value: 'DELTOIDES_ANTERIOR', label: 'Deltoides anterior' },
  { value: 'DELTOIDES_POSTERIOR', label: 'Deltoides posterior' },
  { value: 'BICEPS', label: 'Bíceps' },
  { value: 'TRICEPS', label: 'Tríceps' },
  { value: 'ANTEBRAZOS', label: 'Antebrazos' },
  { value: 'RECTO_ABDOMINAL', label: 'Abdominales' },
  { value: 'OBLICUOS', label: 'Oblicuos' },
  { value: 'TRANSVERSO_ABDOMINAL', label: 'Transverso abdominal' },
  { value: 'SERRATO_ANTERIOR', label: 'Serrato anterior' },
];

const TIERS: (keyof RatingThresholds)[] = ['SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];

// Pantalla 09 — ExerciseManagementComponent (ver COMPONENTES-calismap.md):
// sin modelo nuevo — misma tabla Exercise del catálogo, con userId seteado
// al guardar (ver ExerciseLibraryService.createOwn). Foto/video quedan como
// placeholder honesto (Fase 3, contenido real, pendiente) — mismo criterio
// que el carrusel de ExerciseInfoComponent.
//
// Modo admin (agregado 16/08/2026, ver ROADMAP-calismap.md "Panel de
// administración"): mismo componente reusado — pedido explícito del
// usuario — para /admin/exercises/new y /admin/exercises/:id/edit (route
// data `{ admin: true }`, ver app.routes.ts). En modo admin: guarda contra
// el catálogo real (adminCreate/adminUpdate, requireAdmin en el backend)
// en vez de crear un ejercicio propio del usuario actual, suma
// regressionExerciseId/videoUrl (campos de curación editorial que no le
// corresponden a un ejercicio propio — ver ROADMAP-calismap.md, "Ejercicios
// personalizados") y habilita edición de uno ya existente además de crear.
@Component({
  selector: 'app-create-exercise',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './create-exercise.page.html',
  styleUrl: './create-exercise.page.css',
})
export class CreateExercisePage implements OnInit {
  levels = LEVELS;
  categories = CATEGORIES;
  muscles = MUSCLES;
  tiers = TIERS;

  isAdminMode = false;
  editingId = signal<string | null>(null);
  catalogExercises = signal<Exercise[]>([]); // para el select de regresión, solo en modo admin

  name = signal('');
  description = signal('');
  level = signal<Level>('BEGINNER');
  category = signal<ExerciseCategory>('PUSH');
  selectedMuscles = signal<Set<MuscleGroup>>(new Set());
  repUnit = signal<RepUnit>('reps');
  thresholds = signal<RatingThresholds>({ SILVER: 5, GOLD: 10, PLATINUM: 15, DIAMOND: 20 });
  steps = signal<string[]>(['']);
  videoUrl = signal('');
  regressionExerciseId = signal('');

  saving = signal(false);

  constructor(
    private library: ExerciseLibraryService,
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private modalCtrl: ModalController,
  ) {}

  async ngOnInit(): Promise<void> {
    this.isAdminMode = this.route.snapshot.data['admin'] === true;
    if (!this.isAdminMode) return;

    this.catalogExercises.set((await this.library.getAll()).filter((e) => !e.userId));

    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.editingId.set(id);
    const existing = await this.library.getById(id);
    if (!existing) return;
    this.name.set(existing.name);
    this.description.set(existing.description);
    this.level.set(existing.level);
    this.category.set(existing.category);
    this.selectedMuscles.set(new Set(existing.muscleGroups));
    this.repUnit.set(existing.repUnit);
    this.thresholds.set(existing.ratingThresholds);
    this.steps.set(existing.steps.length ? existing.steps : ['']);
    this.videoUrl.set(existing.videoUrl ?? '');
    this.regressionExerciseId.set(existing.regressionExerciseId ?? '');
  }

  isSelected(muscle: MuscleGroup): boolean {
    return this.selectedMuscles().has(muscle);
  }

  toggleMuscle(muscle: MuscleGroup): void {
    this.selectedMuscles.update((set) => {
      const next = new Set(set);
      next.has(muscle) ? next.delete(muscle) : next.add(muscle);
      return next;
    });
  }

  setThreshold(tier: keyof RatingThresholds, raw: string): void {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    this.thresholds.update((t) => ({ ...t, [tier]: value }));
  }

  updateStep(index: number, value: string): void {
    this.steps.update((list) => list.map((s, i) => (i === index ? value : s)));
  }

  addStep(): void {
    this.steps.update((list) => [...list, '']);
  }

  // Pasos opcionales (16/08/2026, hallazgo #8 de pruebas reales en móvil,
  // ver ROADMAP-calismap.md) — antes exigía al menos un paso no vacío; el
  // payload ya filtraba los vacíos con .filter(Boolean), así que no hacía
  // falta más que sacar esta condición.
  get canSave(): boolean {
    return this.name().trim().length > 0 && this.selectedMuscles().size > 0;
  }

  async save(): Promise<void> {
    if (!this.canSave || this.saving()) return;

    if (this.isAdminMode) {
      this.saving.set(true);
      try {
        const input = {
          name: this.name().trim(),
          description: this.description().trim(),
          level: this.level(),
          category: this.category(),
          muscleGroups: Array.from(this.selectedMuscles()),
          steps: this.steps().map((s) => s.trim()).filter(Boolean),
          repUnit: this.repUnit(),
          ratingThresholds: this.thresholds(),
          videoUrl: this.videoUrl().trim() || undefined,
          regressionExerciseId: this.regressionExerciseId() || undefined,
        };
        const id = this.editingId();
        if (id) await this.library.adminUpdate(id, input);
        else await this.library.adminCreate(input);
        this.router.navigateByUrl('/admin/exercises');
      } finally {
        this.saving.set(false);
      }
      return;
    }

    const userId = this.auth.user()?.id;
    if (!userId) return; // no debería pasar — ensureSession() ya garantiza algún usuario (invitado o real)

    await this.library.createOwn(
      {
        name: this.name().trim(),
        description: this.description().trim(),
        level: this.level(),
        category: this.category(),
        muscleGroups: Array.from(this.selectedMuscles()),
        steps: this.steps().map((s) => s.trim()).filter(Boolean),
        repUnit: this.repUnit(),
        ratingThresholds: this.thresholds(),
      },
      userId,
    );

    // Crear un ejercicio propio es uno de los 4 momentos con motivo real
    // para pedirle cuenta a un invitado (ver ROADMAP-calismap.md "Login:
    // OPCIONAL") — no bloqueante, el ejercicio ya se guardó antes de mostrarlo.
    if (this.auth.isGuest()) {
      const modal = await this.modalCtrl.create({ component: LoginComponent });
      await modal.present();
    }
    this.router.navigateByUrl('/library');
  }

  async remove(): Promise<void> {
    const id = this.editingId();
    if (!id) return;
    if (!confirm(`¿Borrar el ejercicio "${this.name()}"? Esta acción no se puede deshacer.`)) return;
    await this.library.adminDelete(id);
    this.router.navigateByUrl('/admin/exercises');
  }
}
