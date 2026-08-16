import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Routine } from '../../models/routine.model';
import { RoutineService } from '../../services/routine.service';

@Component({
  selector: 'app-admin-routines',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './admin-routines.page.html',
  styleUrl: './admin-routines.page.css',
})
export class AdminRoutinesPage implements OnInit {
  routines = signal<Routine[]>([]);

  constructor(private routineService: RoutineService) {}

  ngOnInit(): void {
    this.load();
  }

  ionViewWillEnter(): void {
    this.load();
  }

  private async load(): Promise<void> {
    const all = await this.routineService.getAll();
    this.routines.set([...all].sort((a, b) => a.name.localeCompare(b.name)));
  }
}
