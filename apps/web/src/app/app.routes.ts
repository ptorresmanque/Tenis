import { Routes } from '@angular/router';

import { CascaronAdmin } from './cascarones/cascaron-admin';
import { CascaronAuth } from './cascarones/cascaron-auth';
import { CascaronPublico } from './cascarones/cascaron-publico';
import { soloAdmin } from './core/auth/solo-admin.guard';
import { soloVisitantes } from './core/auth/solo-visitantes.guard';

/**
 * Tres cascarones, tres grupos de rutas.
 *
 * Los tres cuelgan de `path: ''` y se distinguen por sus hijos: el router prueba
 * uno, y si ningún hijo calza con la URL sigue con el siguiente. Así `/entrar` y
 * `/estado` conservan la URL que ya tenían aunque cambien de cascarón.
 *
 * `soloAdmin` va una sola vez, en el padre del panel: las rutas de adentro lo
 * heredan y una pantalla nueva nace protegida en vez de nacer abierta.
 */
export const routes: Routes = [
  {
    path: '',
    component: CascaronPublico,
    children: [
      {
        path: '',
        title: 'FEDAL Tennis Center',
        loadComponent: () => import('./inicio/inicio').then((m) => m.Inicio),
      },
      {
        path: 'disponibilidad',
        title: 'Disponibilidad — FEDAL Tennis Center',
        loadComponent: () =>
          import('./catalogo-canchas/grilla/grilla').then((m) => m.Grilla),
      },
      {
        path: 'mis-reservas',
        title: 'Mis reservas — FEDAL Tennis Center',
        loadComponent: () =>
          import('./reservas/mis-reservas/mis-reservas').then((m) => m.MisReservas),
      },
      {
        path: 'reservas/confirmacion',
        title: 'Tu reserva — FEDAL Tennis Center',
        loadComponent: () =>
          import('./reservas/confirmacion').then((m) => m.ConfirmacionReserva),
      },
      {
        path: 'mi-cuenta',
        title: 'Mi cuenta — FEDAL Tennis Center',
        loadComponent: () => import('./cuotas/mi-cuenta').then((m) => m.MiCuenta),
      },
      {
        path: 'clases',
        title: 'Clases con profesor — FEDAL Tennis Center',
        loadComponent: () =>
          import('./clases/publico/clases').then((m) => m.ClasesPublicas),
      },
      {
        path: 'torneos',
        title: 'Torneos — FEDAL Tennis Center',
        loadComponent: () =>
          import('./torneos/publico/torneos').then((m) => m.TorneosPublicos),
      },
      {
        path: 'ranking',
        title: 'Ranking — FEDAL Tennis Center',
        loadComponent: () =>
          import('./ranking/torneos').then((m) => m.RankingDeTorneos),
      },
      {
        path: 'el-club',
        title: 'El club — FEDAL Tennis Center',
        loadComponent: () => import('./club/el-club').then((m) => m.ElClub),
      },
      {
        // Corta a propósito: es lo que se codifica en el QR, y cada carácter de
        // más es un módulo más de dibujo para leer en el mesón.
        path: 'r/:token',
        title: 'Reserva — FEDAL Tennis Center',
        loadComponent: () =>
          import('./reservas/reserva-publica').then((m) => m.ReservaPublicaPagina),
      },
    ],
  },
  {
    path: '',
    component: CascaronAuth,
    children: [
      {
        path: 'entrar',
        title: 'Entrar — FEDAL Tennis Center',
        loadComponent: () => import('./identidad/login/login').then((m) => m.Login),
      },
      {
        path: 'registro',
        title: 'Crear cuenta — FEDAL Tennis Center',
        canActivate: [soloVisitantes],
        loadComponent: () =>
          import('./identidad/registro/registro').then((m) => m.Registro),
      },
    ],
  },
  {
    path: '',
    component: CascaronAdmin,
    canActivate: [soloAdmin],
    children: [
      {
        path: 'administracion/reservas',
        title: 'Reservas del día — Administración',
        loadComponent: () =>
          import('./reservas/admin/agenda').then((m) => m.AgendaDelDia),
      },
      {
        path: 'administracion/canchas',
        title: 'Canchas — Administración',
        loadComponent: () =>
          import('./catalogo-canchas/admin/admin-canchas').then(
            (m) => m.AdminCanchasPanel,
          ),
      },
      {
        path: 'administracion/socios',
        title: 'Socios — Administración',
        loadComponent: () =>
          import('./identidad/admin/socios').then((m) => m.SociosPanel),
      },
      {
        path: 'administracion/cuotas',
        title: 'Cuotas — Administración',
        loadComponent: () =>
          import('./cuotas/admin/panel-cuotas').then((m) => m.PanelDeCuotas),
      },
      {
        path: 'administracion/morosos',
        title: 'Socios con deuda — Administración',
        loadComponent: () =>
          import('./cuotas/admin/morosos').then((m) => m.MorososPanel),
      },
      {
        path: 'administracion/clases',
        title: 'Clases — Administración',
        loadComponent: () =>
          import('./clases/admin/agenda-clases').then((m) => m.AgendaDeClases),
      },
      {
        path: 'administracion/profesores',
        title: 'Profesores — Administración',
        loadComponent: () =>
          import('./clases/admin/profesores').then((m) => m.ProfesoresPanel),
      },
      {
        path: 'administracion/torneos',
        title: 'Torneos — Administración',
        loadComponent: () =>
          import('./torneos/admin/torneos').then((m) => m.TorneosPanel),
      },
      {
        path: 'administracion/jugadores',
        title: 'Jugadores — Administración',
        loadComponent: () =>
          import('./torneos/admin/jugadores').then((m) => m.JugadoresPanel),
      },
      {
        path: 'administracion/solicitudes',
        title: 'Consultas al club — Administración',
        loadComponent: () =>
          import('./identidad/admin/solicitudes').then((m) => m.SolicitudesPanel),
      },
      {
        path: 'administracion/reportes',
        title: 'Horas reportadas — Administración',
        loadComponent: () =>
          import('./reservas/admin/reportes').then((m) => m.ReportesPanel),
      },
      {
        // Tres secciones bajo un mismo cascarón con sub-navegación, como decidió
        // R.5. La cuarta —avisos y correos— entra acá cuando exista.
        path: 'administracion/configuracion',
        title: 'Configuración — Administración',
        loadComponent: () =>
          import('./configuracion/configuracion').then((m) => m.Configuracion),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'reglas' },
          {
            path: 'reglas',
            title: 'Reglas de reserva — Administración',
            loadComponent: () =>
              import('./catalogo-canchas/admin/editor-configuracion').then(
                (m) => m.EditorConfiguracion,
              ),
          },
          {
            path: 'datos',
            title: 'Datos del club — Administración',
            loadComponent: () =>
              import('./configuracion/datos-del-club').then((m) => m.DatosDelClub),
          },
          {
            path: 'administradores',
            title: 'Administradores — Administración',
            loadComponent: () =>
              import('./configuracion/administradores').then(
                (m) => m.AdministradoresPanel,
              ),
          },
        ],
      },
      {
        path: 'estado',
        title: 'Estado del sistema — Administración',
        loadComponent: () => import('./estado/estado').then((m) => m.Estado),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
