import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';

// Los propios endpoints de autenticación nunca disparan la recuperación acá
// abajo — si /auth/refresh o /auth/guest devuelven 401 sería un loop
// infinito, y a /auth/google un 401 significa "ese idToken de Google no
// sirve", no "tu sesión venció".
const AUTH_ENDPOINTS = ['/auth/guest', '/auth/refresh', '/auth/google'];

/**
 * Adjunta el access token a cualquier request hacia calismap-back
 * (environment.apiUrl) o hacia el propio jp-back-auth (environment.
 * authApiUrl) — nunca hacia terceros. Al principio jp-back-auth no
 * necesitaba el token acá (login/guest/refresh son la ruta para CONSEGUIR
 * uno, no requieren tenerlo ya) — eso cambió al agregar el panel de admin:
 * GET /auth/admin/users vive en jp-back-auth y sí exige requireAuth +
 * requireAdmin (ver jp-back-auth/src/app.ts). Adjuntar el token a
 * login/guest/refresh no rompe nada (esos endpoints simplemente lo
 * ignoran), así que no hace falta distinguir por sub-ruta acá.
 *
 * Recuperación automática ante 401 (corregido 16 de agosto de 2026, ver
 * AuthService.refresh — bug real: el access token dura 30m y nada lo
 * renovaba nunca, así que cualquier sesión con más de media hora mandaba un
 * token muerto para siempre, sin que recargar la página lo arreglara). Ante
 * un 401 de nuestro propio backend, reintenta UNA vez con un token nuevo
 * (refresh, o invitado nuevo si el refresh también murió) antes de dejar
 * pasar el error al que llamó.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const isOurBackend = req.url.startsWith(environment.apiUrl) || req.url.startsWith(environment.authApiUrl);
  if (!isOurBackend) return next(req);

  const auth = inject(AuthService);
  const token = auth.getAccessToken();
  const authedReq = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(authedReq).pipe(
    catchError((err: unknown) => {
      const isRecoverable401 =
        err instanceof HttpErrorResponse &&
        err.status === 401 &&
        !AUTH_ENDPOINTS.some((path) => req.url.includes(path));
      if (!isRecoverable401) return throwError(() => err);

      return from(auth.refresh()).pipe(
        switchMap((tokens) => {
          if (!tokens) return throwError(() => err); // ni refresh ni invitado nuevo funcionaron (sin red) — el 401 original es lo más honesto que se le puede devolver a quien llamó
          return next(req.clone({ setHeaders: { Authorization: `Bearer ${tokens.accessToken}` } }));
        }),
      );
    }),
  );
};
