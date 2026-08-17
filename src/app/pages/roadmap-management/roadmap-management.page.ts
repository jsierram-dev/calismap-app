import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Exercise, ExerciseCategory, Rating } from '../../models/exercise.model';
import { RoadmapExerciseInput } from '../../models/roadmap.model';
import { ExerciseLibraryService } from '../../services/exercise-library.service';
import { RoadmapService } from '../../services/roadmap.service';
import { I18nService } from '../../core/services/i18n.service';

const CATEGORIES: ExerciseCategory[] = ['PUSH', 'PULL', 'LEGS', 'CORE', 'STATIC', 'MOBILITY'];
const RATINGS: Rating[] = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];

interface DraftStep {
  exerciseId: string;
  minRatingRequired: Rating | null;
}

// RoadmapManagementComponent — componente nuevo (no existía en
// COMPONENTES-calismap.md, que solo documentaba las 10 pantallas de
// usuario) pedido explícitamente por el usuario el 16/08/2026, en paralelo
// a ExerciseManagementComponent/RoutineManagementComponent. Sin
// equivalente que reusar tal cual (RoadmapComponent, pantalla 02, es de
// solo lectura para el usuario) — constructor de pasos propio, más simple
// que ItemDropdownComponent porque acá cada fila es solo
// exercise+minRatingRequired, sin logging/prescripción.
@Component({
  selector: 'app-roadmap-management',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './roadmap-management.page.html',
  styleUrl: './roadmap-management.page.css',
})
export class RoadmapManagementPage implements OnInit {
  categories = CATEGORIES;
  ratings = RATINGS;

  editingId = signal<string | null>(null);
  exercises = signal<Exercise[]>([]);
  currentStepIds = signal<string[]>([]); // ids reales de RoadmapExercise (para poder borrarlos al re-guardar)

  name = signal('');
  description = signal('');
  category = signal<ExerciseCategory>('PULL');
  targetExerciseId = signal('');
  targetRatingRequired = signal<Rating>('GOLD');
  steps = signal<DraftStep[]>([]);

  saving = signal(false);

  constructor(
    private roadmapService: RoadmapService,
    private exerciseLibrary: ExerciseLibraryService,
    private route: ActivatedRoute,
    private router: Router,
    public i18n: I18nService,
  ) {}

  async ngOnInit(): Promise<void> {
    const all = await this.exerciseLibrary.getAll();
    this.exercises.set(all.filter((e) => !e.userId)); // roadmaps solo referencian catálogo, nunca ejercicios propios de un usuario

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.editingId.set(id);
      const detail = await this.roadmapService.adminGetRaw(id);
      if (detail) {
        this.name.set(detail.name);
        this.description.set(detail.description);
        this.category.set(detail.category);
        this.targetExerciseId.set(detail.targetExerciseId);
        this.targetRatingRequired.set(detail.targetRatingRequired);
        this.currentStepIds.set(detail.steps.map((s) => s.id));
        this.steps.set(
          [...detail.steps]
            .sort((a, b) => a.stepOrder - b.stepOrder)
            .map((s) => ({ exerciseId: s.exerciseId, minRatingRequired: s.minRatingRequired })),
        );
      }
    } else if (this.exercises().length > 0) {
      this.targetExerciseId.set(this.exercises()[0].id);
    }
  }

  exerciseName(id: string): string {
    return this.exercises().find((e) => e.id === id)?.name ?? this.i18n.t('roadmapManagement.exerciseNotFound');
  }

  addStep(): void {
    const first = this.exercises()[0];
    if (!first) return;
    this.steps.update((list) => [...list, { exerciseId: first.id, minRatingRequired: list.length === 0 ? null : 'GOLD' }]);
  }

  removeStep(index: number): void {
    this.steps.update((list) => list.filter((_, i) => i !== index));
  }

  moveStep(index: number, dir: -1 | 1): void {
    this.steps.update((list) => {
      const target = index + dir;
      if (target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  updateStepExercise(index: number, exerciseId: string): void {
    this.steps.update((list) => list.map((s, i) => (i === index ? { ...s, exerciseId } : s)));
  }

  updateStepRating(index: number, value: string): void {
    const rating = value === '' ? null : (value as Rating);
    this.steps.update((list) => list.map((s, i) => (i === index ? { ...s, minRatingRequired: rating } : s)));
  }

  get canSave(): boolean {
    return this.name().trim().length > 0 && this.targetExerciseId().length > 0;
  }

  async save(): Promise<void> {
    if (!this.canSave || this.saving()) return;
    this.saving.set(true);
    try {
      const input = {
        name: this.name().trim(),
        description: this.description().trim(),
        category: this.category(),
        targetExerciseId: this.targetExerciseId(),
        targetRatingRequired: this.targetRatingRequired(),
      };

      const id = this.editingId();
      const roadmapId = id ? (await this.roadmapService.adminUpdate(id, input)).id : (await this.roadmapService.adminCreate(input)).id;

      const stepInputs: RoadmapExerciseInput[] = this.steps().map((s, i) => ({
        exerciseId: s.exerciseId,
        stepOrder: i + 1,
        minRatingRequired: i === 0 ? null : s.minRatingRequired,
      }));
      await this.roadmapService.adminReplaceSteps(roadmapId, this.currentStepIds(), stepInputs);

      this.router.navigateByUrl('/admin/roadmaps');
    } finally {
      this.saving.set(false);
    }
  }

  async remove(): Promise<void> {
    const id = this.editingId();
    if (!id) return;
    if (!confirm(this.i18n.t('roadmapManagement.confirmDelete', { name: this.name() }))) return;
    await this.roadmapService.adminDelete(id);
    this.router.navigateByUrl('/admin/roadmaps');
  }
}
