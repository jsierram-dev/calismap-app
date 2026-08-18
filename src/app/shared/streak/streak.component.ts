import { Component, input } from '@angular/core';
import { I18nService } from '../../core/services/i18n.service';

/**
 * Franja de racha semanal — "N sesiones esta semana", con el ícono de
 * llama. Extraído el 18/08/2026 (ver ROADMAP-calismap.md "Pantalla de
 * logros") de RoadmapsPage, que la tenía inline: SessionSummaryComponent la
 * necesita también, así que pasa a ser compartido en vez de duplicar el
 * markup+CSS en dos archivos. Presentacional puro — quien lo usa ya calculó
 * `count` (ver WorkoutSessionService.getWeeklySessionCount()), este
 * componente no sabe de dónde sale el número.
 */
@Component({
  selector: 'app-streak',
  standalone: true,
  templateUrl: './streak.component.html',
  styleUrl: './streak.component.css',
})
export class StreakComponent {
  count = input.required<number>();

  constructor(public i18n: I18nService) {}
}
