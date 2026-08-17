// Compartido entre LibraryPage y RoadmapsPage (17/08/2026, ver
// ROADMAP-calismap.md "Traducciones") — pedido explícito del usuario:
// buscar "dominada" tiene que encontrar "Pull-up" y viceversa, sin
// importar en qué idioma esté la pantalla en ese momento. Mismo criterio
// de simplicidad que el resto de la búsqueda de esta app (substring/
// case-insensitive, sin fuzzy-matching real — ver el mismo criterio ya
// usado para el aviso de "ejercicio parecido" en CreateExercisePage):
// alcanza con comparar la query contra `name` (lo que se está mostrando
// ahora) + `nameSpanish` + `nameEnglish` (los otros dos, siempre presentes
// sin importar el idioma activo), sin repetir esta lista de 3 en cada
// pantalla que busca por nombre.
export function matchesNameQuery(query: string, ...names: (string | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return names.some((name) => name?.toLowerCase().includes(q));
}
