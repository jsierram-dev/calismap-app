import { Injectable, computed, inject } from '@angular/core';
import { TRANSLATIONS } from '../i18n/translations';
import { UserProfileService } from '../../services/user-profile.service';

/**
 * Traducción de la UI — ES/EN, inglés por defecto (17/08/2026, ver
 * ROADMAP-calismap.md "Traducciones"). Diccionario plano (`translations.ts`),
 * sin librería externa (mismo criterio que el resto de la app — Google
 * Identity Services también se hace a mano, ver GoogleIdentityService).
 *
 * El idioma vive en UserProfileService.profile().language (ya existía,
 * sincroniza con el servidor — ver user-profile.model.ts), así que este
 * servicio no tiene estado propio: `lang` es un computed derivado de ahí.
 * Un componente inyecta esto como `public i18n: I18nService` (mismo patrón
 * ya usado para auth/theme/sync/profile en SettingsPage) y llama
 * `{{ i18n.t('namespace.clave') }}` directo en el template — sin pipe: al
 * ser Zone.js (no zoneless), cualquier interpolación de método se
 * re-evalúa en cada ciclo de detección de cambios como cualquier otra, así
 * que cambiar el idioma en Ajustes (que sí dispara CD al guardar) alcanza
 * para que TODA la UI ya visible cambie de idioma sin recargar la página.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private profile = inject(UserProfileService);

  lang = computed(() => this.profile.profile().language);

  /**
   * Traduce `key` al idioma actual, con interpolación simple de `{param}` si
   * se pasan `params`. Cae a inglés si la clave falta en el idioma actual
   * (no debería pasar — ver el chequeo de tipos en translations.ts para las
   * claves ESTÁTICAS), y a la clave cruda si falta en los dos (señal visible
   * de un typo, mejor que romper la pantalla).
   *
   * `key: string`, no el union literal `TranslationKey` — a propósito:
   * varias pantallas arman la clave en runtime a partir de un valor de
   * enum ('enums.level.' + exercise.level), donde TypeScript no puede
   * verificar membership contra un union en tiempo de compilación. La
   * seguridad real sigue viniendo del chequeo ES/EN de translations.ts
   * (ninguna clave existe en un solo idioma) + que una clave rota se ve
   * literal en pantalla al tocar esa parte de la UI, no falla en silencio.
   */
  t(key: string, params?: Record<string, string | number>): string {
    const dict = TRANSLATIONS[this.lang()] as Record<string, string>;
    const enDict = TRANSLATIONS.en as Record<string, string>;
    let text: string = dict[key] ?? enDict[key] ?? key;
    if (params) {
      for (const [name, value] of Object.entries(params)) {
        text = text.replaceAll(`{${name}}`, String(value));
      }
    }
    return text;
  }
}
