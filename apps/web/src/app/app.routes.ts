import { Routes } from '@angular/router';

import { CascaronPublico } from './cascarones/cascaron-publico';
import { conPanel } from './core/auth/con-panel.guard';
import { soloVisitantes } from './core/auth/solo-visitantes.guard';

/**
 * Tres cascarones, tres grupos de rutas.
 *
 * Los tres cuelgan de `path: ''` y se distinguen por sus hijos: el router prueba
 * uno, y si ningún hijo calza con la URL sigue con el siguiente. Así `/entrar` y
 * `/estado` conservan la URL que ya tenían aunque cambien de cascarón.
 *
 * `conPanel` va una sola vez, en el padre del panel, y corre en cada pantalla de adentro:
 * una pantalla nueva nace solo para el admin hasta que `tipos-del-panel.ts` la abra.
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
        path: 'tours',
        title: 'Tours — FEDAL Tennis Center',
        loadComponent: () => import('./tours/publico/tours').then((m) => m.ToursPublicos),
      },
      {
        path: 'tours/:id',
        title: 'Tour — FEDAL Tennis Center',
        loadComponent: () => import('./tours/publico/tour').then((m) => m.TourPublicoPagina),
      },
      {
        path: 'mis-partidos',
        title: 'Mis partidos — FEDAL Tennis Center',
        loadComponent: () =>
          import('./ranking/mis-partidos').then((m) => m.MisPartidos),
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
        // Sin guard: Google la abre sin sesión para aprobar el login con Google.
        path: 'privacidad',
        title: 'Política de privacidad — FEDAL Tennis Center',
        loadComponent: () => import('./club/privacidad').then((m) => m.Privacidad),
      },
      {
        path: 'preguntas-frecuentes',
        title: 'Preguntas frecuentes — FEDAL Tennis Center',
        loadComponent: () =>
          import('./club/preguntas-frecuentes').then((m) => m.PreguntasFrecuentesPublicas),
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
    // El panel y entrar se bajan con su ruta: el arranque trae solo el sitio público (I6).
    loadComponent: () => import('./cascarones/cascaron-auth').then((m) => m.CascaronAuth),
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
      {
        path: 'recuperar-contrasena',
        title: 'Recuperar contraseña — FEDAL Tennis Center',
        loadComponent: () =>
          import('./identidad/recuperar-contrasena/recuperar-contrasena').then(
            (m) => m.RecuperarContrasena,
          ),
      },
      {
        // El enlace del correo. Misma pantalla, otra ruta: ver RecuperarContrasena.
        path: 'nueva-contrasena',
        title: 'Contraseña nueva — FEDAL Tennis Center',
        loadComponent: () =>
          import('./identidad/recuperar-contrasena/recuperar-contrasena').then(
            (m) => m.RecuperarContrasena,
          ),
      },
      {
        // Sin `soloVisitantes`: entrar no exige el correo verificado, así que
        // quien ya tiene sesión también puede necesitar el enlace.
        path: 'verificar-correo',
        title: 'Verificar correo — FEDAL Tennis Center',
        loadComponent: () =>
          import('./identidad/verificar-correo/verificar-correo').then(
            (m) => m.VerificarCorreo,
          ),
      },
    ],
  },
  {
    path: '',
    loadComponent: () => import('./cascarones/cascaron-admin').then((m) => m.CascaronAdmin),
    canActivateChild: [conPanel],
    children: [
      {
        path: 'administracion/reservas',
        title: 'Agenda del día — Administración',
        // T285 (SPEC-panel.md D5): la agenda y la ocupación, en pestañas con su ruta.
        loadComponent: () =>
          import('./reservas/admin/panel-de-la-agenda').then((m) => m.PanelDeLaAgenda),
        children: [
          {
            path: '',
            pathMatch: 'full',
            title: 'Agenda del día — Administración',
            loadComponent: () =>
              import('./reservas/admin/agenda').then((m) => m.AgendaDelDia),
          },
          {
            path: 'ocupacion',
            title: 'Agenda del día · Ocupación — Administración',
            loadComponent: () =>
              import('./reportes/ocupacion').then((m) => m.OcupacionPanel),
          },
        ],
      },
      {
        path: 'administracion/canchas',
        title: 'Canchas — Administración',
        // T288 (SPEC-panel.md D1): la lista, el horario y las tarifas del club, en pestañas.
        loadComponent: () =>
          import('./catalogo-canchas/admin/canchas').then((m) => m.PantallaDeCanchas),
        children: [
          {
            path: '',
            pathMatch: 'full',
            title: 'Canchas — Administración',
            loadComponent: () =>
              import('./catalogo-canchas/admin/admin-canchas').then(
                (m) => m.AdminCanchasPanel,
              ),
          },
          {
            path: 'horario',
            title: 'Canchas · Horario — Administración',
            data: { parte: 'horario' },
            loadComponent: () =>
              import('./catalogo-canchas/admin/reglas-generales').then(
                (m) => m.ReglasGeneralesPanel,
              ),
          },
          {
            path: 'tarifas',
            title: 'Canchas · Tarifas — Administración',
            data: { parte: 'tarifas' },
            loadComponent: () =>
              import('./catalogo-canchas/admin/reglas-generales').then(
                (m) => m.ReglasGeneralesPanel,
              ),
          },
        ],
      },
      {
        // T223. Todas las cuentas y sus tipos; reemplaza a Configuración → Administradores.
        path: 'administracion/usuarios',
        title: 'Usuarios — Administración',
        loadComponent: () =>
          import('./identidad/admin/usuarios').then((m) => m.UsuariosPanel),
      },
      {
        path: 'administracion/socios',
        title: 'Socios — Administración',
        loadComponent: () =>
          import('./identidad/admin/socios').then((m) => m.SociosPanel),
      },
      {
        // Pasó a ser una pestaña de Finanzas (T286); los marcadores siguen andando.
        path: 'administracion/cuotas',
        pathMatch: 'full',
        redirectTo: '/administracion/finanzas/cuotas',
      },
      {
        // Pasó a ser una pestaña de Finanzas (T286); los marcadores siguen andando.
        path: 'administracion/morosos',
        pathMatch: 'full',
        redirectTo: '/administracion/finanzas/morosos',
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
        // **Antes de la lista no: después.** Angular resuelve por orden y
        // `administracion/torneos` es prefijo de esta, pero al ser rutas distintas
        // —una con parámetro— no compiten. Va junto a la suya para leerlas de a par.
        path: 'administracion/torneos/:id',
        title: 'Torneo — Administración',
        loadComponent: () =>
          import('./torneos/admin/ficha-torneo').then((m) => m.FichaDeTorneo),
      },
      {
        path: 'administracion/tours',
        title: 'Tours — Administración',
        loadComponent: () => import('./tours/admin/tours').then((m) => m.ToursPanel),
      },
      {
        path: 'administracion/tours/:id',
        title: 'Tour — Administración',
        loadComponent: () => import('./tours/admin/ficha-tour').then((m) => m.FichaTour),
      },
      {
        path: 'administracion/jugadores',
        title: 'Jugadores — Administración',
        loadComponent: () =>
          import('./torneos/admin/jugadores').then((m) => m.JugadoresPanel),
      },
      {
        path: 'administracion/partidos-internos',
        title: 'Partidos entre socios — Administración',
        loadComponent: () =>
          import('./ranking/admin/partidos-internos').then(
            (m) => m.PartidosInternosPanel,
          ),
      },
      {
        path: 'administracion/solicitudes',
        title: 'Consultas al club — Administración',
        loadComponent: () =>
          import('./identidad/admin/solicitudes').then((m) => m.SolicitudesPanel),
      },
      {
        path: 'administracion/finanzas',
        title: 'Finanzas — Administración',
        // T286 (SPEC-panel.md D4): el ingreso, el padrón, las cuotas y los deudores, en pestañas.
        loadComponent: () => import('./finanzas/finanzas').then((m) => m.Finanzas),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'ingreso' },
          {
            path: 'ingreso',
            title: 'Finanzas · Ingreso — Administración',
            loadComponent: () =>
              import('./reportes/ingreso').then((m) => m.IngresoPanel),
          },
          {
            path: 'padron',
            title: 'Finanzas · Padrón y morosidad — Administración',
            loadComponent: () =>
              import('./reportes/padron').then((m) => m.PadronPanel),
          },
          {
            path: 'cuotas',
            title: 'Finanzas · Cuotas — Administración',
            loadComponent: () =>
              import('./cuotas/admin/panel-cuotas').then((m) => m.PanelDeCuotas),
          },
          {
            path: 'morosos',
            title: 'Finanzas · Socios con deuda — Administración',
            loadComponent: () =>
              import('./cuotas/admin/morosos').then((m) => m.MorososPanel),
          },
        ],
      },
      {
        // Pasó a ser una pestaña de Finanzas (T286); los marcadores siguen andando.
        path: 'administracion/ingreso',
        pathMatch: 'full',
        redirectTo: '/administracion/finanzas/ingreso',
      },
      {
        // La pantalla pasó a ser una pestaña de la agenda (T285); los marcadores siguen andando.
        path: 'administracion/ocupacion',
        pathMatch: 'full',
        redirectTo: '/administracion/reservas/ocupacion',
      },
      {
        path: 'administracion/no-uso',
        title: 'Horas no usadas — Administración',
        // T287 (SPEC-panel.md D6): lo que hay que revisar y la estadística, en pestañas.
        loadComponent: () =>
          import('./reportes/horas-no-usadas').then((m) => m.HorasNoUsadas),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'por-revisar' },
          {
            path: 'por-revisar',
            title: 'Horas no usadas · Por revisar — Administración',
            loadComponent: () =>
              import('./reservas/admin/reportes').then((m) => m.ReportesPanel),
          },
          {
            path: 'periodo',
            title: 'Horas no usadas · Período — Administración',
            loadComponent: () =>
              import('./reportes/no-uso').then((m) => m.NoUsoPanel),
          },
        ],
      },
      {
        // Pasó a ser una pestaña de Finanzas (T286); los marcadores siguen andando.
        path: 'administracion/padron',
        pathMatch: 'full',
        redirectTo: '/administracion/finanzas/padron',
      },
      {
        // Pasó a ser la pestaña «Por revisar» de Horas no usadas (T287).
        path: 'administracion/reportes',
        pathMatch: 'full',
        redirectTo: '/administracion/no-uso/por-revisar',
      },
      {
        // Las secciones bajo un mismo cascarón con pestañas, como decidió R.5. Desde T290
        // son cinco: lo del club y los servicios van en paneles dentro de su pestaña.
        path: 'administracion/configuracion',
        title: 'Configuración — Administración',
        loadComponent: () =>
          import('./configuracion/configuracion').then((m) => m.Configuracion),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'reglas' },
          {
            path: 'reglas',
            title: 'Configuración · Reglas y cuotas — Administración',
            loadComponent: () =>
              import('./catalogo-canchas/admin/editor-configuracion').then(
                (m) => m.EditorConfiguracion,
              ),
          },
          // T290 (SPEC-panel.md D11). Los datos, los textos y las preguntas frecuentes, en paneles.
          {
            path: 'el-club',
            title: 'Configuración · El club — Administración',
            loadComponent: () => import('./configuracion/el-club').then((m) => m.ElClub),
          },
          // T290. La tienda, la cafetería y el gimnasio (T236), en paneles.
          {
            path: 'servicios',
            title: 'Configuración · Servicios — Administración',
            loadComponent: () => import('./configuracion/servicios').then((m) => m.Servicios),
          },
          {
            path: 'categorias-juego',
            title: 'Configuración · Categorías de juego — Administración',
            loadComponent: () =>
              import('./configuracion/categorias-juego').then(
                (m) => m.CategoriasDeJuegoPanel,
              ),
          },
          {
            path: 'informe-diario',
            title: 'Configuración · Informe diario — Administración',
            loadComponent: () =>
              import('./configuracion/informe-diario').then((m) => m.InformeDiario),
          },
          // Las pestañas que pasaron a ser paneles (T290), y la de antes de T236: los
          // marcadores siguen andando.
          ...(
            [
              ['datos', 'el-club'],
              ['textos', 'el-club'],
              ['preguntas-frecuentes', 'el-club'],
              ['tienda', 'servicios'],
              ['cafeteria', 'servicios'],
              ['gimnasio', 'servicios'],
              ['tienda-y-cafeteria', 'servicios'],
            ] as const
          ).map(([path, redirectTo]) => ({ path, redirectTo })),
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
