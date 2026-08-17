import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

// Sin tipos oficiales instalados para esto (evita sumar una dependencia
// solo por esto, mismo criterio que mudanza-app) — any acotado a esta
// única declaración. Antes vivía duplicada dentro de login.component.ts.
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

/**
 * Carga perezosa del script de Google Identity Services + el flujo real de
 * "prompt de Google, esperar el credential" — extraído de `LoginComponent`
 * el 17/08/2026 (hallazgo real: el botón "Continuar con Google" de Ajustes
 * abría el modal de `LoginComponent`, que tiene SU PROPIO botón "Continuar
 * con Google" — un paso intermedio redundante para quien ya expresó la
 * intención con claridad estando parado en Ajustes. Los otros 4 lugares que
 * abren el modal — completar un roadmap, terminar sesión, guardar
 * ejercicio/rutina propia — sí lo necesitan: ahí el login es una sugerencia
 * oportunista sobre OTRA acción, no lo que el usuario pidió explícitamente,
 * así que el modal con su copy explicando el porqué + "Más tarde" sigue
 * teniendo sentido ahí). `LoginComponent` ahora usa este mismo servicio en
 * vez de duplicar la carga del script.
 */
@Injectable({ providedIn: 'root' })
export class GoogleIdentityService {
  private scriptReadyPromise: Promise<void> | null = null;

  /** Carga el script si hace falta, inicializa con un callback nuevo, dispara el prompt, y resuelve con el idToken real cuando el usuario completa el flujo de Google. */
  async promptSignIn(): Promise<string> {
    await this.ensureScriptLoaded();
    return new Promise((resolve) => {
      window.google!.accounts.id.initialize({
        client_id: environment.googleClientId,
        callback: (response) => resolve(response.credential),
      });
      window.google!.accounts.id.prompt();
    });
  }

  private ensureScriptLoaded(): Promise<void> {
    if (this.scriptReadyPromise) return this.scriptReadyPromise;
    this.scriptReadyPromise = new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) {
        resolve();
        return;
      }
      const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('script error')));
        return;
      }
      const script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('No se pudo cargar Google Identity Services'));
      document.head.appendChild(script);
    });
    return this.scriptReadyPromise;
  }
}
