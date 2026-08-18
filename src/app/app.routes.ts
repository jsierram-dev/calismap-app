import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';

// Nombres de ruta en inglés, kebab-case (ver ROADMAP-calismap.md) — /choose-session
// y /active-session apuntan al MISMO componente (SessionWorkoutPage decide
// sola qué vista mostrar según WorkoutSessionService.getActive(), ver ese
// archivo); NavbarComponent ya elige cuál de las dos según haya sesión.
export const routes: Routes = [
  { path: '', redirectTo: 'roadmaps', pathMatch: 'full' },
  {
    path: 'roadmaps',
    loadComponent: () => import('./pages/roadmaps/roadmaps.page').then((m) => m.RoadmapsPage),
  },
  {
    path: 'roadmaps/:id',
    loadComponent: () => import('./pages/roadmap-detail/roadmap-detail.page').then((m) => m.RoadmapDetailPage),
  },
  {
    path: 'exercises/:id',
    loadComponent: () => import('./pages/exercise-detail/exercise-detail.page').then((m) => m.ExerciseDetailPage),
  },
  {
    path: 'library',
    loadComponent: () => import('./pages/library/library.page').then((m) => m.LibraryPage),
  },
  // Perfil (18/08/2026, ver ROADMAP-calismap.md "Pantalla de Perfil") pasa
  // a ocupar el lugar de Ajustes en la navbar — Ajustes queda ANIDADA bajo
  // /profile/settings (no /settings suelto) a propósito: así el prefix
  // matching default de routerLinkActive en NavbarComponent (mismo
  // mecanismo que ya deja "Roadmaps" resaltado en /roadmaps/:id) marca el
  // tab de Perfil como activo también estando parado en Ajustes, sin
  // necesitar ningún chequeo especial.
  {
    path: 'profile',
    loadComponent: () => import('./pages/profile/profile.page').then((m) => m.ProfilePage),
  },
  {
    path: 'profile/settings',
    loadComponent: () => import('./pages/settings/settings.page').then((m) => m.SettingsPage),
  },
  {
    path: 'choose-session',
    loadComponent: () => import('./pages/session-workout/session-workout.page').then((m) => m.SessionWorkoutPage),
  },
  {
    path: 'active-session',
    loadComponent: () => import('./pages/session-workout/session-workout.page').then((m) => m.SessionWorkoutPage),
  },
  // Pantalla de logros (18/08/2026, ver ROADMAP-calismap.md "Pantalla de
  // logros") — SessionWorkoutPage.endSession() navega acá después de
  // cerrar la sesión, nunca se entra directo desde la navbar (no es un tab).
  {
    path: 'session-summary/:sessionId',
    loadComponent: () => import('./pages/session-summary/session-summary.component').then((m) => m.SessionSummaryComponent),
  },
  {
    path: 'create-routine',
    loadComponent: () => import('./pages/create-routine/create-routine.page').then((m) => m.CreateRoutinePage),
  },
  {
    path: 'create-exercise',
    loadComponent: () => import('./pages/create-exercise/create-exercise.page').then((m) => m.CreateExercisePage),
  },
  {
    path: 'catalog-sources',
    loadComponent: () => import('./pages/catalog-sources/catalog-sources.page').then((m) => m.CatalogSourcesPage),
  },

  // ── Panel de admin (agregado 16/08/2026) — dentro de la app móvil, no una
  //    sección de escritorio aparte (decisión del usuario, ver
  //    ROADMAP-calismap.md "Panel de administración"). adminGuard redirige
  //    a /roadmaps si auth.isAdmin() es false; la protección real vive en
  //    el backend (requireAdmin en cada endpoint de escritura). Los
  //    formularios de crear/editar reusan ExerciseManagementComponent
  //    (CreateExercisePage) y RoutineManagementComponent (CreateRoutinePage)
  //    con `data: { admin: true }` en vez de duplicarlos — mismos
  //    componentes que ya usa un usuario normal para lo propio.
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./pages/admin-home/admin-home.page').then((m) => m.AdminHomePage),
  },
  {
    path: 'admin/roadmaps',
    canActivate: [adminGuard],
    loadComponent: () => import('./pages/admin-roadmaps/admin-roadmaps.page').then((m) => m.AdminRoadmapsPage),
  },
  {
    path: 'admin/roadmaps/new',
    canActivate: [adminGuard],
    loadComponent: () => import('./pages/roadmap-management/roadmap-management.page').then((m) => m.RoadmapManagementPage),
  },
  {
    path: 'admin/roadmaps/:id/edit',
    canActivate: [adminGuard],
    loadComponent: () => import('./pages/roadmap-management/roadmap-management.page').then((m) => m.RoadmapManagementPage),
  },
  {
    path: 'admin/exercises',
    canActivate: [adminGuard],
    loadComponent: () => import('./pages/admin-exercises/admin-exercises.page').then((m) => m.AdminExercisesPage),
  },
  {
    path: 'admin/exercises/new',
    canActivate: [adminGuard],
    data: { admin: true },
    loadComponent: () => import('./pages/create-exercise/create-exercise.page').then((m) => m.CreateExercisePage),
  },
  {
    path: 'admin/exercises/:id/edit',
    canActivate: [adminGuard],
    data: { admin: true },
    loadComponent: () => import('./pages/create-exercise/create-exercise.page').then((m) => m.CreateExercisePage),
  },
  {
    path: 'admin/routines',
    canActivate: [adminGuard],
    loadComponent: () => import('./pages/admin-routines/admin-routines.page').then((m) => m.AdminRoutinesPage),
  },
  {
    path: 'admin/routines/new',
    canActivate: [adminGuard],
    data: { admin: true },
    loadComponent: () => import('./pages/create-routine/create-routine.page').then((m) => m.CreateRoutinePage),
  },
  {
    path: 'admin/routines/:id/edit',
    canActivate: [adminGuard],
    data: { admin: true },
    loadComponent: () => import('./pages/create-routine/create-routine.page').then((m) => m.CreateRoutinePage),
  },
  {
    path: 'admin/users',
    canActivate: [adminGuard],
    loadComponent: () => import('./pages/admin-users/admin-users.page').then((m) => m.AdminUsersPage),
  },
];
