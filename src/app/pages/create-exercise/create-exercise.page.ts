import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ModalController } from '@ionic/angular/standalone';
import { ExerciseCategory, Level, MuscleGroup, RatingThresholds, RepUnit } from '../../models/exercise.model';
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
@Component({
  selector: 'app-create-exercise',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './create-exercise.page.html',
  styleUrl: './create-exercise.page.css',
})
export class CreateExercisePage {
  levels = LEVELS;
  categories = CATEGORIES;
  muscles = MUSCLES;
  tiers = TIERS;

  name = signal('');
  description = signal('');
  level = signal<Level>('BEGINNER');
  category = signal<ExerciseCategory>('PUSH');
  selectedMuscles = signal<Set<MuscleGroup>>(new Set());
  repUnit = signal<RepUnit>('reps');
  thresholds = signal<RatingThresholds>({ SILVER: 5, GOLD: 10, PLATINUM: 15, DIAMOND: 20 });
  steps = signal<string[]>(['']);

  constructor(
    private library: ExerciseLibraryService,
    private auth: AuthService,
    private router: Router,
    private modalCtrl: ModalController,
  ) {}

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

  get canSave(): boolean {
    return this.name().trim().length > 0 && this.selectedMuscles().size > 0 && this.steps().some((s) => s.trim());
  }

  async save(): Promise<void> {
    if (!this.canSave) return;
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
}
