// Mismo shape que el backend (18/08/2026, ver ROADMAP-calismap.md
// "Paginación del catálogo") — ver calismap-back/src/shared/pagination.ts.
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
