import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ActiveSessionIndicatorService } from '../../core/services/active-session-indicator.service';
import { I18nService } from '../../core/services/i18n.service';

// Global — vive en el shell de la app (app.html), no se instancia por
// página. Presente en las 9 pantallas autenticadas, no en Login (ver
// ROADMAP-calismap.md, "Diseño de UI"). El tab de sesión es el único con
// estado dinámico: sin sesión abierta lleva a elegir sesión, con una
// abierta vuelve a ella directo y muestra el puntito (ver
// ActiveSessionIndicatorService y NoticeSessionComponent, que es la barra
// flotante — el puntito es secundario, no compite con ella).
@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css',
})
export class NavbarComponent {
  constructor(
    public sessionIndicator: ActiveSessionIndicatorService,
    public i18n: I18nService,
  ) {}
}
