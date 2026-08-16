import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

// Gatea /admin/** del lado del cliente — la protección real vive en el
// backend (requireAdmin en cada endpoint de escritura de catálogo, ver
// calismap-back/src/middleware/require-admin.ts); esto solo evita que un
// usuario sin isAdmin vea la UI y pegue contra endpoints que van a
// devolverle 403 igual. Redirige a Roadmaps en vez de mostrar una pantalla
// de error — no hay nada que un usuario normal deba "ver" acá.
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAdmin() ? true : router.parseUrl('/roadmaps');
};
