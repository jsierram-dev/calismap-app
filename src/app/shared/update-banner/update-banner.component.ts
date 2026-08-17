import { Component, OnInit, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';
import { I18nService } from '../../core/services/i18n.service';

/**
 * Global — aviso de "hay una actualización disponible" (16/08/2026, ver
 * ROADMAP-calismap.md "Botón de actualización"). Mismo problema real que ya
 * se había resuelto en mudanza-app: el service worker de Angular baja una
 * versión nueva en segundo plano pero nunca la activa para una pestaña ya
 * abierta — sin este aviso, cualquiera que haya entrado a la app antes de un
 * deploy a GitHub Pages se queda pegado al bundle viejo hasta cerrar y
 * volver a abrir (a veces dos veces), en silencio.
 *
 * Componente propio en vez de Ionic ToastController a propósito — mismo
 * criterio que NoticeSessionComponent (banner propio, no un overlay de
 * Ionic): este proyecto no usa el sistema de toasts de Ionic en ningún otro
 * lado, así que sumarlo solo para esto sería inconsistente.
 */
@Component({
  selector: 'app-update-banner',
  standalone: true,
  templateUrl: './update-banner.component.html',
  styleUrl: './update-banner.component.css',
})
export class UpdateBannerComponent implements OnInit {
  private swUpdate = inject(SwUpdate);
  public i18n = inject(I18nService);
  available = signal(false);
  reloading = signal(false);

  ngOnInit(): void {
    if (!this.swUpdate.isEnabled) return; // ng serve / SSR — nada que observar

    this.swUpdate.versionUpdates
      .pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'))
      .subscribe(() => this.available.set(true));

    // Estado del que el service worker no puede recuperarse solo (ej. un
    // archivo del build ya no matchea el hash que esperaba, típico tras
    // varios deploys seguidos) — recargar es la única salida real, mejor
    // avisar que dejar la app rota en silencio.
    this.swUpdate.unrecoverable.subscribe(() => this.available.set(true));
  }

  async update(): Promise<void> {
    this.reloading.set(true);
    await this.swUpdate.activateUpdate().catch(() => undefined);
    document.location.reload();
  }
}
