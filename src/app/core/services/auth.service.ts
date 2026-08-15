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
   * Renueva el access token con el refresh token guardado. Pensado para
   * dispararse desde auth.interceptor.ts ante un 401 — hoy nada lo dispara
   * todavía (deuda ya conocida, compartida con mudanza-app/similart-app, ver
   * ROADMAP-calismap.md "Pendiente" — "Refresh token / expiración de
   * sesión"), pero el método ya existe para cuando se resuelva ese pendiente.
   */
  async refresh(): Promise<TokenPair | null> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return null;

    try {
      const tokens = await firstValueFrom(
        this.http.post<TokenPair>(`${environment.authApiUrl}/auth/refresh`, { refreshToken }),
      );
      localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
      return tokens;
    } catch {
      await this.logout();
      return null;
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
