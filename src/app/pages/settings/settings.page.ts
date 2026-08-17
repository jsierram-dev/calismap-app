import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Rating } from '../../models/exercise.model';
import { UserProfile } from '../../models/user-profile.model';
import { effectiveValue } from '../../models/workout-log.model';
import { AuthService } from '../../core/services/auth.service';
import { GoogleIdentityService } from '../../core/services/google-identity.service';
import { I18nService } from '../../core/services/i18n.service';
import { ThemePreference, ThemeService } from '../../core/services/theme.service';
import { SyncService } from '../../core/services/sync.service';
import { ExerciseLibraryService } from '../../services/exercise-library.service';
import { RatingCalculatorService } from '../../services/rating-calculator.service';
import { RoadmapService } from '../../services/roadmap.service';
import { UserProfileService } from '../../services/user-profile.service';
import { WorkoutLogService } from '../../services/workout-log.service';

const KG_PER_LB = 0.453592;

// Pantalla 05 — ConfigurationComponent (ver COMPONENTES-calismap.md): perfil
// (cuenta real o invitado, con CTA de login siempre disponible — uno de los
// 5 lugares que abren LoginComponent en modal), progreso por tier,
// preferencias (idioma, sincroniza con UserProfile; tema, SOLO local vía
// ThemeService), unidades (peso corporal — se guarda siempre en kg, la
// unidad es solo presentación), entrenamiento (timer default, estado de
// sync), cuenta (cerrar sesión).
@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.css',
})
export class SettingsPage implements OnInit {
  tierCounts = signal<Record<Rating, number>>({ BRONZE: 0, SILVER: 0, GOLD: 0, PLATINUM: 0, DIAMOND: 0 });
  bodyWeightInput = signal(75);
  loggingIn = signal(false);
  loginError = signal<string | null>(null);

  constructor(
    public auth: AuthService,
    public theme: ThemeService,
    public sync: SyncService,
    public profile: UserProfileService,
    private googleIdentity: GoogleIdentityService,
    public i18n: I18nService,
    private exerciseLibrary: ExerciseLibraryService,
    private roadmapService: RoadmapService,
    private workoutLog: WorkoutLogService,
    private ratingCalc: RatingCalculatorService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ionViewWillEnter(): void {
    this.load();
  }

  initials(): string {
    const name = this.auth.user()?.username ?? '';
    return name.slice(0, 2).toUpperCase() || '??';
  }

  // Ajustes NO abre el modal de LoginComponent (17/08/2026, ver
  // GoogleIdentityService) — acá el usuario ya pidió explícitamente iniciar
  // sesión con Google estando parado en esta pantalla, así que dispara el
  // prompt de Google directo. El modal sigue vivo para los otros 4 lugares
  // (completar roadmap, terminar sesión, guardar ejercicio/rutina propia),
  // donde el login es una sugerencia sobre OTRA acción y necesita su propio
  // copy explicando el porqué + "Más tarde".
  async openLogin(): Promise<void> {
    this.loginError.set(null);
    this.loggingIn.set(true);
    try {
      const idToken = await this.googleIdentity.promptSignIn();
      await this.auth.loginWithGoogle(idToken);
    } catch {
      this.loginError.set(this.i18n.t('settings.loginError'));
    } finally {
      this.loggingIn.set(false);
    }
  }

  async logout(): Promise<void> {
    await this.auth.logout();
  }

  // El toggle ES/EN cambia la UI al instante (I18nService.lang() es un
  // computed sobre profile.profile().language, ver ese servicio) — pero el
  // catálogo (ejercicios/roadmaps) ya está cacheado en el idioma viejo, así
  // que hace falta refetchearlo explícitamente para que también cambie sin
  // esperar un refresh natural (17/08/2026, ver ROADMAP-calismap.md
  // "Traducciones"). No se espera (sin await) — el toggle de Ajustes no
  // debe sentirse trabado mientras se refresca el catálogo en segundo plano.
  setLanguage(language: 'es' | 'en'): void {
    this.profile.save({ language }).then(() => {
      this.roadmapService.invalidateForLanguageChange();
      this.exerciseLibrary.refreshCatalog();
    });
  }

  setTheme(pref: ThemePreference): void {
    this.theme.set(pref);
  }

  setWeightUnit(weightUnit: UserProfile['weightUnit']): void {
    this.profile.save({ weightUnit });
  }

  displayWeight(): number {
    const kg = this.profile.profile().bodyWeightKg;
    return this.profile.profile().weightUnit === 'lbs' ? Math.round(kg / KG_PER_LB) : Math.round(kg);
  }

  async saveBodyWeight(displayValue: number): Promise<void> {
    const kg = this.profile.profile().weightUnit === 'lbs' ? displayValue * KG_PER_LB : displayValue;
    await this.profile.save({ bodyWeightKg: Math.round(kg * 10) / 10 });
    await this.load(); // recalcula el resumen de tiers con el peso nuevo
  }

  private async load(): Promise<void> {
    this.bodyWeightInput.set(this.displayWeight());

    const exercises = await this.exerciseLibrary.getAll();
    const counts: Record<Rating, number> = { BRONZE: 0, SILVER: 0, GOLD: 0, PLATINUM: 0, DIAMOND: 0 };
    for (const exercise of exercises) {
      const bestLog = await this.workoutLog.getBestLog(exercise.id);
      if (!bestLog) continue;
      const rating = this.ratingCalc.ratingForEffectiveValue(effectiveValue(bestLog), exercise.ratingThresholds);
      counts[rating]++;
    }
    this.tierCounts.set(counts);
  }
}
