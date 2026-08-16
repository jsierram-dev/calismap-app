import { Routes } from '@angular/router';

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
  {
    path: 'settings',
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
];
