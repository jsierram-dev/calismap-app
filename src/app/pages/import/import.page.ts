import { Component, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Exercise } from '../../models/exercise.model';
import { CsvImportService, ExerciseDecision, ParsedImport } from '../../services/csv-import.service';
import { ExerciseLibraryService } from '../../services/exercise-library.service';
import { I18nService } from '../../core/services/i18n.service';
import { LibraryPage } from '../library/library.page';

type Step = 'file' | 'weight-unit' | 'review' | 'confirm' | 'done';

interface ExerciseRow {
  name: string;
  rowCount: number;
  suggestion: Exercise | null;
  decision: ExerciseDecision | null;
  // Ejercicio real detrás de un decision 'confirm'/'map' — el decision en
  // sí solo guarda el id (todo lo que CsvImportService.commit() necesita),
  // esto es puramente para mostrar el nombre en la fila (ver
  // exerciseLibraryName() más abajo).
  mappedExercise: Exercise | null;
}

// Pantalla del importador de CSV (22/09/2026, ver ROADMAP-calismap.md) —
// wizard de un solo componente con un signal `step`, mismo patrón que
// SessionWorkoutPage (elegir sesión / sesión activa son la MISMA pantalla,
// una decide sola qué mostrar). El picker de "elegir otro ejercicio" reusa
// LibraryPage en pickerMode, igual que CreateRoutinePage/SessionWorkoutPage
// para "agregar ejercicio" — mismo mecanismo, no uno nuevo.
@Component({
  selector: 'app-import',
  standalone: true,
  imports: [LibraryPage, RouterLink],
  templateUrl: './import.page.html',
  styleUrl: './import.page.css',
})
export class ImportPage {
  step = signal<Step>('file');
  fileName = signal('');
  private selectedFile: File | null = null;
  parseError = signal<string | null>(null);

  weightUnit = signal<'kg' | 'lbs'>('kg');
  parsed = signal<ParsedImport | null>(null);
  rows = signal<ExerciseRow[]>([]);
  pickerOpenFor = signal<string | null>(null); // nombre del ejercicio para el que está abierto el picker, o null

  importing = signal(false);
  result = signal<{ sessions: number; logs: number } | null>(null);

  constructor(
    private csvImport: CsvImportService,
    private exerciseLibrary: ExerciseLibraryService,
    private router: Router,
    public i18n: I18nService,
  ) {}

  async onFileSelected(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.selectedFile = file;
    this.fileName.set(file.name);
    this.parseError.set(null);
    await this.parseAndAdvance();
  }

  async onWeightUnitConfirmed(unit: 'kg' | 'lbs'): Promise<void> {
    this.weightUnit.set(unit);
    await this.parseAndAdvance();
  }

  private async parseAndAdvance(): Promise<void> {
    if (!this.selectedFile) return;
    let parsed: ParsedImport;
    try {
      parsed = await this.csvImport.parseFile(this.selectedFile, this.weightUnit());
    } catch {
      this.parseError.set(this.i18n.t('import.parseError'));
      return;
    }

    // Peso ambiguo ("Weight"/"Peso" sin unidad en el propio header) y
    // todavía no se le preguntó al usuario — un paso intermedio antes de
    // seguir, no hace falta re-preguntar si ya está resuelto (weightUnit
    // por default es 'kg', onWeightUnitConfirmed ya la habrá cambiado si
    // hacía falta antes de volver a llamar acá).
    if (parsed.weightColumnAmbiguous && this.step() === 'file') {
      this.step.set('weight-unit');
      return;
    }

    this.parsed.set(parsed);
    const catalog = await this.exerciseLibrary.getAll();
    this.rows.set(
      parsed.distinctExerciseNames.map((name) => {
        const suggestion = this.csvImport.suggestMatch(name, catalog);
        return {
          name,
          rowCount: parsed.sessions.reduce((n, s) => n + s.rows.filter((r) => r.exerciseName === name).length, 0),
          suggestion,
          decision: suggestion ? { kind: 'confirm', exerciseId: suggestion.id } : null,
          mappedExercise: suggestion,
        };
      }),
    );
    this.step.set('review');
  }

  confirmSuggestion(row: ExerciseRow): void {
    if (!row.suggestion) return;
    this.updateDecision(row.name, { kind: 'confirm', exerciseId: row.suggestion.id }, row.suggestion);
  }

  openPickerFor(name: string): void {
    this.pickerOpenFor.set(name);
  }

  onExercisePicked(exercise: Exercise): void {
    const name = this.pickerOpenFor();
    this.pickerOpenFor.set(null);
    if (!name) return;
    this.updateDecision(name, { kind: 'map', exerciseId: exercise.id }, exercise);
  }

  createAsOwn(name: string): void {
    this.updateDecision(name, { kind: 'create' }, null);
  }

  skip(name: string): void {
    this.updateDecision(name, { kind: 'skip' }, null);
  }

  exerciseLibraryName(row: ExerciseRow): string {
    return row.mappedExercise?.name ?? '';
  }

  private updateDecision(name: string, decision: ExerciseDecision, mappedExercise: Exercise | null): void {
    this.rows.update((list) => list.map((r) => (r.name === name ? { ...r, decision, mappedExercise } : r)));
  }

  get allDecided(): boolean {
    return this.rows().length > 0 && this.rows().every((r) => r.decision !== null);
  }

  goToConfirm(): void {
    if (!this.allDecided) return;
    this.step.set('confirm');
  }

  get summarySessionCount(): number {
    const parsed = this.parsed();
    if (!parsed) return 0;
    const decisions = this.decisionsMap();
    return parsed.sessions.filter((s) => s.rows.some((r) => decisions.get(r.exerciseName)?.kind !== 'skip')).length;
  }

  get summaryLogCount(): number {
    const parsed = this.parsed();
    if (!parsed) return 0;
    const decisions = this.decisionsMap();
    return parsed.sessions.reduce((n, s) => n + s.rows.filter((r) => decisions.get(r.exerciseName)?.kind !== 'skip').length, 0);
  }

  private decisionsMap(): Map<string, ExerciseDecision> {
    return new Map(this.rows().map((r) => [r.name, r.decision!]));
  }

  async doImport(): Promise<void> {
    const parsed = this.parsed();
    if (!parsed || this.importing()) return;
    this.importing.set(true);
    try {
      const outcome = await this.csvImport.commit(parsed, this.decisionsMap());
      this.result.set(outcome);
      this.step.set('done');
    } finally {
      this.importing.set(false);
    }
  }

  startOver(): void {
    this.step.set('file');
    this.fileName.set('');
    this.selectedFile = null;
    this.parsed.set(null);
    this.rows.set([]);
    this.result.set(null);
    this.parseError.set(null);
  }

  goToProfile(): void {
    this.router.navigateByUrl('/profile');
  }

  goToLibrary(): void {
    this.router.navigateByUrl('/library');
  }
}
