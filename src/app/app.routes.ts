import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./editor/editor.component').then((m) => m.EditorComponent),
  },
  {
    path: 'bench',
    loadComponent: () =>
      import('./bench/bench.component').then((m) => m.BenchComponent),
  },
];
