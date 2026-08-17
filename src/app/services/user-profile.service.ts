import { Injectable, computed, signal } from '@angular/core';
import { DEFAULT_PROFILE, UserProfile } from '../models/user-profile.model';
import { touch } from '../core/utils/sync-meta';
import { LocalStorageService } from '../core/services/local-storage.service';
import { SyncService } from '../core/services/sync.service';

const KEY = 'calismap_user_profile';

// Mirror SINCRÓNICO del idioma en localStorage plano (17/08/2026, ver
// ROADMAP-calismap.md "Traducciones") — LocalStorageService (Ionic
// Storage → IndexedDB) es siempre async, así que el splash pre-Angular de
// index.html (que corre ANTES de que Angular/este servicio existan, sin
// forma de esperar una promesa) no puede leer el idioma real ahí. Esta
// única clave sí es legible sync desde ese script — se mantiene al día en
// cada load()/save() de acá abajo, nunca se lee por sí sola como fuente de
// verdad (esa sigue siendo UserProfile.language, con su propio sync real).
const SPLASH_LANG_KEY = 'calismap_lang';
function mirrorLangForSplash(language: UserProfile['language']): void {
  try {
    localStorage.setItem(SPLASH_LANG_KEY, language);
  } catch {
    // Storage bloqueado (modo privado agresivo, cuota llena) — el splash
    // simplemente cae a su default (inglés) en ese caso, nada crítico.
  }
}

/**
 * Singleton local-first — sincroniza con "el más reciente gana" vía
 * SyncService.registerUserProfile (ver sync.service.ts, SyncSingleton<T>).
 * Reemplaza la versión vieja sobre StorageService (localStorage plano, sin
 * sync) — ver ROADMAP-calismap.md, "Arquitectura".
 */
@Injectable({ providedIn: 'root' })
export class UserProfileService {
  private profileSignal = signal<UserProfile>(DEFAULT_PROFILE);
  profile = computed(() => this.profileSignal());

  constructor(
    private storage: LocalStorageService,
    private sync: SyncService,
  ) {
    this.load();
    this.sync.registerUserProfile({
      getForSync: () => this.storage.get<UserProfile>(KEY),
      applyUpdate: async (update) => {
        if (!update) return; // null = el servidor tampoco tiene nada más nuevo que mandar
        await this.storage.set(KEY, update);
        this.profileSignal.set(update);
        mirrorLangForSplash(update.language);
      },
    });
  }

  async save(patch: Partial<Omit<UserProfile, 'updatedAt'>>): Promise<void> {
    const next = touch({ ...this.profileSignal(), ...patch });
    await this.storage.set(KEY, next);
    this.profileSignal.set(next);
    mirrorLangForSplash(next.language);
  }

  getBodyWeightKg(): number {
    return this.profileSignal().bodyWeightKg;
  }

  private async load(): Promise<void> {
    const stored = await this.storage.get<UserProfile>(KEY);
    if (stored) {
      this.profileSignal.set(stored);
      mirrorLangForSplash(stored.language);
    }
  }
}
