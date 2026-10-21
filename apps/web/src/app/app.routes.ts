import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';

import { CascaronPublico } from './cascarones/cascaron-publico';
import { conPanel } from './core/auth/con-panel.guard';
import { soloVisitantes } from './core/auth/solo-visitantes.guard';

/**
 * `/torneos?inscripcion=5` era el botón «Inscribirme» de la portada, y puede seguir en un marcador
 * o en un enlace compartido: lleva a la página de la inscripción (T316, SPEC-sitio.md A6). La vuelta de Webpay,
 * `/torneos?pago=…`, se queda en Torneos, donde está su aviso.
 */
const aLaInscripcion: CanActivateFn = (ruta) => {
  const torneo = ruta.queryParamMap.get('inscripcion');

  return torneo ? inject(Router).createUrlTree(['/torneos', torneo, 'inscripcion']) : true;
};

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
        // P20 (SPEC-sitio.md, Decimoséptima parte): qué es y dónde, que es lo que se busca.
        title: 'FEDAL Tennis Center · Club de tenis en Temuco',
        // T354 (SPEC-seo.md A3): la descripción de cada página pública, lo que Google muestra bajo
        // el título. Sin precios ni número de canchas: el club los cambia desde el panel.
        data: {
          descripcion:
            'Club de tenis en Temuco con canchas techadas y al aire libre, todas con luz. ' +
            'Reserva en línea con el precio a la vista, toma clases o juega un torneo.',
        },
        loadComponent: () => import('./inicio/inicio').then((m) => m.Inicio),
      },
      {
        path: 'disponibilidad',
        // P3: la pestaña dice lo que se hace ahí. La ruta no cambia: hay enlaces guardados.
        title: 'Reserva tu cancha de tenis en Temuco — FEDAL Tennis Center',
        data: {
          descripcion:
            'Elige día, hora y cancha en FEDAL Tennis Center, Temuco: techada o al aire libre, ' +
            'por 1 hora o 1 hora y media. Pagas en línea con Webpay; el socio no paga.',
        },
        loadComponent: () =>
          import('./catalogo-canchas/grilla/grilla').then((m) => m.Grilla),
      },
      // Mis reservas y Mis partidos son pestañas de Mi cuenta desde T318 (SPEC-sitio.md A8).
      { path: 'mis-reservas', redirectTo: '/mi-cuenta/reservas' },
      { path: 'mis-partidos', redirectTo: '/mi-cuenta/partidos' },
      {
        path: 'reservas/confirmacion',
        title: 'Tu reserva — FEDAL Tennis Center',
        // Fuera de los buscadores (T353, SPEC-seo.md A4): es la reserva de cada uno.
        data: { indexar: false },
        loadComponent: () =>
          import('./reservas/confirmacion').then((m) => m.ConfirmacionReserva),
      },
      {
        path: 'mi-cuenta',
        title: 'Mi cuenta — FEDAL Tennis Center',
        // T353 (A4): en el padre, vale para las tres pestañas.
        data: { indexar: false },
        // T318 (SPEC-sitio.md A8): las reservas, los partidos y la cuota del socio, en pestañas.
        loadComponent: () => import('./cuenta/mi-cuenta').then((m) => m.MiCuenta),
        children: [
          // Abre en Reservas, salvo la vuelta de Webpay (`/mi-cuenta?pago=…`), que va a la
          // cuota, donde está su aviso. Los parámetros siguen con la redirección.
          {
            path: '',
            pathMatch: 'full',
            redirectTo: ({ queryParams }) => (queryParams['pago'] ? 'cuota' : 'reservas'),
          },
          {
            path: 'reservas',
            title: 'Mi cuenta · Reservas — FEDAL Tennis Center',
            loadComponent: () =>
              import('./reservas/mis-reservas/mis-reservas').then((m) => m.MisReservas),
          },
          {
            path: 'partidos',
            title: 'Mi cuenta · Partidos — FEDAL Tennis Center',
            loadComponent: () => import('./ranking/mis-partidos').then((m) => m.MisPartidos),
          },
          {
            path: 'cuota',
            title: 'Mi cuenta · Cuota — FEDAL Tennis Center',
            loadComponent: () => import('./cuotas/mi-cuenta').then((m) => m.CuotaDelSocio),
          },
        ],
      },
      {
        path: 'clases',
        title: 'Clases de tenis en Temuco — FEDAL Tennis Center',
        data: {
          descripcion:
            'Clases de tenis en Temuco con los profesores de FEDAL Tennis Center: iniciación, ' +
            'competitivo y para niños. Elige un horario y escríbenos para tomar tu cupo.',
        },
        loadComponent: () =>
          import('./clases/publico/clases').then((m) => m.ClasesPublicas),
      },
      {
        path: 'torneos',
        title: 'Torneos de tenis en Temuco — FEDAL Tennis Center',
        data: {
          descripcion:
            'Torneos de tenis en Temuco para socios y no socios: inscríbete en línea en FEDAL ' +
            'Tennis Center, mira cuántos cupos quedan y sigue el cuadro de tu categoría.',
        },
        canActivate: [aLaInscripcion],
        loadComponent: () =>
          import('./torneos/publico/torneos').then((m) => m.TorneosPublicos),
      },
      {
        path: 'torneos/:id/inscripcion',
        title: 'Inscripción — FEDAL Tennis Center',
        data: { indexar: false },
        loadComponent: () =>
          import('./torneos/publico/pagina-de-inscripcion').then((m) => m.PaginaDeInscripcion),
      },
      {
        // El enlace del correo «Se abrió un cupo» (T334): sin sesión, la llave es la credencial.
        path: 'torneos/inscripcion/:token',
        title: 'Tu cupo en la lista de espera — FEDAL Tennis Center',
        data: { indexar: false },
        loadComponent: () =>
          import('./torneos/publico/oferta-de-cupo').then((m) => m.OfertaDeCupo),
      },
      {
        path: 'tours',
        title: 'Tours de tenis en Temuco — FEDAL Tennis Center',
        data: {
          descripcion:
            'Los tours de FEDAL Tennis Center, en Temuco: juega la temporada completa y suma ' +
            'puntos en cada torneo para subir en el ranking de las ligas del club.',
        },
        loadComponent: () => import('./tours/publico/tours').then((m) => m.ToursPublicos),
      },
      {
        path: 'tours/:id',
        title: 'Tour — FEDAL Tennis Center',
        loadComponent: () => import('./tours/publico/tour').then((m) => m.TourPublicoPagina),
      },
      {
        path: 'ranking',
        title: 'Ranking de torneos de tenis — FEDAL Tennis Center',
        data: {
          descripcion:
            'El ranking de los torneos de FEDAL Tennis Center, en Temuco: una tabla por tour, ' +
            'temporada y categoría, con los puntos de cada jugador según hasta dónde llegó.',
        },
        loadComponent: () =>
          import('./ranking/torneos').then((m) => m.RankingDeTorneos),
      },
      {
        path: 'el-club',
        title: 'El club: canchas, tarifas y horario — FEDAL Tennis Center',
        data: {
          descripcion:
            'FEDAL Tennis Center en Temuco: canchas de superficie dura, techadas y al aire ' +
            'libre, todas con luz. Tarifas por hora, horario, dirección y cómo hacerte socio.',
        },
        loadComponent: () => import('./club/el-club').then((m) => m.ElClub),
      },
      {
        // Sin guard: Google la abre sin sesión para aprobar el login con Google.
        path: 'privacidad',
        title: 'Política de privacidad — FEDAL Tennis Center',
        data: {
          descripcion:
            'Cómo FEDAL Tennis Center trata tus datos personales: cuáles usa y para qué, con ' +
            'quién los comparte, cuánto tiempo los guarda y cómo ejercer tus derechos.',
        },
        loadComponent: () => import('./club/privacidad').then((m) => m.Privacidad),
      },
      {
        path: 'preguntas-frecuentes',
        title: 'Preguntas frecuentes — FEDAL Tennis Center',
        data: {
          descripcion:
            'Las dudas sobre reservas, socios, clases y torneos en FEDAL Tennis Center, Temuco. ' +
            'Si la tuya no está, escríbenos desde la misma página y te respondemos.',
        },
        loadComponent: () =>
          import('./club/preguntas-frecuentes').then((m) => m.PreguntasFrecuentesPublicas),
      },
      {
        // Corta a propósito: es lo que se codifica en el QR, y cada carácter de
        // más es un módulo más de dibujo para leer en el mesón.
        path: 'r/:token',
        title: 'Reserva — FEDAL Tennis Center',
        data: { indexar: false },
        loadComponent: () =>
          import('./reservas/reserva-publica').then((m) => m.ReservaPublicaPagina),
      },
    ],
  },
  {
    path: '',
    // El panel y entrar se bajan con su ruta: el arranque trae solo el sitio público (I6).
    loadComponent: () => import('./cascarones/cascaron-auth').then((m) => m.CascaronAuth),
    // T353 (A4): entrar, crear cuenta y los enlaces de los correos, fuera de los buscadores.
    data: { indexar: false },
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
    // T353 (A4): el panel entero, y una pantalla nueva también, fuera de los buscadores.
    data: { indexar: false },
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
        // T296 (SPEC-panel.md D2): las cuentas del club en una tabla, con su filtro en la URL.
        // Reemplaza a Socios, Usuarios y Profesores, que redirigen acá con su filtro.
        path: 'administracion/personas',
        title: 'Personas — Administración',
        loadComponent: () =>
          import('./identidad/admin/personas/personas').then((m) => m.PersonasPanel),
      },
      {
        // T298 (SPEC-panel.md D2): la ficha de una cuenta, con Datos · Tipos · Cuota.
        path: 'administracion/personas/:id',
        title: 'Personas · Ficha — Administración',
        loadComponent: () =>
          import('./identidad/admin/personas/ficha-persona').then((m) => m.FichaPersona),
      },
      {
        path: 'administracion/usuarios',
        pathMatch: 'full',
        redirectTo: '/administracion/personas',
      },
      {
        path: 'administracion/socios',
        pathMatch: 'full',
        redirectTo: '/administracion/personas?tipo=socios',
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
        // T294 (SPEC-panel.md D7): agendar una clase o una serie, en su página. La abre el FAB
        // de Clases con el día en `?fecha=`. El profesor entra igual: su línea en el mapa de
        // permisos vale para todo lo que cuelga de /administracion/clases.
        path: 'administracion/clases/agendar',
        title: 'Clases · Agendar — Administración',
        loadComponent: () =>
          import('./clases/admin/agendar-clase').then((m) => m.AgendarClase),
      },
      {
        // Los profesores son un filtro de Personas desde T296: la ficha de cada uno es la de su
        // cuenta (D12).
        path: 'administracion/profesores',
        pathMatch: 'full',
        redirectTo: '/administracion/personas?tipo=profesores',
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
