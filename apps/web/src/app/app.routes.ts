import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'Club de Tenis',
    loadComponent: () => import('./inicio/inicio').then((m) => m.Inicio),
  },
  {
    path: 'estado',
    title: 'Estado del sistema — Club de Tenis',
    loadComponent: () => import('./estado/estado').then((m) => m.Estado),
  },
  { path: '**', redirectTo: '' },
];
