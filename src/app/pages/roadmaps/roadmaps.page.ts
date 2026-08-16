import { Component, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MuscleGroup } from '../../models/exercise.model';
import { RoadmapService, RoadmapSummary } from '../../services/roadmap.service';
import { WorkoutSessionService } from '../../services/workout-session.service';
import { SearchComponent } from '../../shared/search/search.component';
import { FilterComponent } from '../../shared/filter/filter.component';
import { PathLoaderComponent } from '../../shared/path-loader/path-loader.component';

// Pantalla 01 — RoadmapListComponent (ver COMPONENTES-calismap.md): header +
// racha (sesiones de ESTA SEMANA CALENDARIO, lunes a hoy — "¿entrenaste
// esta semana?", no un conteo de WorkoutLog sueltos, ver ROADMAP-calismap.md
// "Corrige algo mal resuelto en la ronda anterior") + SearchComponent/
// FilterComponent (buscan por nombre de roadmap o por el músculo principal
// del ejercicio OBJETIVO, ya que Roadmap en sí no tiene muscleGroups propio)
// + listado de tarjetas.
@Component({
  selector: 'app-roadmaps',
  standalone: true,
  imports: [RouterLink, SearchComponent, FilterComponent, PathLoaderComponent],
  templateUrl: './roadmaps.page.html',
  styleUrl: './roadmaps.page.css',
})
export class RoadmapsPage implements OnInit {
  // true solo hasta el PRIMER load() — de ahí en más ionViewWillEnter()
  // refresca en segundo plano sin volver a tapar la lista ya visible (ver
  // load(), solo se pone en false, nunca de nuevo en true). Con la
  // precarga agregada en app.config.ts (ver ese archivo, "Precarga de
  // Roadmaps") esto casi nunca llega a mostrarse en un arranque tibio —
  // sigue haciendo falta para el primer arranque en frío real y para
  // cuando falle la precarga (sin red).
  loading = signal(true);
  roadmaps = signal<RoadmapSummary[]>([]);
  weeklySessionCount = signal(0);
  query = signal('');
  selectedMuscles = signal<MuscleGroup[]>([]);
  filterOpen = signal(false);

  filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const muscles = this.selectedMuscles();
    return this.roadmaps().filter((r) => {
      if (q && !r.roadmap.name.toLowerCase().includes(q)) return false;
      if (muscles.length && !r.targetExercise.muscleGroups.some((m) => muscles.includes(m))) return false;
      return true;
    });
  });

  constructor(
    private roadmapService: RoadmapService,
    private workoutSessionService: WorkoutSessionService,
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

  progressPercent(card: RoadmapSummary): number {
    return card.totalCount === 0 ? 0 : Math.round((card.completedCount / card.totalCount) * 100);
  }

  /** Puntos del mini-camino de la tarjeta — pasos + objetivo, mismo orden que RouteComponent pero sin texto (ver mockup screen-01, .path-preview). */
  dotsFor(card: RoadmapSummary): ('done' | 'current' | 'locked')[] {
    const total = card.totalCount + 1; // pasos + nodo objetivo
    const dots: ('done' | 'current' | 'locked')[] = [];
    for (let i = 0; i < total; i++) {
      dots.push(i < card.completedCount ? 'done' : i === card.completedCount ? 'current' : 'locked');
    }
    return dots;
  }

  private async load(): Promise<void> {
    const [roadmaps, sessions] = await Promise.all([
      this.roadmapService.getAllRoadmaps(),
      this.workoutSessionService.getAll(),
    ]);
    this.roadmaps.set(roadmaps);
    this.loading.set(false);

    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    const day = weekStart.getDay(); // 0=domingo
    const diffToMonday = day === 0 ? 6 : day - 1;
    weekStart.setDate(weekStart.getDate() - diffToMonday);

    this.weeklySessionCount.set(sessions.filter((s) => !s.deletedAt && new Date(s.startedAt) >= weekStart).length);
  }
}
