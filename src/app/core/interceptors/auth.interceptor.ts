import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';

/**
 * Adjunta el access token a cualquier request hacia calismap-back
 * (environment.apiUrl) — nunca hacia jp-back-auth (ahí todavía no hay
 * token, es la ruta que lo consigue) ni hacia terceros. Mismo criterio que
 * mudanza-app/similart-app.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }

  const token = inject(AuthService).getAccessToken();
  if (!token) return next(req);

  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
