import { Injectable, computed, signal } from '@angular/core';
import { DEFAULT_PROFILE, UserProfile } from '../models/user-profile.model';
import { touch } from '../core/utils/sync-meta';
import { LocalStorageService } from '../core/services/local-storage.service';
import { SyncService } from '../core/services/sync.service';

const KEY = 'calismap_user_profile';

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
      },
    });
  }

  async save(patch: Partial<Omit<UserProfile, 'updatedAt'>>): Promise<void> {
    const next = touch({ ...this.profileSignal(), ...patch });
    await this.storage.set(KEY, next);
    this.profileSignal.set(next);
  }

  getBodyWeightKg(): number {
    return this.profileSignal().bodyWeightKg;
  }

  private async load(): Promise<void> {
    const stored = await this.storage.get<UserProfile>(KEY);
    if (stored) this.profileSignal.set(stored);
  }
}
