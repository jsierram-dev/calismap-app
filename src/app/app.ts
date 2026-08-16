import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { filter, map } from 'rxjs/operators';
import { NavbarComponent } from './shared/navbar/navbar.component';
import { NoticeSessionComponent } from './shared/notice-session/notice-session.component';
import { UpdateBannerComponent } from './shared/update-banner/update-banner.component';

// Shell de la app — NavbarComponent/NoticeSessionComponent/
// UpdateBannerComponent son GLOBALES (viven acá, fuera del router-outlet, no
// se instancian por página, ver COMPONENTES-calismap.md). Sin lógica de
// "ocultar navbar en Login": Login dejó de ser una pantalla obligatoria (ver
// "trigésimo primera pasada") — la app siempre tiene alguna sesión (invitado
// o real) antes de que cualquier página renderice, así que el navbar
// siempre corresponde.
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
}
