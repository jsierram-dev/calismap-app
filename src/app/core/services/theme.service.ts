import { Injectable, computed, signal } from '@angular/core';

export type ThemePreference = 'light' | 'dark' | 'system';

const KEY = 'calismap_theme';

/**
 * Tema (Claro/Oscuro/Sistema) — deliberadamente SIN sincronizar, solo local
 * (ver ROADMAP-calismap.md, "decimotercera pasada"): es del dispositivo/
 * entorno, no de la persona (oscuro de noche en el celular + claro en la
 * laptop de oficina no es contradictorio). localStorage plano (no Ionic
 * Storage) a propósito — necesita poder leerse/aplicarse SÍNCRONO antes del
 * primer paint (ver app.config.ts, provideAppInitializer) para no flashear
 * el tema equivocado un instante.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private current = signal<ThemePreference>(this.read());
  theme = computed(() => this.current());

  constructor() {
    this.apply(this.current());
  }

  set(pref: ThemePreference): void {
    this.current.set(pref);
    localStorage.setItem(KEY, pref);
    this.apply(pref);
  }

  private apply(pref: ThemePreference): void {
    const root = document.documentElement;
    if (pref === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', pref);
  }

  private read(): ThemePreference {
    const stored = localStorage.getItem(KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  }
}
