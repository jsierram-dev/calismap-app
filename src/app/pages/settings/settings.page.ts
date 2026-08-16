import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ModalController } from '@ionic/angular/standalone';
import { Rating } from '../../models/exercise.model';
import { UserProfile } from '../../models/user-profile.model';
import { effectiveValue } from '../../models/workout-log.model';
import { AuthService } from '../../core/services/auth.service';
import { ThemePreference, ThemeService } from '../../core/services/theme.service';
import { SyncService } from '../../core/services/sync.service';
import { ExerciseLibraryService } from '../../services/exercise-library.service';
import { RatingCalculatorService } from '../../services/rating-calculator.service';
import { UserProfileService } from '../../services/user-profile.service';
import { WorkoutLogService } from '../../services/workout-log.service';
import { LoginComponent } from '../../shared/login/login.component';

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

  constructor(
    public auth: AuthService,
    public theme: ThemeService,
    public sync: SyncService,
    public profile: UserProfileService,
    private modalCtrl: ModalController,
    private exerciseLibrary: ExerciseLibraryService,
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

  async openLogin(): Promise<void> {
    const modal = await this.modalCtrl.create({ component: LoginComponent });
    await modal.present();
  }

  async logout(): Promise<void> {
    await this.auth.logout();
  }

  setLanguage(language: 'es' | 'en'): void {
    this.profile.save({ language });
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
