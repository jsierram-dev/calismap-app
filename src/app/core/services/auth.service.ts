import { HttpClient } from '@angular/common/http';
import { Injectable, computed, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthUser, TokenPair } from '../models/auth-user.model';

const ACCESS_TOKEN_KEY = 'calismap_access_token';
const REFRESH_TOKEN_KEY = 'calismap_refresh_token';
const USER_KEY = 'calismap_auth_user';

/**
 * Login OPCIONAL en CalisMap — corregido el 15 de agosto de 2026 (la
 * decisión original de esta misma sesión de diseño decía lo contrario).
 * Mismo patrón que mudanza-app, no uno distinto: la app arranca con una
 * identidad de INVITADO (`ensureSession()`, silencioso — llamar una vez al
 * bootstrapear la app, ver app.config.ts/main.ts) — todo funciona
 * local-first sin cuenta real, incluido leer el catálogo (`requireAuth` en
 * calismap-back exige algún JWT válido, invitado o no). Lo único que un
 * invitado no puede hacer es `/sync` (`requireGoogleAccount` lo rechaza
 * explícitamente, sin excepción del lado del servidor).
 *
 * `LoginComponent` (todavía no construido, es el paso 4/6 del frontend) se
 * le pide a un invitado en 4 momentos con motivo real — terminar una
 * sesión, crear un ejercicio propio, crear una rutina propia, completar un
 * roadmap — más un botón siempre disponible en Ajustes. Ver
 * ROADMAP-calismap.md, "Login: OPCIONAL".
 *
 * Tokens + AuthUser en localStorage, NO en Ionic Storage: necesitan lectura
 * SÍNCRONA apenas arranca la app (route guard, interceptor) — el resto de
 * los datos del usuario sí usa Ionic Storage vía LocalStorageService (ver
 * sync.service.ts). Mismo criterio que mudanza-app/similart-app.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private userSignal = signal<AuthUser | null>(this.readUser());
  user = computed(() => this.userSignal());
  isLoggedIn = computed(() => this.userSignal() !== null);
  isGuest = computed(() => this.userSignal()?.isGuest ?? true); // sin sesión todavía = tratalo como invitado, nunca como "logueado"
  isAdmin = computed(() => this.userSignal()?.isAdmin ?? false);
  private refreshPromise: Promise<TokenPair | null> | null = null;

  constructor(private http: HttpClient) {}

  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  /**
   * Bootstrap de la app: si ya hay una sesión guardada (invitado o real), no
   * hace nada. Si no hay ninguna, crea una de invitado. Se puede llamar más
   * de una vez sin culpa (ej. si el interceptor la dispara de nuevo) — solo
   * pega contra el back la primera vez.
   */
  async ensureSession(): Promise<AuthUser> {
    const current = this.userSignal();
    if (current) return current;
    return this.loginAsGuest();
  }

  private async loginAsGuest(): Promise<AuthUser> {
    const response = await firstValueFrom(
      this.http.post<{ user: AuthUser } & TokenPair>(`${environment.authApiUrl}/auth/guest`, {}),
    );
    this.applySession(response.user, response);
    return response.user;
  }

  /** idToken = el ID token que devuelve Google Identity Services del lado del cliente — ver jp-back-auth/src/modules/auth/controllers/auth.controller.ts para el contrato exacto. */
  async loginWithGoogle(idToken: string): Promise<AuthUser> {
    const response = await firstValueFrom(
      this.http.post<{ user: AuthUser } & TokenPair>(`${environment.authApiUrl}/auth/google`, { idToken }),
    );
    this.applySession(response.user, response);
    return response.user;
  }

  /**
   * Renueva la sesión ante un 401 real del backend (access token vencido —
   * dura 30m, ver jp-back-auth/src/modules/auth/services/auth.service.ts).
   * Corregido el 16 de agosto de 2026: esto YA estaba escrito y documentado
   * como "para cuando se resuelva ese pendiente", pero nada lo disparaba
   * todavía — ver auth.interceptor.ts, que ahora sí lo llama ante un 401.
   * Síntoma real que causaba: `ensureSession()` solo mira si YA hay un user
   * guardado en localStorage, nunca si el access token sigue vivo — un
   * usuario que vuelve a la app más de 30 minutos después de su última
   * visita mandaba el token muerto en cada pedido, 401 para siempre, sin que
   * recargar ni borrar site data lo arreglara (el user object sobrevive,
   * `ensureSession` nunca reautenticaba).
   *
   * Primero intenta el refresh token (dura 7 días); si no hay uno guardado o
   * también falló (vencido/inválido), arranca una sesión de invitado nueva
   * en su lugar — nunca deja a quien llama sin ningún token que funcione,
   * salvo estar sin red. Deduplicado con una promesa compartida (mismo
   * patrón que CatalogCache.getAll / ExerciseLibraryService.
   * ensureCatalogLoaded): varios pedidos en paralelo pueden pisar un 401 al
   * mismo tiempo (ej. CatalogCache de roadmaps/exercises/routines juntos) —
   * sin esto cada uno dispararía su propio refresh o guest-login por
   * separado.
   */
  refresh(): Promise<TokenPair | null> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.doRefresh().finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  private async doRefresh(): Promise<TokenPair | null> {
    const refreshToken = this.getRefreshToken();
    if (refreshToken) {
      try {
        const tokens = await firstValueFrom(
          this.http.post<TokenPair>(`${environment.authApiUrl}/auth/refresh`, { refreshToken }),
        );
        localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
        localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
        return tokens;
      } catch {
        // Refresh token vencido/inválido — sigue abajo con invitado nuevo en vez de dejar la sesión muerta.
      }
    }

    try {
      await this.loginAsGuest();
      const accessToken = this.getAccessToken();
      const newRefreshToken = this.getRefreshToken();
      return accessToken && newRefreshToken ? { accessToken, refreshToken: newRefreshToken } : null;
    } catch {
      return null; // sin red, ni siquiera esto funcionó — el interceptor deja pasar el 401 original
    }
  }

  /**
   * "Cerrar sesión" de una cuenta real. A diferencia de una app 100%
   * opcional, acá la app SIEMPRE necesita algún JWT para funcionar (aunque
   * sea de invitado) — por eso, a diferencia de un logout típico, esto
   * encadena un `ensureSession()` para volver a invitado en vez de dejar la
   * app sin sesión utilizable. Para un invitado, la pantalla de Ajustes usa
   * otra acción ("Borrar datos locales"), no este método.
   */
  async logout(): Promise<void> {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.userSignal.set(null);
    await this.ensureSession();
  }

  private applySession(user: AuthUser, tokens: TokenPair): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this.userSignal.set(user);
  }

  private readUser(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  }
}
