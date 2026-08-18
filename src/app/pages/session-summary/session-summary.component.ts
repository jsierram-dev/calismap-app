import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { I18nService } from '../../core/services/i18n.service';
import { SessionAchievementsService, SessionSummary } from '../../services/session-achievements.service';
import { PathLoaderComponent } from '../../shared/path-loader/path-loader.component';
import { StreakComponent } from '../../shared/streak/streak.component';

// Pantalla nueva — SessionSummaryComponent (ver ROADMAP-calismap.md
// "Pantalla de logros", 18/08/2026): se muestra SIEMPRE al terminar una
// sesión (SessionWorkoutPage.endSession() navega acá), con un resumen
// básico + hasta 4 tipos de logro cuando corresponde (récord personal,
// subida de tier, avance de roadmap, racha semanal — StreakComponent,
// compartido con RoadmapsPage). Toda la lógica de qué contar como "logro
// de hoy" vive en SessionAchievementsService, no acá — este componente solo
// pinta el SessionSummary que ese servicio ya armó.
//
// Ruta con :sessionId (no la sesión "activa" — para cuando esta pantalla
// se muestra, la sesión YA está cerrada, ver WorkoutSessionService.
// endSession()) — se lee vía ActivatedRoute.paramMap como observable, no un
// snapshot único, por si Angular llegara a reusar esta instancia entre dos
// sessionId distintos (mismo path de ruta) en vez de recrearla.
@Component({
  selector: 'app-session-summary',
  standalone: true,
  imports: [RouterLink, StreakComponent, PathLoaderComponent],
  templateUrl: './session-summary.component.html',
  styleUrl: './session-summary.component.css',
})
export class SessionSummaryComponent implements OnInit {
  loading = signal(true);
  summary = signal<SessionSummary | null>(null);

  constructor(
    private route: ActivatedRoute,
    private achievements: SessionAchievementsService,
    public i18n: I18nService,
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => this.load(params.get('sessionId')));
  }

  private async load(sessionId: string | null): Promise<void> {
    this.loading.set(true);
    // null = sessionId roto/ausente (ej. URL escrita a mano) — summarize()
    // ya devuelve null también si el id no existe más, mismo camino de
    // "no encontrado" para los dos casos, ver el template.
    this.summary.set(sessionId ? await this.achievements.summarize(sessionId) : null);
    this.loading.set(false);
  }
}
