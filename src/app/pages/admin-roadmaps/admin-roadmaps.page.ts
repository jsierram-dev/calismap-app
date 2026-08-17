import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Roadmap } from '../../models/roadmap.model';
import { RoadmapService } from '../../services/roadmap.service';
import { I18nService } from '../../core/services/i18n.service';

@Component({
  selector: 'app-admin-roadmaps',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './admin-roadmaps.page.html',
  styleUrl: './admin-roadmaps.page.css',
})
export class AdminRoadmapsPage implements OnInit {
  roadmaps = signal<Roadmap[]>([]);

  constructor(
    private roadmapService: RoadmapService,
    public i18n: I18nService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ionViewWillEnter(): void {
    this.load();
  }

  private async load(): Promise<void> {
    const summaries = await this.roadmapService.getAllRoadmaps();
    this.roadmaps.set(summaries.map((s) => s.roadmap).sort((a, b) => a.name.localeCompare(b.name)));
  }
}
