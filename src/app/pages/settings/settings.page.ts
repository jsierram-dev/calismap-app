import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { UserProfile } from '../../models/user-profile.model';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { ThemePreference, ThemeService } from '../../core/services/theme.service';
import { SyncService } from '../../core/services/sync.service';
import { CsvExportService } from '../../services/csv-export.service';
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
  bodyWeightInput = signal<number | null>(null);
  exportingCsv = signal(false);
  exportError = signal<string | null>(null);

  constructor(
    public auth: AuthService,
    public theme: ThemeService,
    public sync: SyncService,
    public profile: UserProfileService,
    public i18n: I18nService,
    private exerciseLibrary: ExerciseLibraryService,
    private roadmapService: RoadmapService,
    private csvExport: CsvExportService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ionViewWillEnter(): void {
    this.load();
  }

  // Antes de borrar los datos del dispositivo se intenta un último sync; si
  // falla (sin red, sesión caducada) se avisa de lo que se pierde y se deja
  // salir igualmente si el usuario quiere.
  async logout(): Promise<void> {
    let synced = !this.auth.sessionExpired();
    if (synced) await this.sync.sync().catch(() => (synced = false));
    if (!confirm(this.i18n.t(synced ? 'settings.logoutConfirm' : 'settings.logoutUnsynced'))) return;
    await this.auth.logout();
  }

  deletingAccount = signal(false);
  deleteError = signal<string | null>(null);

  async deleteAccount(): Promise<void> {
    if (!confirm(this.i18n.t('settings.deleteAccountConfirm'))) return;
    this.deletingAccount.set(true);
    this.deleteError.set(null);
    try {
      await this.auth.deleteAccount(); // recarga la app al terminar
    } catch {
      this.deleteError.set(this.i18n.t('settings.deleteAccountError'));
      this.deletingAccount.set(false);
    }
  }

  syncNow(): void {
    this.sync.syncInBackground(true);
  }

  lastSyncLabel(): string {
    const at = this.sync.lastSyncedAt();
    if (!at) return this.i18n.t('settings.neverSynced');
    const time = new Date(at).toLocaleString(this.profile.profile().language, { dateStyle: 'short', timeStyle: 'short' });
    return this.i18n.t('settings.lastSync', { time });
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
    // Recarga el campo en la unidad nueva: si no, el número en kg se guardaría como libras al salir.
    this.profile.save({ weightUnit }).then(() => this.load());
  }

  displayWeight(): number | null {
    const kg = this.profile.profile().bodyWeightKg;
    if (kg == null) return null;
    return this.profile.profile().weightUnit === 'lbs' ? Math.round(kg / KG_PER_LB) : Math.round(kg);
  }

  // Solo guarda un peso real (1-500 kg) que haya cambiado: antes un blur con
  // el campo a medio escribir guardaba 0, negativos o el valor por defecto.
  async saveBodyWeight(displayValue: number | null): Promise<void> {
    // Campo vacío = quitar el peso (es un dato de salud: tiene que poder retirarse).
    if (displayValue == null) {
      if (this.profile.profile().bodyWeightKg != null) await this.profile.save({ bodyWeightKg: null });
      return;
    }
    const kg = this.profile.profile().weightUnit === 'lbs' && displayValue != null ? displayValue * KG_PER_LB : displayValue;
    if (kg == null || !Number.isFinite(kg) || kg < 1 || kg > 500) {
      this.load(); // vuelve a mostrar el peso guardado
      return;
    }
    if (displayValue === this.displayWeight()) return;
    await this.profile.save({ bodyWeightKg: Math.round(kg * 10) / 10 });
  }

  // Exportar CSV (22/09/2026, pedido explícito del usuario, mismo día que
  // se construyó el importador) — un solo click, sin pantalla propia: a
  // diferencia de importar, exportar no tiene ninguna ambigüedad que
  // resolver (es dato propio, ya se sabe exactamente qué es cada fila),
  // así que no hace falta ningún wizard.
  async exportCsv(): Promise<void> {
    if (this.exportingCsv()) return;
    this.exportError.set(null);
    this.exportingCsv.set(true);
    try {
      await this.csvExport.exportAll();
    } catch {
      this.exportError.set(this.i18n.t('settings.exportError'));
    } finally {
      this.exportingCsv.set(false);
    }
  }

  private load(): void {
    this.bodyWeightInput.set(this.displayWeight());
  }
}
