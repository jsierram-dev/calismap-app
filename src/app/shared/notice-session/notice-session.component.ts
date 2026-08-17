import { Component, DestroyRef, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ActiveSessionIndicatorService } from '../../core/services/active-session-indicator.service';
import { I18nService } from '../../core/services/i18n.service';

// Global — indicador PRINCIPAL de "hay una sesión activa en otra pantalla"
// (patrón mini-reproductor tipo Spotify/Strong/Hevy). Flota arriba del
// navbar en cualquier pantalla mientras WorkoutSession.endedAt sea null
// (ver ActiveSessionIndicatorService). El puntito discreto del tab de
// Sesión en NavbarComponent es secundario, no compite con esto — ver
// ROADMAP-calismap.md, "duodécima pasada".
@Component({
  selector: 'app-notice-session',
  standalone: true,
  templateUrl: './notice-session.component.html',
  styleUrl: './notice-session.component.css',
})
export class NoticeSessionComponent implements OnInit {
  private destroyRef = inject(DestroyRef);
  private elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private now = signal(Date.now());

  constructor(
    public sessionIndicator: ActiveSessionIndicatorService,
    public i18n: I18nService,
    private router: Router,
  ) {}

  elapsedLabel = computed(() => {
    const session = this.sessionIndicator.current();
    if (!session) return '';
    const totalSeconds = Math.max(0, Math.floor((this.now() - new Date(session.startedAt).getTime()) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  });

  ngOnInit(): void {
    // Este componente solo vive en el DOM mientras hay sesión activa (el
    // shell lo renderiza con @if), así que el intervalo arranca/para solo
    // con el ciclo de vida del componente — sin lógica extra para
    // pausarlo.
    const id = setInterval(() => this.now.set(Date.now()), 1000);
    this.destroyRef.onDestroy(() => clearInterval(id));

    // Mide la altura real del propio host (16/08/2026, hallazgo #12 de
    // pruebas reales en móvil, ver ROADMAP-calismap.md) — FilterComponent
    // necesita saber cuánto espacio extra reservar además de la navbar
    // cuando esta barra TAMBIÉN está visible (offcanvas cerrado asomando un
    // poco encima de la navbar en medio de una sesión). 0 cuando no hay
    // sesión activa, porque el @if interno de esta plantilla no renderiza
    // nada y el host queda sin contenido. Altura orgánica (texto+padding),
    // no un número fijo — un ResizeObserver evita que se desincronice si el
    // contenido cambia.
    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height ?? 0;
      document.documentElement.style.setProperty('--notice-session-height', `${height}px`);
    });
    observer.observe(this.elementRef.nativeElement);
    this.destroyRef.onDestroy(() => {
      observer.disconnect();
      document.documentElement.style.setProperty('--notice-session-height', '0px');
    });
  }

  goToSession(): void {
    this.router.navigateByUrl('/active-session');
  }
}
