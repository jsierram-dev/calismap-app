import { Component, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MuscleGroup } from '../../models/exercise.model';
import { RoadmapService, RoadmapSummary } from '../../services/roadmap.service';
import { WorkoutSessionService } from '../../services/workout-session.service';
import { SearchComponent } from '../../shared/search/search.component';
import { FilterComponent } from '../../shared/filter/filter.component';
import { PathLoaderComponent } from '../../shared/path-loader/path-loader.component';
import { StreakComponent } from '../../shared/streak/streak.component';
import { I18nService } from '../../core/services/i18n.service';
import { matchesNameQuery } from '../../core/utils/name-match';

// Tarjetas visibles por "página" de scroll (18/08/2026, ver
// ROADMAP-calismap.md "Paginación del catálogo") — pedido real del usuario:
// mostrar como máximo esta cantidad de tarjetas de entrada, revelando el
// resto a medida que se hace scroll, en vez de dibujar el catálogo entero
// de una. Mismo valor que PAGE_SIZE en RoadmapService (el catálogo YA está
// completo en memoria para cuando esto importa — ver ese archivo — así que
// acá es puramente cuánto se DIBUJA, no un pedido de red nuevo).
const VISIBLE_PAGE_SIZE = 10;

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
  imports: [RouterLink, SearchComponent, FilterComponent, PathLoaderComponent, StreakComponent],
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
  // Cuántas tarjetas de `filtered()` se dibujan — arranca en una "página",
  // onScroll() la va subiendo (ver más abajo). Se resetea cada vez que
  // cambia la búsqueda/el filtro para no arrancar mostrando de más (o de
  // menos) sobre un conjunto filtrado distinto.
  visibleCount = signal(VISIBLE_PAGE_SIZE);

  filtered = computed(() => {
    const q = this.query();
    const muscles = this.selectedMuscles();
    return this.roadmaps().filter((r) => {
      if (!matchesNameQuery(q, r.roadmap.name, r.roadmap.nameSpanish, r.roadmap.nameEnglish)) return false;
      if (muscles.length && !r.targetExercise.muscleGroups.some((m) => muscles.includes(m))) return false;
      return true;
    });
  });

  // Lo que realmente pinta el template — un recorte de filtered() (ver
  // VISIBLE_PAGE_SIZE arriba). El catálogo completo ya está en memoria
  // (RoadmapService.getAllRoadmaps() trae todo, paginando de a poco contra
  // la red — ver ese archivo), así que "cargar más" acá es instantáneo, sin
  // pedir nada nuevo.
  visible = computed(() => this.filtered().slice(0, this.visibleCount()));

  constructor(
    private roadmapService: RoadmapService,
    private workoutSessionService: WorkoutSessionService,
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

  // Bindeado a (scroll) de .page-content (el contenedor real con overflow-y,
  // ver styles.css) — cerca del final, revela otra "página" de tarjetas ya
  // cargadas. clampeado a filtered().length, no hace falta más lógica de
  // corte acá.
  onScroll(event: Event): void {
    const el = event.target as HTMLElement;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 150;
    if (nearBottom && this.visibleCount() < this.filtered().length) {
      this.visibleCount.update((n) => Math.min(n + VISIBLE_PAGE_SIZE, this.filtered().length));
    }
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
    const [roadmaps, weeklyCount] = await Promise.all([
      this.roadmapService.getAllRoadmaps(),
      this.workoutSessionService.getWeeklySessionCount(),
    ]);
    this.roadmaps.set(roadmaps);
    this.loading.set(false);
    this.weeklySessionCount.set(weeklyCount);
  }
}
