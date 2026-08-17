import { Component, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Exercise, MuscleGroup } from '../../models/exercise.model';
import { ExerciseLibraryService } from '../../services/exercise-library.service';
import { FilterComponent } from '../../shared/filter/filter.component';
import { SearchComponent } from '../../shared/search/search.component';
import { I18nService } from '../../core/services/i18n.service';
import { matchesNameQuery } from '../../core/utils/name-match';

// Reusa SearchComponent/FilterComponent tal cual (mismos componentes que
// LibraryComponent, pedido explícito del usuario el 16/08/2026) en vez de
// reusar LibraryComponent entero — evita tocar una pantalla real de
// usuario ya probada solo para agregarle un "modo admin" condicional.
@Component({
  selector: 'app-admin-exercises',
  standalone: true,
  imports: [RouterLink, SearchComponent, FilterComponent],
  templateUrl: './admin-exercises.page.html',
  styleUrl: './admin-exercises.page.css',
})
export class AdminExercisesPage implements OnInit {
  all = signal<Exercise[]>([]);
  query = signal('');
  selectedMuscles = signal<MuscleGroup[]>([]);
  filterOpen = signal(false);

  filtered = computed(() => {
    const q = this.query();
    const muscles = this.selectedMuscles();
    return this.all()
      .filter((e) => !e.userId) // catálogo únicamente — el panel de admin no gestiona ejercicios propios de usuarios
      .filter((e) => matchesNameQuery(q, e.name, e.nameSpanish, e.nameEnglish))
      .filter((e) => !muscles.length || e.muscleGroups.some((m) => muscles.includes(m)))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  constructor(
    private exerciseLibrary: ExerciseLibraryService,
    public i18n: I18nService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ionViewWillEnter(): void {
    this.load();
  }

  private async load(): Promise<void> {
    this.all.set(await this.exerciseLibrary.getAll());
  }

  onMusclesApplied(muscles: MuscleGroup[]): void {
    this.selectedMuscles.set(muscles);
    this.filterOpen.set(false);
  }
}
