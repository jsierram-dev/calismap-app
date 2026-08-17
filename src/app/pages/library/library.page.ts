import { UpperCasePipe } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Exercise, ExerciseCategory, MuscleGroup, Rating } from '../../models/exercise.model';
import { effectiveValue } from '../../models/workout-log.model';
import { ExerciseLibraryService } from '../../services/exercise-library.service';
import { RatingCalculatorService } from '../../services/rating-calculator.service';
import { WorkoutLogService } from '../../services/workout-log.service';
import { SearchComponent } from '../../shared/search/search.component';
import { FilterComponent } from '../../shared/filter/filter.component';
import { PathLoaderComponent } from '../../shared/path-loader/path-loader.component';

type CategoryFilter = ExerciseCategory | 'ALL' | 'MINE';

interface LibraryCard {
  exercise: Exercise;
  rating: Rating | null;
}

const CATEGORIES: { value: CategoryFilter; label: string }[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'PUSH', label: 'Push' },
  { value: 'PULL', label: 'Pull' },
  { value: 'LEGS', label: 'Legs' },
  { value: 'CORE', label: 'Core' },
  { value: 'STATIC', label: 'Static' },
  { value: 'MOBILITY', label: 'Mobility' },
  { value: 'MINE', label: 'Tus ejercicios' },
];

// Pantalla 04 — LibraryComponent (ver COMPONENTES-calismap.md): buscador +
// filtro por músculo + chips de categoría (incluye "Tus ejercicios",
// Exercise.userId propio) + listado + entrada principal de "Crear
// ejercicio" (vive acá, no en el picker de una rutina — ver
// ROADMAP-calismap.md "Ejercicios personalizados").
//
// [pickerMode]="true": mismo componente, presentado en MODAL desde
// RoutineManagementComponent ("Agregar ejercicio", paso 08) y desde
// SessionWorkoutComponent ("Registrar otro ejercicio", paso 07) — tocar una
// tarjeta emite picked en vez de navegar, sin botón de "Crear ejercicio"
// (ver ROADMAP-calismap.md "LibraryComponent se abre en modo modal").
@Component({
  selector: 'app-library',
  standalone: true,
  imports: [UpperCasePipe, RouterLink, SearchComponent, FilterComponent, PathLoaderComponent],
  templateUrl: './library.page.html',
  styleUrl: './library.page.css',
})
export class LibraryPage implements OnInit {
  @Input() pickerMode = false;
  @Output() picked = new EventEmitter<Exercise>();

  categories = CATEGORIES;
  // true solo hasta el PRIMER load() — mismo criterio que RoadmapsPage.loading
  // (ver ese archivo): esta pantalla no tenía NINGÚN indicador de carga
  // (hallazgo real, 17/08/2026, ver ROADMAP-calismap.md "Segunda ronda de
  // pulido real") — con el precalentamiento de app.config.ts esto casi
  // nunca llega a mostrarse, pero cuando esa precarga falla o todavía no
  // terminó, antes el usuario veía la lista vacía en silencio en vez de un
  // estado de carga real.
  loading = signal(true);
  cards = signal<LibraryCard[]>([]);
  query = signal('');
  selectedMuscles = signal<MuscleGroup[]>([]);
  activeCategory = signal<CategoryFilter>('ALL');
  filterOpen = signal(false);

  filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const muscles = this.selectedMuscles();
    const category = this.activeCategory();
    return this.cards().filter(({ exercise }) => {
      if (q && !exercise.name.toLowerCase().includes(q)) return false;
      if (muscles.length && !exercise.muscleGroups.some((m) => muscles.includes(m))) return false;
      if (category === 'MINE') return !!exercise.userId;
      if (category !== 'ALL') return exercise.category === category;
      return true;
    });
  });

  constructor(
    private library: ExerciseLibraryService,
    private workoutLog: WorkoutLogService,
    private ratingCalc: RatingCalculatorService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ionViewWillEnter(): void {
    this.load();
  }

  onQueryChange(value: string): void {
    this.query.set(value);
  }

  onMusclesApplied(muscles: MuscleGroup[]): void {
    this.selectedMuscles.set(muscles);
  }

  onCardClick(event: Event, exercise: Exercise): void {
    if (!this.pickerMode) return;
    event.preventDefault();
    this.picked.emit(exercise);
  }

  private async load(): Promise<void> {
    const exercises = await this.library.getAll();
    const cards = await Promise.all(
      exercises.map(async (exercise): Promise<LibraryCard> => {
        const bestLog = await this.workoutLog.getBestLog(exercise.id);
        const rating = bestLog ? this.ratingCalc.ratingForEffectiveValue(effectiveValue(bestLog), exercise.ratingThresholds) : null;
        return { exercise, rating };
      }),
    );
    // Ejercicios propios (Exercise.userId) primero — pedido explícito del
    // usuario, 17/08/2026. .sort() es estable en JS moderno, así que dentro
    // de cada grupo (propios / catálogo) se mantiene el orden original.
    cards.sort((a, b) => Number(!!b.exercise.userId) - Number(!!a.exercise.userId));
    this.cards.set(cards);
    this.loading.set(false);
  }
}
