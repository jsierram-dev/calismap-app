import { Component, ElementRef, ViewChild, signal } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { AuthService } from '../../core/services/auth.service';
import { GoogleIdentityService } from '../../core/services/google-identity.service';

// Pantalla 10 — LoginComponent (ver COMPONENTES-calismap.md): OPCIONAL, se
// abre en modal desde 5 lugares (RoadmapComponent al completar el objetivo,
// SessionWorkoutComponent al terminar sesión, ExerciseManagementComponent/
// RoutineManagementComponent al guardar, ConfigurationComponent siempre
// disponible) — nunca como pantalla obligatoria de entrada (ver
// ROADMAP-calismap.md "Login: OPCIONAL").
//
// Ajustes ya NO es uno de estos 5 lugares (17/08/2026, ver
// GoogleIdentityService) — ahí el login es la acción explícita que el
// usuario pidió, así que SettingsPage.openLogin() llama al servicio
// directo, sin pasar por este modal. Acá el login sigue siendo una
// SUGERENCIA sobre otra acción (completar roadmap, terminar sesión, guardar
// algo propio), por eso el modal explica el porqué y ofrece "Más tarde".
@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  @ViewChild('mark') markRef?: ElementRef<HTMLDivElement>;

  loading = signal(false);
  error = signal<string | null>(null);

  constructor(
    private auth: AuthService,
    private modalCtrl: ModalController,
    private googleIdentity: GoogleIdentityService,
  ) {}

  async continueWithGoogle(): Promise<void> {
    this.error.set(null);
    try {
      const idToken = await this.googleIdentity.promptSignIn();
      await this.handleCredential(idToken);
    } catch {
      this.error.set('No pudimos cargar el inicio de sesión de Google. Probá de nuevo más tarde.');
    }
  }

  later(): void {
    this.modalCtrl.dismiss(null, 'later');
  }

  private async handleCredential(idToken: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.auth.loginWithGoogle(idToken);
      this.modalCtrl.dismiss(null, 'success');
    } catch {
      this.error.set('No pudimos iniciar sesión. Probá de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }
}
