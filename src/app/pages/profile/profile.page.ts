import { Component, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AccountAvatarComponent } from '@jsierram-dev/jp-user-kit';
import { Rating } from '../../models/exercise.model';
import { effectiveValue } from '../../models/workout-log.model';
import { MUSCLE_REGIONS } from '../../core/utils/muscle-regions';
import { AuthService } from '../../core/services/auth.service';
import { GoogleIdentityService, GooglePromptCancelledError } from '../../core/services/google-identity.service';
import { I18nService } from '../../core/services/i18n.service';
import { ExerciseLibraryService } from '../../services/exercise-library.service';
import { RatingCalculatorService } from '../../services/rating-calculator.service';
import { RegionRecovery, SessionChecklistItem, SessionHistoryEntry, TrainingHistoryService } from '../../services/training-history.service';
import { WorkoutLogService } from '../../services/workout-log.service';
import { ItemDropdownComponent } from '../../shared/item-dropdown/item-dropdown.component';
import { PathLoaderComponent } from '../../shared/path-loader/path-loader.component';

interface CalendarDay {
  date: Date;
  key: string; // YYYY-MM-DD, hora LOCAL — "qué día entrenó" tiene que reflejar el calendario del usuario, no UTC
  inMonth: boolean;
  isToday: boolean;
  entries: SessionHistoryEntry[];
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// Pantalla nueva — ProfilePage (18/08/2026, ver ROADMAP-calismap.md
// "Pantalla de Perfil"): reemplaza a "Ajustes" en la navbar (pedido
// explícito del usuario) — la foto/nombre/racha de progreso que antes
// vivían en Ajustes se mudan acá, y Ajustes pasa a ser una pantalla
// secundaria a la que se llega con un botón desde acá, no un tab propio.
//
// Contenido nuevo: temporizador de descanso por región muscular
// (TrainingHistoryService, RECOVERY_HOURS=48 — ver ese archivo para las
// fuentes) + calendario mensual con qué sesión/rutina se hizo cada día y
// qué regiones se entrenaron.
@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [RouterLink, AccountAvatarComponent, PathLoaderComponent, ItemDropdownComponent],
  templateUrl: './profile.page.html',
  styleUrl: './profile.page.css',
})
export class ProfilePage implements OnInit {
  loading = signal(true);
  loggingIn = signal(false);
  loginError = signal<string | null>(null);

  tierCounts = signal<Record<Rating, number>>({ BRONZE: 0, SILVER: 0, GOLD: 0, PLATINUM: 0, DIAMOND: 0 });
  recovery = signal<RegionRecovery[]>([]);
  private history = signal<SessionHistoryEntry[]>([]);

  viewMonth = signal(startOfMonth(new Date()));
  selectedDayKey = signal<string | null>(null);
  // A lo sumo UNA sesión abierta a la vez (18/08/2026, pedido explícito del
  // usuario) — lista de sesiones del día, cada una su propio dropdown,
  // nunca dos abiertas juntas. null = ninguna abierta.
  expandedSessionId = signal<string | null>(null);
  regions = MUSCLE_REGIONS;

  // Checklist de cada sesión YA resuelto (exercise + sets, para
  // <app-item-dropdown>) — se pide bajo demanda por sessionId, recién
  // cuando el usuario toca un día con marcas (ver selectDay()), no para
  // todo el historial de una. Cacheado acá para no volver a pedirlo si
  // el usuario cierra y vuelve a abrir el mismo día.
  private sessionChecklists = signal<Map<string, SessionChecklistItem[]>>(new Map());

  private historyByDate = computed(() => {
    const map = new Map<string, SessionHistoryEntry[]>();
    for (const entry of this.history()) {
      const key = dateKey(new Date(entry.session.startedAt));
      const existing = map.get(key);
      if (existing) existing.push(entry);
      else map.set(key, [entry]);
    }
    return map;
  });

  calendarDays = computed<CalendarDay[]>(() => {
    const month = this.viewMonth();
    const byDate = this.historyByDate();
    const todayKey = dateKey(new Date());

    const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
    const startWeekday = firstOfMonth.getDay(); // 0=domingo
    const diffToMonday = startWeekday === 0 ? 6 : startWeekday - 1;
    const gridStart = new Date(month.getFullYear(), month.getMonth(), 1 - diffToMonday);

    const days: CalendarDay[] = [];
    for (let i = 0; i < 42; i++) {
      // 6 semanas fijas — simple y siempre alcanza para cualquier mes, sin lógica de "cuántas semanas tiene este mes en particular"
      const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      const key = dateKey(d);
      days.push({ date: d, key, inMonth: d.getMonth() === month.getMonth(), isToday: key === todayKey, entries: byDate.get(key) ?? [] });
    }
    return days;
  });

