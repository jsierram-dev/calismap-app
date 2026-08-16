import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';

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
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl) && !req.url.startsWith(environment.authApiUrl)) {
    return next(req);
  }

  const token = inject(AuthService).getAccessToken();
  if (!token) return next(req);

  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
