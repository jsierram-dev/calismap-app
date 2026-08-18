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
import { I18nService } from '../../core/services/i18n.service';
import { matchesNameQuery } from '../../core/utils/name-match';

// Tarjetas visibles por "página" de scroll (18/08/2026, ver
// ROADMAP-calismap.md "Paginación del catálogo") — mismo criterio que
// RoadmapsPage (ver ese archivo para el porqué completo): el catálogo
// completo ya está en memoria, esto solo acota cuánto se DIBUJA de entrada.
const VISIBLE_PAGE_SIZE = 10;

type CategoryFilter = ExerciseCategory | 'ALL' | 'MINE';

interface LibraryCard {
  exercise: Exercise;
  rating: Rating | null;
}

// Sin "label" fijo acá (17/08/2026, ver ROADMAP-calismap.md "Traducciones")
// — el label se resuelve recién en el template vía i18n.t(), 'ALL'/'MINE'
// con sus propias claves de página (no son categorías reales de Exercise),
// el resto reusa enums.category.* (compartido con create-exercise/filter).
const CATEGORIES: CategoryFilter[] = ['ALL', 'PUSH', 'PULL', 'LEGS', 'CORE', 'STATIC', 'MOBILITY', 'MINE'];

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
  // Cuántas tarjetas de `filtered()` se dibujan — ver VISIBLE_PAGE_SIZE y el
  // comentario de RoadmapsPage.visibleCount (mismo patrón acá).
  visibleCount = signal(VISIBLE_PAGE_SIZE);

  filtered = computed(() => {
    const q = this.query();
    const muscles = this.selectedMuscles();
    const category = this.activeCategory();
    return this.cards().filter(({ exercise }) => {
      if (!matchesNameQuery(q, exercise.name, exercise.nameSpanish, exercise.nameEnglish)) return false;
      if (muscles.length && !exercise.muscleGroups.some((m) => muscles.includes(m))) return false;
      if (category === 'MINE') return !!exercise.userId;
      if (category !== 'ALL') return exercise.category === category;
      return true;
    });
  });

  // Lo que realmente pinta el template — ver RoadmapsPage.visible() para el
  // razonamiento completo (mismo patrón acá).
  visible = computed(() => this.filtered().slice(0, this.visibleCount()));

  constructor(
    private library: ExerciseLibraryService,
    private workoutLog: WorkoutLogService,
    private ratingCalc: RatingCalculatorService,
    public i18n: I18nService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ionViewWillEnter(): void {
    this.load();
  }

  onQueryChange(value: string): void {
    this.query.set(value);
    this.visibleCount.set(VISIBLE_PAGE_SIZE);
  }

  onMusclesApplied(muscles: MuscleGroup[]): void {
    this.selectedMuscles.set(muscles);
    this.visibleCount.set(VISIBLE_PAGE_SIZE);
  }

  setCategory(category: CategoryFilter): void {
    this.activeCategory.set(category);
    this.visibleCount.set(VISIBLE_PAGE_SIZE);
  }

  // Bindeado a (scroll) de .page-content — ver el mismo método en
  // RoadmapsPage para el razonamiento completo.
  onScroll(event: Event): void {
    const el = event.target as HTMLElement;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 150;
    if (nearBottom && this.visibleCount() < this.filtered().length) {
      this.visibleCount.update((n) => Math.min(n + VISIBLE_PAGE_SIZE, this.filtered().length));
    }
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
