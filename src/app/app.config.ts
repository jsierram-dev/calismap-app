import { ApplicationConfig, importProvidersFrom, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { IonicStorageModule } from '@ionic/storage-angular';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { AuthService } from './core/services/auth.service';
import { ThemeService } from './core/services/theme.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideIonicAngular({}),
    provideHttpClient(withInterceptors([authInterceptor])),
    // Sin NgModule en un proyecto standalone — IonicStorageModule.forRoot()
    // sigue siendo la forma de registrar sus providers (Storage) hasta que
    // @ionic/storage-angular ofrezca un provideIonicStorage() propio. Ver
    // core/services/local-storage.service.ts.
    importProvidersFrom(IonicStorageModule.forRoot()),
    // Login OPCIONAL (corregido 15 de agosto de 2026, ver
    // ROADMAP-calismap.md "Login: OPCIONAL") — la app necesita ALGÚN JWT
    // para funcionar (hasta el catálogo lo exige, ver require-auth.ts en
    // calismap-back), así que se asegura una sesión de invitado silenciosa
    // antes de que arranque el resto de la app si todavía no hay ninguna.
    // ThemeService también se instancia acá (no en un componente) para que
    // el tema quede aplicado antes del primer paint, sin flash — su propio
    // constructor ya lo aplica, este initializer solo fuerza la creación.
    provideAppInitializer(() => {
      inject(ThemeService);
      return inject(AuthService).ensureSession();
    }),
  ],
};