  selectedDayEntries = computed(() => {
    const key = this.selectedDayKey();
    return key ? (this.historyByDate().get(key) ?? []) : [];
  });

  // Intl, no una tabla de traducción propia (17 claves más entre meses y
  // días de semana) — a diferencia del resto del texto de la app, esto es
  // puro FORMATO de fecha, no prosa de cara al usuario; mismo criterio que
  // ya usa DatePipe en AdminUsersPage. Se recalcula solo cuando cambia el
  // mes visible o el idioma (computed sobre las dos signals).
  monthLabel = computed(() => {
    const locale = this.i18n.lang() === 'es' ? 'es-ES' : 'en-US';
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(this.viewMonth());
  });

  weekdayLabels = computed(() => {
    const locale = this.i18n.lang() === 'es' ? 'es-ES' : 'en-US';
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    // Lunes a domingo, mismo arranque de semana que el resto de la app (ver WorkoutSessionService.getWeeklySessionCount)
    return [1, 2, 3, 4, 5, 6, 7].map((day) => fmt.format(new Date(2024, 0, day)));
  });

  constructor(
    public auth: AuthService,
    private googleIdentity: GoogleIdentityService,
    public i18n: I18nService,
    private exerciseLibrary: ExerciseLibraryService,
    private workoutLog: WorkoutLogService,
    private ratingCalc: RatingCalculatorService,
    private trainingHistory: TrainingHistoryService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ionViewWillEnter(): void {
    this.load();
  }

  // Mismo criterio que SettingsPage.openLogin() (17/08/2026, ver
  // GoogleIdentityService) — se mudó acá junto con la tarjeta de perfil.
  async openLogin(): Promise<void> {
    this.loginError.set(null);
    this.loggingIn.set(true);
    try {
      const idToken = await this.googleIdentity.promptSignIn();
      await this.auth.loginWithGoogle(idToken);
    } catch (err) {
      if (!(err instanceof GooglePromptCancelledError)) {
        this.loginError.set(this.i18n.t('settings.loginError'));
      }
    } finally {
      this.loggingIn.set(false);
    }
  }

  prevMonth(): void {
    const m = this.viewMonth();
    this.viewMonth.set(new Date(m.getFullYear(), m.getMonth() - 1, 1));
    this.selectedDayKey.set(null);
  }

  nextMonth(): void {
    const m = this.viewMonth();
    this.viewMonth.set(new Date(m.getFullYear(), m.getMonth() + 1, 1));
    this.selectedDayKey.set(null);
  }

  selectDay(day: CalendarDay): void {
    if (!day.entries.length) return;
    this.selectedDayKey.set(this.selectedDayKey() === day.key ? null : day.key);
    this.expandedSessionId.set(null); // cambiar de día cierra cualquier sesión que hubiera abierta
  }

  // Acordeón — a lo sumo una sesión abierta (ver expandedSessionId arriba).
  // El checklist de la sesión que se abre se pide recién ACÁ, bajo demanda
  // (no para todas las del día de una), ver TrainingHistoryService.getSessionChecklist().
  async toggleSession(sessionId: string): Promise<void> {
    const next = this.expandedSessionId() === sessionId ? null : sessionId;
    this.expandedSessionId.set(next);
    if (next && !this.sessionChecklists().has(next)) {
      const checklist = await this.trainingHistory.getSessionChecklist(next);
      this.sessionChecklists.update((map) => new Map(map).set(next, checklist));
    }
  }

  checklistFor(sessionId: string): SessionChecklistItem[] {
    return this.sessionChecklists().get(sessionId) ?? [];
  }

  /** Texto real de cuánto falta ("2h 15m") — sin librería de formato de duración, alcanza con esto para el único lugar que lo necesita. */
  timeRemainingLabel(readyAt: string): string {
    const ms = Math.max(0, new Date(readyAt).getTime() - Date.now());
    const totalMinutes = Math.ceil(ms / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return this.i18n.t('profile.recoveryRemaining', { hours, minutes });
  }

  private async load(): Promise<void> {
    const [{ history, recovery }, exercises] = await Promise.all([
      this.trainingHistory.getOverview(),
      this.exerciseLibrary.getAll(),
    ]);
    this.history.set(history);
    this.recovery.set(recovery);

    const counts: Record<Rating, number> = { BRONZE: 0, SILVER: 0, GOLD: 0, PLATINUM: 0, DIAMOND: 0 };
    for (const exercise of exercises) {
      const bestLog = await this.workoutLog.getBestLog(exercise.id);
      if (!bestLog) continue;
      const rating = this.ratingCalc.ratingForEffectiveValue(effectiveValue(bestLog), exercise.ratingThresholds);
      counts[rating]++;
    }
    this.tierCounts.set(counts);
    this.loading.set(false);
  }
}
