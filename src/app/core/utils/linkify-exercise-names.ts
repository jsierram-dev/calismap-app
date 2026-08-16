import { Exercise } from '../../models/exercise.model';

export interface TextSegment {
  text: string;
  exerciseId?: string;
}

/**
 * Hallazgo #2 de pruebas reales en móvil (16/08/2026, ver
 * ROADMAP-calismap.md) — si el texto de un paso menciona el nombre real de
 * OTRO ejercicio del catálogo, ese pedazo de texto se convierte en link.
 * Devuelve segmentos en vez de HTML armado a mano ([innerHTML] necesitaría
 * sanitizar) — el template itera esto con @for, cada segmento con
 * exerciseId se renderiza como <a>, el resto como texto plano.
 *
 * Comparación simple por substring (case-insensitive), no fuzzy-matching —
 * mismo criterio que el aviso de nombre parecido al crear un ejercicio (ver
 * create-exercise.page.ts). Los nombres más largos van primero para que
 * "Chest-to-Bar Pull-up" no termine matcheado a mitad como "Pull-up".
 */
export function linkifyExerciseNames(text: string, exercises: Exercise[], excludeId: string): TextSegment[] {
  const candidates = exercises
    .filter((e) => e.id !== excludeId && e.name.trim().length > 0)
    .sort((a, b) => b.name.length - a.name.length);

  if (!candidates.length || !text) return [{ text }];

  const escaped = candidates.map((e) => e.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');

  const segments: TextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index) });
    }
    const matchedName = match[0];
    const exercise = candidates.find((e) => e.name.toLowerCase() === matchedName.toLowerCase());
    segments.push({ text: matchedName, exerciseId: exercise?.id });
    lastIndex = match.index + matchedName.length;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) });
  }
  return segments.length ? segments : [{ text }];
}
