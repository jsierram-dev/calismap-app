import { Component, inject } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { LoginComponent } from '../login/login.component';

/**
 * Global — aviso de que la sesión de una cuenta de Google caducó (refresh
 * vencido, ver AuthService.sessionExpired). Antes pasaba a invitado en
 * silencio y dejaba de sincronizar sin que nadie se enterara. Mismo estilo
 * que UpdateBannerComponent (banner propio, no un toast de Ionic).
 */
@Component({
  selector: 'app-session-expired-banner',
  standalone: true,
  template: `
    @if (auth.sessionExpired()) {
      <div class="update-banner" role="alert">
        <span class="dot"></span>
        <span class="msg">{{ i18n.t('sessionExpired.message') }}</span>
        <button type="button" class="update-btn" (click)="login()">{{ i18n.t('sessionExpired.login') }}</button>
      </div>
    }
  `,
  styleUrl: '../update-banner/update-banner.component.css',
})
export class SessionExpiredBannerComponent {
  auth = inject(AuthService);
  i18n = inject(I18nService);
  private modalCtrl = inject(ModalController);

  async login(): Promise<void> {
    const modal = await this.modalCtrl.create({ component: LoginComponent });
    await modal.present();
  }
}
