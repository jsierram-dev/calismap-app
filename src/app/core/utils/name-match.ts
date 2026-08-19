// Compartido entre LibraryPage, RoadmapsPage y CreateExercisePage
// (17/08/2026, ver ROADMAP-calismap.md "Traducciones") — pedido explícito
// del usuario: buscar "dominada" tiene que encontrar "Pull-up" y
// viceversa, sin importar en qué idioma esté la pantalla en ese momento.
// Mismo criterio de simplicidad que el resto de la búsqueda de esta app
// (substring/case-insensitive, sin fuzzy-matching real): alcanza con
// comparar la query contra `name` (lo que se está mostrando ahora) +
// `nameSpanish` + `nameEnglish` (los otros dos, siempre presentes sin
// importar el idioma activo), sin repetir esta lista de 3 en cada pantalla
// que busca por nombre.
//
// Bug real, encontrado el 19/08/2026 (reportado por el usuario: "si busco
// Pull me sale Dominadas, pero si busco 'Pull Up' desaparecen las
// búsquedas") — un `.includes()` a secas es sensible a la puntuación
// EXACTA: "pull up" (con espacio, como lo escribe cualquier persona) no es
// substring de "pull-up" (con guion, como está el nombre real en inglés)
// carácter por carácter, aunque para un humano sean obviamente lo mismo.
// normalize() empareja guiones/guiones bajos con espacios (y colapsa
// espacios de más) ANTES de comparar, tanto en la query como en cada
// nombre — "pull up", "pull-up" y "pull_up" terminan siendo la misma
// cadena para el matcheo, sin tener que enumerar variantes a mano.
function normalize(s: string): string {
  return s.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function matchesNameQuery(query: string, ...names: (string | undefined)[]): boolean {
  const q = normalize(query.trim());
  if (!q) return true;
  return names.some((name) => name && normalize(name).includes(q));
}
