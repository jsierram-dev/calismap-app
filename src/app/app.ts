import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { filter, map } from 'rxjs/operators';
import { NavbarComponent } from './shared/navbar/navbar.component';
import { NoticeSessionComponent } from './shared/notice-session/notice-session.component';
import { UpdateBannerComponent } from './shared/update-banner/update-banner.component';

// Shell de la app — NavbarComponent/NoticeSessionComponent/
// UpdateBannerComponent son GLOBALES (viven acá, fuera del router-outlet, no
// se instancian por página, ver COMPONENTES-calismap.md). Login en sí sigue
// sin pantalla propia (es un modal, ver LoginComponent) así que nunca tapa
// el navbar por su cuenta — pero la pantalla de logros (18/08/2026, ver
// isSessionSummary más abajo) SÍ lo oculta a propósito, mismo espíritu que
// un modal: es una pantalla de cierre, no un lugar desde el que se navega.
@Component({
  selector: 'app-root',
  imports: [IonApp, IonRouterOutlet, NavbarComponent, NoticeSessionComponent, UpdateBannerComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
  standalone: true
})
export class App {
  private router = inject(Router);

  // Hallazgo #13 de pruebas reales en móvil (16/08/2026, ver
  // ROADMAP-calismap.md) — NoticeSessionComponent (el resumen flotante de
  // "hay una sesión activa") es redundante estando ya EN la pantalla de
  // Sesión, donde la sesión completa ya está a la vista. app.html oculta
  // contra /active-session Y /choose-session, no solo la primera: las dos
  // rutas apuntan al MISMO SessionWorkoutPage (ver ese archivo — cuál vista
  // se muestra depende de si hay sesión activa, no de cuál URL trajo hasta
  // acá), así que iniciar una sesión libre desde el picker deja la URL en
  // /choose-session mientras ya se ve el checklist en curso — sin las dos acá,
  // el aviso seguía apareciendo en ese caso concreto.
  currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  // Pantalla de logros sin navbar (18/08/2026, pedido explícito del
  // usuario — "igual que pasó con LoginComponent") — startsWith(), no
  // igualdad exacta como el chequeo de arriba: la ruta real siempre trae
  // el :sessionId al final (/session-summary/abc-123), nunca el path solo.
  isSessionSummary = computed(() => this.currentUrl().startsWith('/session-summary'));
}
