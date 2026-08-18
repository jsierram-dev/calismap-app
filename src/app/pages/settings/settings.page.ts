import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { UserProfile } from '../../models/user-profile.model';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { ThemePreference, ThemeService } from '../../core/services/theme.service';
import { SyncService } from '../../core/services/sync.service';
import { ExerciseLibraryService } from '../../services/exercise-library.service';
import { RoadmapService } from '../../services/roadmap.service';
import { UserProfileService } from '../../services/user-profile.service';

const KG_PER_LB = 0.453592;

// Pantalla 05 — ConfigurationComponent (ver COMPONENTES-calismap.md):
// preferencias (idioma, sincroniza con UserProfile; tema, SOLO local vía
// ThemeService), unidades (peso corporal — se guarda siempre en kg, la
// unidad es solo presentación), entrenamiento (timer default, estado de
// sync), cuenta (cerrar sesión).
//
// Reestructurado el 18/08/2026 (ver ROADMAP-calismap.md "Pantalla de
// Perfil") — la tarjeta de perfil (foto/nombre, login de Google) y el
// resumen "Tu progreso" se mudaron a ProfilePage, que ahora ocupa el lugar
// de esta pantalla en la navbar. Ajustes pasa a ser una pantalla
// secundaria, a la que se llega con un botón desde Perfil — ver
// profile.page.html.
@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.css',
})
export class SettingsPage implements OnInit {
  bodyWeightInput = signal(75);

  constructor(
    public auth: AuthService,
    public theme: ThemeService,
    public sync: SyncService,
    public profile: UserProfileService,
    public i18n: I18nService,
    private exerciseLibrary: ExerciseLibraryService,
    private roadmapService: RoadmapService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ionViewWillEnter(): void {
    this.load();
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
  }

  private load(): void {
    this.bodyWeightInput.set(this.displayWeight());
  }
}
