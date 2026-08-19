import { Component, DestroyRef, OnInit, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ModalController } from '@ionic/angular/standalone';
import { Exercise, ExerciseCategory, Level, MuscleGroup, RatingThresholds, RepUnit } from '../../models/exercise.model';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { ExerciseLibraryService } from '../../services/exercise-library.service';
import { PhotoService } from '../../services/photo.service';
import { matchesNameQuery } from '../../core/utils/name-match';
import { LoginComponent } from '../../shared/login/login.component';

// Sin "label" fijo (17/08/2026, ver ROADMAP-calismap.md "Traducciones") —
// se resuelve recién en el template vía i18n.t('enums.level.'+value) /
// i18n.t('enums.category.'+value) / i18n.t('enums.muscle.'+value), mismas
// claves que FilterComponent/LibraryPage reusan para no duplicar texto.
const LEVELS: Level[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'];
const CATEGORIES: ExerciseCategory[] = ['PUSH', 'PULL', 'LEGS', 'CORE', 'STATIC', 'MOBILITY'];

// Mismos 19 valores que FilterComponent, acá en lista plana (sin agrupar
// por región) — es un formulario de creación, no un filtro, no hace falta
// la misma jerarquía visual (ver ROADMAP-calismap.md "Taxonomía de músculos").
const MUSCLES: MuscleGroup[] = [
  'CUADRICEPS', 'ISQUIOTIBIALES', 'GLUTEOS', 'GEMELOS', 'ADUCTORES',
  'PECTORAL',
  'DORSAL_ANCHO', 'TRAPECIO', 'ROMBOIDES', 'LUMBARES',
  'DELTOIDES_ANTERIOR', 'DELTOIDES_POSTERIOR',
  'BICEPS', 'TRICEPS', 'ANTEBRAZOS',
  'RECTO_ABDOMINAL', 'OBLICUOS', 'TRANSVERSO_ABDOMINAL', 'SERRATO_ANTERIOR',
];

const TIERS: (keyof RatingThresholds)[] = ['SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];

// Tope de resultados del buscador de "ejercicio parecido" — alcanza para
// que el usuario vea si ya existe algo antes de seguir escribiendo, sin
// convertir el formulario en un segundo LibraryPage.
const SIMILAR_RESULTS_LIMIT = 6;

// Pantalla 09 — ExerciseManagementComponent (ver COMPONENTES-calismap.md):
// sin modelo nuevo — misma tabla Exercise del catálogo, con userId seteado
// al guardar (ver ExerciseLibraryService.createOwn). Foto/video quedan como
// placeholder honesto (Fase 3, contenido real, pendiente) — mismo criterio
// que el carrusel de ExerciseInfoComponent.
//
// Modo admin (agregado 16/08/2026, ver ROADMAP-calismap.md "Panel de
// administración"): mismo componente reusado — pedido explícito del
// usuario — para /admin/exercises/new y /admin/exercises/:id/edit (route
// data `{ admin: true }`, ver app.routes.ts). En modo admin: guarda contra
// el catálogo real (adminCreate/adminUpdate, requireAdmin en el backend)
// en vez de crear un ejercicio propio del usuario actual, suma
// regressionExerciseId/videoUrl (campos de curación editorial que no le
// corresponden a un ejercicio propio — ver ROADMAP-calismap.md, "Ejercicios
// personalizados") y habilita edición de uno ya existente además de crear.
@Component({
  selector: 'app-create-exercise',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './create-exercise.page.html',
  styleUrl: './create-exercise.page.css',
})
export class CreateExercisePage implements OnInit {
  levels = LEVELS;
  categories = CATEGORIES;
  muscles = MUSCLES;
  tiers = TIERS;

  isAdminMode = false;
  editingId = signal<string | null>(null);
  catalogExercises = signal<Exercise[]>([]); // para el select de regresión, solo en modo admin

  name = signal('');
  description = signal('');
  level = signal<Level>('BEGINNER');
  category = signal<ExerciseCategory>('PUSH');
  selectedMuscles = signal<Set<MuscleGroup>>(new Set());
  repUnit = signal<RepUnit>('reps');
  thresholds = signal<RatingThresholds>({ SILVER: 5, GOLD: 10, PLATINUM: 15, DIAMOND: 20 });
  steps = signal<string[]>(['']);
  videoUrl = signal('');
  regressionExerciseId = signal('');

  // Hallazgo #6 de pruebas reales en móvil (16/08/2026, ver
  // ROADMAP-calismap.md) — los botones de foto/video estaban deshabilitados
  // a propósito ("próximamente"), ahora suben de verdad contra
  // PUT /photos/:id. Preview local INSTANTÁNEO con URL.createObjectURL del
  // propio archivo elegido (no hay que esperar la subida para mostrar algo)
  // — se pisa/revoca si el usuario elige otro archivo antes de guardar.
  photoId = signal<string | undefined>(undefined);
  videoId = signal<string | undefined>(undefined);
  photoPreviewUrl = signal<string | null>(null);
  videoPreviewUrl = signal<string | null>(null);
  uploadingPhoto = signal(false);
  uploadingVideo = signal(false);
  photoUploadError = signal<string | null>(null);
  videoUploadError = signal<string | null>(null);

  saving = signal(false);

  // Hallazgo #7 de pruebas reales en móvil (16/08/2026, ver
  // ROADMAP-calismap.md) — avisa si ya existe un ejercicio con un nombre
  // igual o parecido mientras se escribe, en vez de dejar que se creen
  // duplicados silenciosos.
  //
  // Ampliado a una LISTA de resultados (19/08/2026, pedido explícito del
  // usuario) — antes mostraba solo el primer match como advertencia de
  // texto; ahora es una lista real de posibles coincidencias, tocable para
  // IR A VER ese ejercicio ya existente. Busca contra los 3 nombres
  // (`name`/`nameSpanish`/`nameEnglish`, mismo `matchesNameQuery` que ya usa
  // LibraryPage) para que escribir "pull up" encuentre "Dominada" y
  // viceversa, sin importar el idioma activo de la UI. A propósito NO
  // reemplaza el flujo de creación — elegir un resultado solo NAVEGA a
  // verlo, nunca pisa/reusa esa fila para el ejercicio que se está creando:
  // un ejercicio propio con nombre repetido (ej. crear "Pull-up" propio
  // existiendo ya el del catálogo) tiene que poder coexistir con el
  // original sin que este desaparezca — createOwn siempre genera un id
  // nuevo, nunca toca el ajeno.
  similarExercises = signal<Exercise[]>([]);
  // Estilo dropdown/selector (19/08/2026, pedido explícito del usuario) —
  // antes la lista quedaba SIEMPRE visible empujando el resto del form
  // hacia abajo mientras hubiera resultados, aunque el usuario ya hubiera
  // seguido a otro campo. Ahora solo se muestra con el campo enfocado (ver
  // el template, position:absolute flotando encima en vez de empujar
  // contenido — ver create-exercise.page.css). onNameBlur() retrasa el
  // cierre 150ms en vez de cerrarlo en el mismo tick: sin ese margen, el
  // blur del input borra la lista del DOM ANTES de que el click en una fila
  // llegue a registrarse (mismo problema clásico de cualquier combobox).
  nameFieldFocused = signal(false);
  private nameBlurTimer: ReturnType<typeof setTimeout> | null = null;
  private nameSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyRef = inject(DestroyRef);

  onNameBlur(): void {
    if (this.nameBlurTimer) clearTimeout(this.nameBlurTimer);
    this.nameBlurTimer = setTimeout(() => this.nameFieldFocused.set(false), 150);
  }

  // Guardar deshabilitado hasta que haya un cambio real (19/08/2026, pedido
  // explícito del usuario) — solo aplica EDITANDO (ver canSave): crear uno
  // nuevo siempre tiene "algo distinto" de la nada, no tendría sentido acá.
  // Snapshot en string (no comparar señal por señal — son 10+ campos de
  // formas distintas: Set, array, objeto anidado) tomado UNA vez justo
  // después de precargar en ngOnInit; formSnapshot() se vuelve a llamar en
  // cada chequeo con el estado ACTUAL, mismas normalizaciones de save()
  // (trim, filter Boolean) para que un espacio de más al final no cuente
  // como "cambio" real. muscleGroups se ordena antes de comparar — el Set
  // no garantiza el mismo orden de iteración entre la carga original y
  // destildar+volver a tildar los mismos músculos en otro orden.
  private originalSnapshot: string | null = null;

  private formSnapshot(): string {
    return JSON.stringify({
      name: this.name().trim(),
      description: this.description().trim(),
      level: this.level(),
      category: this.category(),
      muscleGroups: Array.from(this.selectedMuscles()).sort(),
      steps: this.steps().map((s) => s.trim()).filter(Boolean),
      repUnit: this.repUnit(),
      ratingThresholds: this.thresholds(),
      videoUrl: this.videoUrl().trim(),
      regressionExerciseId: this.regressionExerciseId(),
      photoId: this.photoId() ?? null,
      videoId: this.videoId() ?? null,
    });
  }

  private isDirty(): boolean {
    return this.originalSnapshot !== null && this.formSnapshot() !== this.originalSnapshot;
  }

  constructor(
    private library: ExerciseLibraryService,
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private modalCtrl: ModalController,
    private photos: PhotoService,
    public i18n: I18nService,
  ) {
    this.destroyRef.onDestroy(() => {
      if (this.photoPreviewUrl()) URL.revokeObjectURL(this.photoPreviewUrl()!);
      if (this.videoPreviewUrl()) URL.revokeObjectURL(this.videoPreviewUrl()!);
    });
    effect(() => {
      const query = this.name().trim();
      if (this.nameSearchTimer) clearTimeout(this.nameSearchTimer);
      // Menos de 3 letras es demasiado ruido (casi cualquier cosa "contiene"
      // 2 letras) y editando uno existente siempre iba a encontrarse a sí
      // mismo primero — se excluye por id más abajo, pero de entrada ni
      // vale la pena buscar si el nombre no cambió del original.
      if (query.length < 3) {
        this.similarExercises.set([]);
        return;
      }
      this.nameSearchTimer = setTimeout(() => this.checkSimilarName(query), 400);
    });
    this.destroyRef.onDestroy(() => {
      if (this.nameSearchTimer) clearTimeout(this.nameSearchTimer);
      if (this.nameBlurTimer) clearTimeout(this.nameBlurTimer);
    });
  }

  private async checkSimilarName(query: string): Promise<void> {
    const all = await this.library.getAll();
    const matches = all
      .filter((e) => e.id !== this.editingId())
      .filter((e) => matchesNameQuery(query, e.name, e.nameSpanish, e.nameEnglish))
      .slice(0, SIMILAR_RESULTS_LIMIT);
    // La búsqueda es async — si el usuario ya siguió escribiendo, este
    // resultado quedó viejo, no pisar lo que corresponde a lo que hay
    // ahora en el campo.
    if (this.name().trim().toLowerCase() === query.toLowerCase()) {
      this.similarExercises.set(matches);
    }
  }

  // Ampliado (19/08/2026, pedido explícito del usuario) — antes esto
  // cortaba de entrada para cualquier ejercicio NO admin (`if
  // (!this.isAdminMode) return;`), así que editar un ejercicio PROPIO no
  // existía ni a nivel de ruta: solo se podía crear, nunca precargar uno ya
  // creado. Ahora el id se lee siempre; el modo (admin vs propio) solo
  // decide CÓMO se guarda/borra después (ver save()/remove()), no si se
  // precarga.
  async ngOnInit(): Promise<void> {
    this.isAdminMode = this.route.snapshot.data['admin'] === true;
    if (this.isAdminMode) {
      this.catalogExercises.set((await this.library.getAll()).filter((e) => !e.userId));
    }

    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    const existing = await this.library.getById(id);
    if (!existing) return;
    // Guardrail — un id de ruta se puede escribir a mano. En modo NO admin,
    // solo se precarga como edición si de verdad es un ejercicio PROPIO
    // (userId presente); un id de catálogo cae acá con la misma lógica que
    // "no encontrado" (formulario vacío de creación), nunca se llega a
    // mostrar como si fuera editable — updateOwn()/deleteOwn() del lado del
    // servicio ya rechazan tocar catálogo igual, esto es la señal en pantalla.
    if (!this.isAdminMode && !existing.userId) return;

    this.editingId.set(id);
    this.name.set(existing.name);
    this.description.set(existing.description);
    this.level.set(existing.level);
    this.category.set(existing.category);
    this.selectedMuscles.set(new Set(existing.muscleGroups));
    this.repUnit.set(existing.repUnit);
    this.thresholds.set(existing.ratingThresholds);
    this.steps.set(existing.steps.length ? existing.steps : ['']);
    this.videoUrl.set(existing.videoUrl ?? '');
    this.regressionExerciseId.set(existing.regressionExerciseId ?? '');

    // Precarga la miniatura de lo que ya se había subido antes, si había —
    // GET /photos/:id exige auth, no se puede poner el id directo en un
    // <img src> (ver PhotoService).
    this.photoId.set(existing.photoId);
    this.videoId.set(existing.videoId);
    if (existing.photoId) this.photoPreviewUrl.set(await this.photos.getObjectUrl(existing.photoId));
    if (existing.videoId) this.videoPreviewUrl.set(await this.photos.getObjectUrl(existing.videoId));

    // Recién ACÁ, con todos los campos ya precargados — antes de esta
    // línea formSnapshot() todavía vería los valores por defecto del
    // formulario vacío, no los reales.
    this.originalSnapshot = this.formSnapshot();
  }

  async onPhotoSelected(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (this.photoPreviewUrl()) URL.revokeObjectURL(this.photoPreviewUrl()!);
    this.photoPreviewUrl.set(URL.createObjectURL(file)); // instantáneo, no espera la subida
    this.photoUploadError.set(null);
    this.uploadingPhoto.set(true);
    try {
      this.photoId.set(await this.photos.upload(file));
    } catch {
      this.photoUploadError.set(this.i18n.t('createExercise.photoUploadError'));
    } finally {
      this.uploadingPhoto.set(false);
    }
  }

  async onVideoSelected(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (this.videoPreviewUrl()) URL.revokeObjectURL(this.videoPreviewUrl()!);
    this.videoPreviewUrl.set(URL.createObjectURL(file));
    this.videoUploadError.set(null);
    this.uploadingVideo.set(true);
    try {
      this.videoId.set(await this.photos.upload(file));
    } catch {
      this.videoUploadError.set(this.i18n.t('createExercise.videoUploadError'));
    } finally {
      this.uploadingVideo.set(false);
    }
  }

  isSelected(muscle: MuscleGroup): boolean {
    return this.selectedMuscles().has(muscle);
  }

  toggleMuscle(muscle: MuscleGroup): void {
    this.selectedMuscles.update((set) => {
      const next = new Set(set);
      next.has(muscle) ? next.delete(muscle) : next.add(muscle);
      return next;
    });
  }

  setThreshold(tier: keyof RatingThresholds, raw: string): void {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    this.thresholds.update((t) => ({ ...t, [tier]: value }));
  }

  updateStep(index: number, value: string): void {
    this.steps.update((list) => list.map((s, i) => (i === index ? value : s)));
  }

  addStep(): void {
    this.steps.update((list) => [...list, '']);
  }

  // Pasos opcionales (16/08/2026, hallazgo #8 de pruebas reales en móvil,
  // ver ROADMAP-calismap.md) — antes exigía al menos un paso no vacío; el
  // payload ya filtraba los vacíos con .filter(Boolean), así que no hacía
  // falta más que sacar esta condición.
  get canSave(): boolean {
    // uploadingPhoto/uploadingVideo: no guardar mientras el id todavía no
    // volvió del servidor — se perdería la foto/video recién elegido.
    // editingId() && !isDirty(): guardar sin haber cambiado nada no tiene
    // sentido — solo aplica editando (originalSnapshot es null recién
    // creado, isDirty() siempre da false ahí y no bloquea nada).
    return (
      this.name().trim().length > 0 &&
      this.selectedMuscles().size > 0 &&
      !this.uploadingPhoto() &&
      !this.uploadingVideo() &&
      (!this.editingId() || this.isDirty())
    );
  }

  async save(): Promise<void> {
    if (!this.canSave || this.saving()) return;

    if (this.isAdminMode) {
      this.saving.set(true);
      try {
        const input = {
          name: this.name().trim(),
          description: this.description().trim(),
          level: this.level(),
          category: this.category(),
          muscleGroups: Array.from(this.selectedMuscles()),
          steps: this.steps().map((s) => s.trim()).filter(Boolean),
          repUnit: this.repUnit(),
          ratingThresholds: this.thresholds(),
          videoUrl: this.videoUrl().trim() || undefined,
          regressionExerciseId: this.regressionExerciseId() || undefined,
          photoId: this.photoId(),
          videoId: this.videoId(),
        };
        const id = this.editingId();
        if (id) await this.library.adminUpdate(id, input);
        else await this.library.adminCreate(input);
        this.router.navigateByUrl('/admin/exercises');
      } finally {
        this.saving.set(false);
      }
      return;
    }

    const ownInput = {
      name: this.name().trim(),
      description: this.description().trim(),
      level: this.level(),
      category: this.category(),
      muscleGroups: Array.from(this.selectedMuscles()),
      steps: this.steps().map((s) => s.trim()).filter(Boolean),
      repUnit: this.repUnit(),
      ratingThresholds: this.thresholds(),
      photoId: this.photoId(),
      videoId: this.videoId(),
    };

    // Editar un ejercicio propio ya existente (19/08/2026) — antes esta
    // rama SIEMPRE creaba uno nuevo, sin importar si `editingId()` venía
    // seteado (no podía pasar hasta ahora: ver el comentario de ngOnInit).
    // Sin aviso de login acá — editar no es uno de los 4 momentos reales
    // (ver ROADMAP-calismap.md "Login: OPCIONAL"), solo crear.
    const editId = this.editingId();
    if (editId) {
      await this.library.updateOwn(editId, ownInput);
      this.router.navigateByUrl('/library');
      return;
    }

    const userId = this.auth.user()?.id;
    if (!userId) return; // no debería pasar — ensureSession() ya garantiza algún usuario (invitado o real)

    await this.library.createOwn(ownInput, userId);

    // Crear un ejercicio propio es uno de los 4 momentos con motivo real
    // para pedirle cuenta a un invitado (ver ROADMAP-calismap.md "Login:
    // OPCIONAL") — no bloqueante, el ejercicio ya se guardó antes de mostrarlo.
    if (this.auth.isGuest()) {
      const modal = await this.modalCtrl.create({ component: LoginComponent });
      await modal.present();
    }
    this.router.navigateByUrl('/library');
  }

  // Ampliado (19/08/2026) — antes esto SOLO existía para modo admin
  // (`adminDelete`); `library.deleteOwn` ya existía del lado del servicio
  // pero nada de la UI lo llamaba todavía. El botón que dispara esto ahora
  // aparece también para un ejercicio propio (ver el template), así que acá
  // hace falta el mismo branch que ya usa save().
  async remove(): Promise<void> {
    const id = this.editingId();
    if (!id) return;
    if (!confirm(this.i18n.t('createExercise.confirmDelete', { name: this.name() }))) return;

    if (!this.isAdminMode) {
      await this.library.deleteOwn(id);
      this.router.navigateByUrl('/library');
      return;
    }

    await this.library.adminDelete(id);
    this.router.navigateByUrl('/admin/exercises');
  }
}
