import { ApplicationConfig, importProvidersFrom, inject, isDevMode, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { PreloadAllModules, provideRouter, withPreloading } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { IonicStorageModule } from '@ionic/storage-angular';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { AuthService } from './core/services/auth.service';
import { ThemeService } from './core/services/theme.service';
import { RoadmapService } from './services/roadmap.service';
import { WorkoutSessionService } from './services/workout-session.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // withPreloading(PreloadAllModules): las 9 páginas están todas detrás
    // de loadComponent (lazy), sin esto cada ruta se pide/compila recién
    // en el primer click a ella — el retraso real que se sentía cambiando
    // de Roadmaps a Sesión (medido: ~190ms la primera vez vs ~45ms ya
    // visitada, ver sesión del 16/08/2026). Con esto, el Router pide los
    // chunks restantes en segundo plano apenas boot ea la app (después del
    // primer render, sin bloquearlo), así que para cuando el usuario toca
    // un tab por primera vez el chunk ya está. El total a precargar es
    // chico (9 páginas, ~5-50kB cada una sin gzip), no vale la pena una
    // estrategia de precarga selectiva.
    provideRouter(routes, withPreloading(PreloadAllModules)),
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
    //
    // Precarga de Roadmaps agregada el 16/08/2026 (ver ROADMAP-calismap.md
    // "Pantalla de carga inicial") — Angular no reemplaza el contenido de
    // <app-root> (el splash de index.html) hasta que ESTE initializer
    // resuelve, así que agregar acá el mismo fetch que hace RoadmapsPage
    // (la pantalla de inicio, ver app.routes.ts) hace que la app recién
    // aparezca con la lista YA poblada, en vez de mostrar el splash,
    // reemplazarlo por una pantalla de Roadmaps vacía, y recién ahí
    // poblarla. El resultado (roadmaps[]) se descarta a propósito — lo que
    // importa es el efecto secundario de dejar tibios el cache de la lista
    // de roadmaps y el del catálogo de ejercicios (ambos con promesa en
    // vuelo compartida, ver CatalogCache/ExerciseLibraryService), así que
    // cuando RoadmapsPage pida lo mismo en su propio ngOnInit lo recibe
    // prácticamente al instante. Un error acá (offline en el primer
    // arranque) no debe tumbar el arranque de la app entera — RoadmapsPage
    // ya maneja mostrar una lista vacía si esto termina fallando.
    provideAppInitializer(async () => {
      inject(ThemeService);
      // Fuerza WorkoutSessionService a instanciarse siempre, no solo cuando
      // el usuario visita una pantalla que lo inyecta (hallazgo real
      // encontrado el 16/08/2026 probando de punta a punta el resto de esta
      // ronda, ver ROADMAP-calismap.md) — su constructor repuebla
      // ActiveSessionIndicatorService (rehydrateIndicator()) si quedó una
      // sesión abierta de antes, pero ni NavbarComponent ni
      // NoticeSessionComponent (los dos que LEEN el indicador) inyectan
      // este servicio — solo lo hacen de rebote algunas páginas (Roadmaps,
      // Detalle de ejercicio...). Biblioteca no es una de esas: entrar
      // directo ahí (link externo, favorito, recargar con esa URL) con una
      // sesión activa en otro lado dejaba el aviso sin aparecer nunca, sin
      // que nada lo disparara después. En el uso normal casi no se notaba
      // (siempre se entra primero por Roadmaps, que sí repuebla) — por eso
      // no se había encontrado antes.
      inject(WorkoutSessionService);
      await inject(AuthService).ensureSession();
      try {
        await inject(RoadmapService).getAllRoadmaps();
      } catch {
        // sin red en el primer arranque — se sigue igual, RoadmapsPage reintenta sola
      }
    }),
    // Botón de actualización (16/08/2026, ver ROADMAP-calismap.md "Botón de
    // actualización") — mismo mecanismo ya probado en mudanza-app: sin esto,
    // el service worker baja una versión nueva en segundo plano pero nunca
    // la activa para una pestaña ya abierta — quien haya entrado a la app
    // antes de un deploy a GitHub Pages se queda pegado al bundle viejo
    // hasta cerrar y volver a abrir (a veces dos veces), en silencio.
    // `registerWhenStable:30000` (no inmediato): registrar el SW compite por
    // los mismos recursos que el arranque en frío ya cargado de por sí (ver
    // "Pantalla de carga inicial") — mejor esperar a que la app esté
    // estable o a los 30s, lo que pase primero. `isDevMode()` lo desactiva
    // en `ng serve`: un SW cacheando agresivamente en desarrollo esconde
    // cambios reales de HMR, no aporta nada ahí.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
