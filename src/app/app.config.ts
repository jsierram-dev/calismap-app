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
    // animated:false, swipeBackEnabled:false — esta app navega con
    // routerLink/Angular Router puro (NavbarComponent con <a>, no
    // ion-tabs/NavController), pero @ionic/angular igual monta su sistema
    // completo de transición de página + gesto de swipe-back en modo iOS
    // sobre cada ion-page. Sin este diseño propio pensado para eso, el
    // resultado es doble: la transición se ve rota (páginas superpuestas,
    // texto fantasma — ver sesión del 16/08/2026) y el swipe desde el
    // borde izquierdo (deslizar a la derecha) navega "para atrás" solo,
    // dejando la pantalla en un estado a medio animar. Ninguna de las dos
    // cosas aporta nada acá — los cambios de página son instantáneos
    // (rutas lazy ya cacheadas, <200ms) y no hay concepto de "atrás" que
    // el usuario espere poder deslizar.
    provideIonicAngular({ animated: false, swipeBackEnabled: false }),
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
