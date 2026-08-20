import { Routes } from '@angular/router';

import { soloAdmin } from './core/auth/solo-admin.guard';
import { soloVisitantes } from './core/auth/solo-visitantes.guard';

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
    path: 'administracion/reservas',
    title: 'Reservas del día — Administración',
    canActivate: [soloAdmin],
    loadComponent: () =>
      import('./reservas/admin/agenda').then((m) => m.AgendaDelDia),
  },
  {
    path: 'mis-reservas',
    title: 'Mis reservas — Club de Tenis',
    loadComponent: () =>
      import('./reservas/mis-reservas/mis-reservas').then((m) => m.MisReservas),
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
    canActivate: [soloVisitantes],
    loadComponent: () => import('./identidad/registro/registro').then((m) => m.Registro),
  },
  {
    path: 'estado',
    title: 'Estado del sistema — Administración',
    canActivate: [soloAdmin],
    loadComponent: () => import('./estado/estado').then((m) => m.Estado),
  },
  { path: '**', redirectTo: '' },
];
