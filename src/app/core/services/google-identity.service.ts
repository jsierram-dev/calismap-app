import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

// Sin tipos oficiales instalados para esto (evita sumar una dependencia
// solo por esto, mismo criterio que mudanza-app) — any acotado a esta
// única declaración. Antes vivía duplicada dentro de login.component.ts.
//
// PromptMomentNotification agregado 17/08/2026 (hallazgo real de pruebas
// en móvil, ver promptSignIn() más abajo) — antes prompt() se llamaba sin
// listener, así que si Google decidía NO mostrar el prompt, o el usuario
// lo cerraba sin elegir cuenta, la Promise de promptSignIn() no se
// resolvía NI se rechazaba nunca: quedaba colgada para siempre.
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: { client_id: string; callback: (response: { credential: string }) => void }): void;
          prompt(momentListener?: (notification: PromptMomentNotification) => void): void;
        };
      };
    };
  }
}

interface PromptMomentNotification {
  isDisplayed(): boolean;
  isNotDisplayed(): boolean;
  isSkippedMoment(): boolean;
  isDismissedMoment(): boolean;
}

const SCRIPT_ID = 'google-identity-services-script';

/** Distingue "el usuario cerró/ignoró el prompt de Google" de un error real (script no cargó, red caída, etc.) — quien llama a promptSignIn() decide si ese caso amerita mostrar un mensaje de error o quedarse en silencio (ver SettingsPage.openLogin()/LoginComponent.continueWithGoogle()). */
export class GooglePromptCancelledError extends Error {
  constructor() {
    super('google-prompt-cancelled');
    this.name = 'GooglePromptCancelledError';
  }
}

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

  /**
   * Carga el script si hace falta, inicializa con un callback nuevo,
   * dispara el prompt, y resuelve con el idToken real cuando el usuario
   * completa el flujo de Google.
   *
   * Hallazgo real de pruebas en móvil, 17/08/2026 (ver ROADMAP-calismap.md)
   * — "Iniciar sesión con Google" se quedaba trabado en "Conectando..."
   * para siempre. Causa: `prompt()` sin listener — el callback de
   * `initialize()` SOLO se dispara si el usuario de verdad elige una
   * cuenta; si Google decide no mostrar el One Tap (sesión ya vista antes,
   * cookies de terceros bloqueadas, etc.) o el usuario lo cierra sin
   * elegir, ningún callback se disparaba nunca — la Promise quedaba
   * pendiente para siempre, y con ella el `finally` de quien llama (que es
   * lo único que apaga el estado de "cargando").
   *
   * Fix: `prompt()` ahora recibe un listener con el estado del "momento".
   * Si el momento termina SIN mostrar nada o el usuario lo descarta
   * (isNotDisplayed/isSkippedMoment/isDismissedMoment), rechazamos con
   * `GooglePromptCancelledError` — un rechazo real, no un error genérico,
   * para que quien llama pueda decidir no alarmar al usuario por algo tan
   * normal como cerrar el prompt (ver SettingsPage.openLogin()).
   */
  async promptSignIn(): Promise<string> {
    await this.ensureScriptLoaded();
    return new Promise((resolve, reject) => {
      window.google!.accounts.id.initialize({
        client_id: environment.googleClientId,
        callback: (response) => resolve(response.credential),
      });
      window.google!.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment() || notification.isDismissedMoment()) {
          reject(new GooglePromptCancelledError());
        }
        // isDisplayed() sin más: el prompt sigue en pantalla, esperando que
        // el usuario elija — no hay nada que hacer todavía, seguimos
        // esperando al callback de initialize() (resolve) o a un momento
        // posterior de este mismo listener (Google puede volver a llamarlo).
      });
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
