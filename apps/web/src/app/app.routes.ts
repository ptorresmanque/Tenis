import { Routes } from '@angular/router';

import { soloAdmin } from './core/auth/solo-admin.guard';

export const routes: Routes = [
  {
    path: '',
    title: 'Club de Tenis',
    loadComponent: () => import('./inicio/inicio').then((m) => m.Inicio),
  },
  {
    path: 'disponibilidad',
    title: 'Disponibilidad — Club de Tenis',
    loadComponent: () =>
      import('./catalogo-canchas/grilla/grilla').then((m) => m.Grilla),
  },
  {
    path: 'administracion/canchas',
    title: 'Canchas — Administración',
    canActivate: [soloAdmin],
    loadComponent: () =>
      import('./catalogo-canchas/admin/admin-canchas').then(
        (m) => m.AdminCanchasPanel,
      ),
  },
  {
    path: 'reservas/confirmacion',
    title: 'Tu reserva — Club de Tenis',
    loadComponent: () =>
      import('./reservas/confirmacion').then((m) => m.ConfirmacionReserva),
  },
  {
    path: 'entrar',
    title: 'Entrar — Club de Tenis',
    loadComponent: () => import('./identidad/login/login').then((m) => m.Login),
  },
  {
    path: 'registro',
    title: 'Crear cuenta — Club de Tenis',
    loadComponent: () => import('./identidad/registro/registro').then((m) => m.Registro),
  },
  {
    path: 'estado',
    title: 'Estado del sistema — Club de Tenis',
    loadComponent: () => import('./estado/estado').then((m) => m.Estado),
  },
  { path: '**', redirectTo: '' },
];
