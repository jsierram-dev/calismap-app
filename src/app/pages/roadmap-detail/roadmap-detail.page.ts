import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ModalController } from '@ionic/angular/standalone';
import { Rating } from '../../models/exercise.model';
import { RoadmapDetailViewModel, RoadmapStepViewModel } from '../../models/roadmap.model';
import { AuthService } from '../../core/services/auth.service';
import { RoadmapService } from '../../services/roadmap.service';
import { RatingCalculatorService } from '../../services/rating-calculator.service';
import { UserProfileService } from '../../services/user-profile.service';
import { LoginComponent } from '../../shared/login/login.component';
import { RouteComponent, RouteNode, RouteNodeState } from '../../shared/route/route.component';

// Pantalla 02 — RoadmapComponent (ver COMPONENTES-calismap.md): pantalla
// completa (tag+título+"X de N pasos") con RouteComponent anidado adentro.
// El texto de cada nodo (coach-note/metaText) se arma acá, no en el
// servicio: RoadmapService devuelve datos (rating/bestValue/
// minRatingRequired), esta página los traduce a la copia real que ve el
// usuario — mismo criterio que ya usaba la versión vieja.
@Component({
  selector: 'app-roadmap-detail',
  standalone: true,
  imports: [RouteComponent],
  templateUrl: './roadmap-detail.page.html',
  styleUrl: './roadmap-detail.page.css',
})
export class RoadmapDetailPage implements OnInit {
  detail = signal<RoadmapDetailViewModel | null>(null);
  nodes = signal<RouteNode[]>([]);

  constructor(
    private route: ActivatedRoute,
    private roadmapService: RoadmapService,
    private ratingCalc: RatingCalculatorService,
    private userProfile: UserProfileService,
    private auth: AuthService,
    private modalCtrl: ModalController,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ionViewWillEnter(): void {
    this.load();
  }

  private async load(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id')!;
    const detail = await this.roadmapService.getRoadmapDetail(id);
    this.detail.set(detail);
    this.nodes.set(detail ? this.buildNodes(detail) : []);

    // Completar el objetivo es uno de los 4 momentos con motivo real para
    // pedirle cuenta a un invitado (ver ROADMAP-calismap.md "Login:
    // OPCIONAL") — no bloqueante, y sin gate de "ya se mostró antes" (v1:
    // se muestra cada vez que se visita un roadmap ya completado siendo
    // invitado, simplificación aceptada dado el alcance de esta ronda).
    const target = detail?.steps.find((s) => s.isTarget);
    if (target?.isCompleted && this.auth.isGuest()) {
      const modal = await this.modalCtrl.create({ component: LoginComponent });
      await modal.present();
    }
  }

  private buildNodes(detail: RoadmapDetailViewModel): RouteNode[] {
    const bodyWeightKg = this.userProfile.getBodyWeightKg();

    return detail.steps.map((step, index) => {
      const state: RouteNodeState = step.isCompleted ? 'done' : step.isUnlocked ? 'current' : 'locked';
      const node: RouteNode = {
        title: step.exercise.name,
        levelLabel: step.isTarget ? `${step.exercise.level} · OBJETIVO` : step.exercise.level,
        state,
        isTarget: step.isTarget,
        exerciseId: step.exercise.id,
      };
      if (state === 'current') node.stepNumber = step.stepOrder;
      if (step.rating) node.ratingBadge = step.rating;

      const unit = step.exercise.repUnit === 'reps' ? 'reps' : 'seg';
      const next = detail.steps[index + 1];

      if (state === 'done') {
        node.metaText =
          next && next.minRatingRequired
            ? `Tu mejor marca: ${step.bestValue} ${unit} — supera el mínimo (${this.ratingLabel(next.minRatingRequired)}) para el siguiente paso`
            : `Tu mejor marca: ${step.bestValue} ${unit}`;
      } else if (state === 'current') {
        if (next?.minRatingRequired) {
          const needed = this.ratingCalc.valueNeededFor(next.minRatingRequired, bodyWeightKg, step.exercise.ratingThresholds);
          const remaining = Math.max(0, needed - (step.bestValue ?? 0));
          node.coachNote =
            step.bestValue !== null
              ? { headline: `${needed} ${unit} y desbloqueas ${next.exercise.name}`, sub: `Te faltan ${remaining} desde tu mejor marca (${step.bestValue})` }
              : { headline: `${needed} ${unit} y desbloqueas ${next.exercise.name}`, sub: 'Registra tu primera marca para arrancar' };
          node.progressPercent = Math.min(100, Math.round(((step.bestValue ?? 0) / needed) * 100));
        } else {
          node.metaText = step.bestValue !== null ? `Tu mejor marca: ${step.bestValue} ${unit}` : 'Registra tu primera marca';
        }
      } else if (step.minRatingRequired) {
        const prev = detail.steps[index - 1];
        node.metaText = `Se desbloquea con ${this.ratingLabel(step.minRatingRequired)}${prev ? ' en ' + prev.exercise.name : ''}`;
      }

      return node;
    });
  }

  private ratingLabel(rating: Rating): string {
    return rating.charAt(0) + rating.slice(1).toLowerCase();
  }
}
