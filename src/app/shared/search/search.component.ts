import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

// Compartido — reusado en RoadmapListComponent (01) y LibraryComponent (04),
// mismo buscador+filtro para las dos, solo cambia qué lista filtra. El
// botón abre FilterComponent (hermano, no anidado adentro) vía filterClick
// hacia el padre — ver ROADMAP-calismap.md.
@Component({
  selector: 'app-search',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './search.component.html',
  styleUrl: './search.component.css',
})
export class SearchComponent {
  @Input() placeholder = 'Buscar…';
  @Input() query = '';
  @Input() filterCount = 0;
  @Output() queryChange = new EventEmitter<string>();
  @Output() filterClick = new EventEmitter<void>();

  onInput(value: string): void {
    this.query = value;
    this.queryChange.emit(value);
  }
}
