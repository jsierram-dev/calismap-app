import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
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
export class App {}
