import { AfterViewInit, Component, ElementRef, ViewChild, signal } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';

// Carga perezosa del script de Google Identity Services — solo cuando este
// modal realmente se abre, no en cada arranque de la app (a diferencia de
// AuthService.ensureSession(), que sí corre siempre). google.accounts.id
// no tiene tipos oficiales instalados acá (evita sumar una dependencia solo
// por esto, mismo criterio que mudanza-app) — any acotado a esta única
// declaración.
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: { client_id: string; callback: (response: { credential: string }) => void }): void;
          prompt(): void;
        };
      };
    };
  }
}

const SCRIPT_ID = 'google-identity-services-script';

// Pantalla 10 — LoginComponent (ver COMPONENTES-calismap.md): OPCIONAL, se
// abre en modal desde 5 lugares (RoadmapComponent al completar el objetivo,
// SessionWorkoutComponent al terminar sesión, ExerciseManagementComponent/
// RoutineManagementComponent al guardar, ConfigurationComponent siempre
// disponible) — nunca como pantalla obligatoria de entrada (ver
// ROADMAP-calismap.md "Login: OPCIONAL"). Botón propio (no el que
// google.accounts.id.renderButton() dibuja solo) para respetar el diseño
// pill blanco del mockup — dispara prompt() con el callback ya registrado.
@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent implements AfterViewInit {
  @ViewChild('mark') markRef?: ElementRef<HTMLDivElement>;

  loading = signal(false);
  error = signal<string | null>(null);
  private scriptReady = false;

  constructor(
    private auth: AuthService,
    private modalCtrl: ModalController,
  ) {}

  ngAfterViewInit(): void {
    this.loadScript()
      .then(() => {
        this.scriptReady = true;
        window.google!.accounts.id.initialize({
          client_id: environment.googleClientId,
          callback: (response) => this.handleCredential(response.credential),
        });
      })
      .catch(() => this.error.set('No pudimos cargar el inicio de sesión de Google. Probá de nuevo más tarde.'));
  }

  continueWithGoogle(): void {
    if (!this.scriptReady) return;
    this.error.set(null);
    window.google!.accounts.id.prompt();
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

  private loadScript(): Promise<void> {
    if (window.google?.accounts?.id) return Promise.resolve();
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      return new Promise((resolve, reject) => {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('script error')));
      });
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('No se pudo cargar Google Identity Services'));
      document.head.appendChild(script);
    });
  }
}
