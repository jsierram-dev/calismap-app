import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18nService } from '../../core/services/i18n.service';

// Menú del panel de admin — pantalla nueva, sin equivalente en el mockup
// original (COMPONENTES-calismap.md documentaba 10 pantallas de usuario,
// esto es aparte). Decisión del 16/08/2026: vive DENTRO de la app móvil,
// no como sección de escritorio — accesible solo desde Ajustes cuando
// auth.isAdmin() (ver settings.page.html), gateado además por adminGuard
// en las rutas (core/guards/admin.guard.ts).
@Component({
  selector: 'app-admin-home',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './admin-home.page.html',
  styleUrl: './admin-home.page.css',
})
export class AdminHomePage {
  constructor(public i18n: I18nService) {}
}
