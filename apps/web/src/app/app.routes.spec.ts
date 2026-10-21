import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  convertToParamMap,
  Params,
  provideRouter,
  Route,
  Data,
  RouterStateSnapshot,
  Routes,
} from '@angular/router';
import { describe, expect, it } from 'vitest';

import { routes } from './app.routes';
import { CascaronAdmin, SECCIONES_DEL_PANEL } from './cascarones/cascaron-admin';
import { CascaronAuth } from './cascarones/cascaron-auth';
import { CascaronPublico } from './cascarones/cascaron-publico';
import { conPanel } from './core/auth/con-panel.guard';
import { soloVisitantes } from './core/auth/solo-visitantes.guard';

/**
 * T27. Los guards tienen su propio test; esto prueba que están **puestos**.
 *
 * La regresión que este archivo ataja no es que un guard decida mal, sino que
 * alguien agregue una ruta y olvide el `canActivate`. Escondiendo el enlace, la
 * pantalla sigue abierta para quien escriba la URL y nada falla hasta que pasa.
 *
 * Desde la fase 2 las rutas están anidadas bajo su cascarón, así que la
 * protección puede venir heredada del padre. El recorrido de abajo la busca en
 * toda la cadena: lo que importa es que la URL quede cerrada, no en qué nivel.
 */

interface Encontrada {
  ruta: Route;
  guards: unknown[];
  /** El `data` de cada ruta de la cadena, del cascarón a la página (T353). */
  datos: (Data | undefined)[];
  /** El cascarón, venga en la ruta (`component`) o se cargue con ella (`loadComponent`). */
  cascaron: () => Promise<unknown>;
}

function buscar(url: string): Encontrada | null {
  const recorrer = (
    rutas: Routes,
    prefijo: string,
    heredados: unknown[],
    datosHeredados: (Data | undefined)[],
    cascaron: () => Promise<unknown>,
  ): Encontrada | null => {
    for (const ruta of rutas) {
      const camino = [prefijo, ruta.path].filter(Boolean).join('/');
      const guards = [...heredados, ...(ruta.canActivate ?? [])];
      const datos = [...datosHeredados, ruta.data];
      // Los cascarones son las rutas de primer nivel con hijos; más adentro, un
      // `loadComponent` con hijos es una página con pestañas (Configuración).
      const esCascaron = rutas === routes && ruta.children !== undefined;
      const suCascaron = ruta.component
        ? async () => ruta.component
        : esCascaron && ruta.loadComponent
          ? async () => ruta.loadComponent?.()
          : cascaron;

      if (camino === url && (ruta.loadComponent ?? ruta.redirectTo)) {
        return { ruta, guards, datos, cascaron: suCascaron };
      }

      // `canActivateChild` del padre corre para cada hijo (T220: así va el del panel).
      const dentro =
        ruta.children &&
        recorrer(
          ruta.children,
          camino,
          [...guards, ...(ruta.canActivateChild ?? [])],
          datos,
          suCascaron,
        );
      if (dentro) return dentro;
    }

    return null;
  };

  return recorrer(routes, '', [], [], async () => null);
}

describe('Rutas protegidas', () => {
  it.each([
    'administracion/canchas',
    'administracion/canchas/horario',
    'administracion/canchas/tarifas',
    'administracion/reservas',
    'administracion/reservas/ocupacion',
    'administracion/finanzas/ingreso',
    'administracion/finanzas/padron',
    'administracion/finanzas/cuotas',
    'administracion/finanzas/morosos',
    'administracion/no-uso/por-revisar',
    'administracion/no-uso/periodo',
    'administracion/clases/agendar',
    'administracion/personas',
    'administracion/personas/:id',
    'administracion/socios',
    'administracion/reportes',
    'administracion/cuotas',
    'administracion/morosos',
    'administracion/solicitudes',
    'administracion/configuracion/reglas',
    'administracion/configuracion/el-club',
    'administracion/configuracion/servicios',
    'administracion/configuracion/categorias-juego',
    'administracion/configuracion/informe-diario',
    'administracion/usuarios',
    'administracion/tours',
    'administracion/tours/:id',
    'estado',
  ])('%s pasa por el guard del panel', (url) => {
    expect(buscar(url)?.guards).toContain(conPanel);
  });

  it('**la ocupación vive en la agenda: su ruta vieja redirige** (T285, A1)', () => {
    expect(buscar('administracion/ocupacion')?.ruta.redirectTo).toBe(
      '/administracion/reservas/ocupacion',
    );
    expect(buscar('administracion/reservas/ocupacion')?.ruta.title).toBe(
      'Agenda del día · Ocupación — Administración',
    );
  });

  it.each([
    ['ingreso', 'ingreso', 'Ingreso'],
    ['padron', 'padron', 'Padrón y morosidad'],
    ['cuotas', 'cuotas', 'Cuotas'],
    ['morosos', 'morosos', 'Socios con deuda'],
  ])(
    '**/administracion/%s es la pestaña «%s» de Finanzas** (T286, A1)',
    (vieja, pestana, etiqueta) => {
      expect(buscar(`administracion/${vieja}`)?.ruta.redirectTo).toBe(
        `/administracion/finanzas/${pestana}`,
      );
      expect(buscar(`administracion/finanzas/${pestana}`)?.ruta.title).toBe(
        `Finanzas · ${etiqueta} — Administración`,
      );
    },
  );

  it('**Horas reportadas es la pestaña «Por revisar» de Horas no usadas** (T287, A1)', () => {
    expect(buscar('administracion/reportes')?.ruta.redirectTo).toBe(
      '/administracion/no-uso/por-revisar',
    );
    expect(buscar('administracion/no-uso/por-revisar')?.ruta.title).toBe(
      'Horas no usadas · Por revisar — Administración',
    );
    expect(buscar('administracion/no-uso/periodo')?.ruta.title).toBe(
      'Horas no usadas · Período — Administración',
    );
  });

  it.each([
    ['socios', '/administracion/personas?tipo=socios'],
    ['usuarios', '/administracion/personas'],
    ['profesores', '/administracion/personas?tipo=profesores'],
  ])('**/administracion/%s es Personas, con su filtro** (T296, A1)', (vieja, nueva) => {
    expect(buscar(`administracion/${vieja}`)?.ruta.redirectTo).toBe(nueva);
  });

  it('**agendar una clase es su página, dentro de Clases** (T294)', () => {
    expect(buscar('administracion/clases/agendar')?.ruta.title).toBe(
      'Clases · Agendar — Administración',
    );
  });

  it.each([
    ['horario', 'Horario'],
    ['tarifas', 'Tarifas'],
  ])(
    '**la pestaña %s de Canchas le dice a la pantalla qué parte del club es** (T288)',
    (parte, etiqueta) => {
      const { ruta } = buscar(`administracion/canchas/${parte}`)!;

      expect(ruta.data).toEqual({ parte });
      expect(ruta.title).toBe(`Canchas · ${etiqueta} — Administración`);
    },
  );

  it.each([
    ['datos', 'el-club'],
    ['textos', 'el-club'],
    ['preguntas-frecuentes', 'el-club'],
    ['tienda', 'servicios'],
    ['cafeteria', 'servicios'],
    ['gimnasio', 'servicios'],
    // La de antes de T236, que ya llevaba a la tienda.
    ['tienda-y-cafeteria', 'servicios'],
  ])(
    '**la pestaña vieja «%s» de Configuración lleva a «%s»** (T290, A1)',
    (vieja, nueva) => {
      expect(buscar(`administracion/configuracion/${vieja}`)?.ruta.redirectTo).toBe(nueva);
    },
  );

  it.each([
    ['reglas', 'Reglas y cuotas'],
    ['el-club', 'El club'],
    ['servicios', 'Servicios'],
    ['categorias-juego', 'Categorías de juego'],
    ['informe-diario', 'Informe diario'],
  ])('la pestaña %s de Configuración se titula «%s»', (ruta, etiqueta) => {
    expect(buscar(`administracion/configuracion/${ruta}`)?.ruta.title).toBe(
      `Configuración · ${etiqueta} — Administración`,
    );
  });

  it('Configuración ya no tiene Administradores: los tipos se dan en Usuarios (T223)', () => {
    expect(buscar('administracion/configuracion/administradores')).toBeNull();
  });

  it('recuperar-contrasena se abre con sesión: el enlace del correo puede abrirse en cualquier navegador', () => {
    expect(buscar('recuperar-contrasena')?.guards).toEqual([]);
    expect(buscar('nueva-contrasena')?.guards).toEqual([]);
  });

  it('registro es solo para quien no tiene sesión', () => {
    expect(buscar('registro')?.guards).toContain(soloVisitantes);
  });

  it('verificar-correo se abre con sesión: ahí llega el enlace del correo', () => {
    // Entrar no exige el correo verificado, así que quien abre el enlace puede
    // tener la sesión iniciada. Con `soloVisitantes`, volvería al inicio sin ver
    // el resultado.
    expect(buscar('verificar-correo')?.guards).toEqual([]);
  });

  it('la disponibilidad no está protegida: el visitante sin cuenta es el caso normal', () => {
    // Sin esto, la prueba de arriba pasaría igual con todo el sitio cerrado.
    expect(buscar('disponibilidad')?.guards).toEqual([]);
  });

  it.each([
    ['reservas', 'Reservas'],
    ['partidos', 'Partidos'],
    ['cuota', 'Cuota'],
  ])('**/mi-cuenta/%s es la pestaña «%s» de Mi cuenta** (T318, A8)', (pestana, etiqueta) => {
    expect(buscar(`mi-cuenta/${pestana}`)?.ruta.title).toBe(
      `Mi cuenta · ${etiqueta} — FEDAL Tennis Center`,
    );
  });

  it.each([
    ['mis-reservas', '/mi-cuenta/reservas'],
    ['mis-partidos', '/mi-cuenta/partidos'],
  ])('**/%s redirige a su pestaña de Mi cuenta** (T318, A8)', (vieja, nueva) => {
    expect(buscar(vieja)?.ruta.redirectTo).toBe(nueva);
  });

  describe('/mi-cuenta sin pestaña (T318, A8)', () => {
    // La ruta vacía de adentro: la que elige la pestaña.
    const pestanaPorOmision = (consulta: Record<string, string>) => {
      const vacia = buscar('mi-cuenta')?.ruta.children?.find((hija) => hija.path === '');
      const redirigir = vacia?.redirectTo as (destino: { queryParams: Params }) => string;
      return redirigir({ queryParams: consulta });
    };

    it('abre en Reservas', () => {
      expect(pestanaPorOmision({})).toBe('reservas');
    });

    it('**la vuelta de Webpay, `/mi-cuenta?pago=…`, va a Cuota**: ahí está su aviso', () => {
      expect(pestanaPorOmision({ pago: 'listo' })).toBe('cuota');
    });
  });

  // P3 y P20 (SPEC-sitio.md, Decimoséptima parte): la pestaña dice lo que se hace ahí, y la
  // portada dice qué es el club y dónde, que es lo que se lee en el buscador.
  it('la grilla se titula «Reserva tu cancha», y la portada dice que es un club de Temuco', () => {
    expect(buscar('disponibilidad')?.ruta.title).toBe(
      'Reserva tu cancha de tenis en Temuco — FEDAL Tennis Center',
    );
    expect(routes[0].children?.find((ruta) => ruta.path === '')?.title).toBe(
      'FEDAL Tennis Center · Club de tenis en Temuco',
    );
  });

  it('el index.html trae el mismo título y una descripción para el buscador (P20)', () => {
    const index = readFileSync(join(process.cwd(), 'src/index.html'), 'utf8');

    expect(index).toContain('<title>FEDAL Tennis Center · Club de tenis en Temuco</title>');
    expect(index).toContain(
      '<meta name="description" content="Reserva tu cancha de tenis en Temuco en línea: canchas ' +
        'techadas y con luz, clases, torneos y ranking. Para socios y visitantes.">',
    );
  });

  it('**inscribirse en un torneo es su página, y no pide sesión** (T316, D4)', () => {
    expect(buscar('torneos/:id/inscripcion')?.guards).toEqual([]);
    expect(buscar('torneos/:id/inscripcion')?.ruta.title).toBe(
      'Inscripción — FEDAL Tennis Center',
    );
  });

  it('**la oferta de un cupo de la lista de espera es su página, y no pide sesión** (T334)', () => {
    expect(buscar('torneos/inscripcion/:token')?.guards).toEqual([]);
    expect(buscar('torneos/inscripcion/:token')?.ruta.title).toBe(
      'Tu cupo en la lista de espera — FEDAL Tennis Center',
    );
  });

  it('los tours se leen sin sesión (T195)', () => {
    expect(buscar('tours')?.guards).toEqual([]);
    expect(buscar('tours/:id')?.guards).toEqual([]);
  });

  it('las preguntas frecuentes se leen sin sesión (T146)', () => {
    expect(buscar('preguntas-frecuentes')?.guards).toEqual([]);
  });

  it('la política de privacidad se lee sin sesión: Google la abre para aprobar el login', () => {
    expect(buscar('privacidad')?.guards).toEqual([]);
  });
});

/**
 * T354 (SPEC-seo.md A2 y A3). Lo que se lee en el resultado de Google: el título nombra el deporte
 * y la ciudad, y cada página pública trae su descripción, distinta de las demás.
 */
describe('Los títulos y las descripciones de las rutas públicas (T354)', () => {
  const PUBLICAS: [string, string][] = [
    ['', 'FEDAL Tennis Center · Club de tenis en Temuco'],
    ['disponibilidad', 'Reserva tu cancha de tenis en Temuco — FEDAL Tennis Center'],
    ['clases', 'Clases de tenis en Temuco — FEDAL Tennis Center'],
    ['torneos', 'Torneos de tenis en Temuco — FEDAL Tennis Center'],
    ['tours', 'Tours de tenis en Temuco — FEDAL Tennis Center'],
    ['ranking', 'Ranking de torneos de tenis — FEDAL Tennis Center'],
    ['el-club', 'El club: canchas, tarifas y horario — FEDAL Tennis Center'],
    ['preguntas-frecuentes', 'Preguntas frecuentes — FEDAL Tennis Center'],
    ['privacidad', 'Política de privacidad — FEDAL Tennis Center'],
  ];
  const descripcion = (url: string): string => buscar(url)?.ruta.data?.['descripcion'] ?? '';

  it.each(PUBLICAS)('/%s se titula «%s»', (url, titulo) => {
    expect(buscar(url)?.ruta.title).toBe(titulo);
    // Lo que Google muestra antes de cortar con «…».
    expect(titulo.length).toBeLessThanOrEqual(60);
  });

  it.each(PUBLICAS.map(([url]) => url))(
    '/%s tiene su descripción, de 120 a 160 caracteres',
    (url) => {
      expect(descripcion(url).length).toBeGreaterThanOrEqual(120);
      expect(descripcion(url).length).toBeLessThanOrEqual(160);
    },
  );

  it('ninguna descripción se repite', () => {
    const todas = PUBLICAS.map(([url]) => descripcion(url));
    expect(new Set(todas).size).toBe(todas.length);
  });
});

/**
 * T355 (SPEC-seo.md A9). Una dirección que no existe dibuja «No encontrada» en vez de redirigir a la
 * portada: para Google, cientos de URL con la portada adentro eran páginas duplicadas.
 */
describe('Una dirección que no existe (T355, A9)', () => {
  it('**dibuja «No encontrada» dentro del cascarón público, sin redirigir**', async () => {
    const comodin = buscar('**');

    expect(comodin?.ruta.redirectTo).toBeUndefined();
    expect(comodin?.ruta.title).toBe('Página no encontrada — FEDAL Tennis Center');
    expect(await comodin?.cascaron()).toBe(CascaronPublico);
  });

  it('no se indexa', () => {
    expect(buscar('**')?.datos.some((datos) => datos?.['indexar'] === false)).toBe(true);
  });

  // El router prueba los grupos en orden: dentro del primero, el comodín se tragaría /entrar y el
  // panel antes de llegar a sus cascarones.
  it('**es la última ruta de primer nivel**', () => {
    expect(routes.at(-1)?.children?.map((hija) => hija.path)).toEqual(['**']);
    expect(routes.slice(0, -1).flatMap((ruta) => ruta.children ?? [])).not.toContainEqual(
      expect.objectContaining({ path: '**' }),
    );
  });
});

/**
 * T353 (SPEC-seo.md A4). Lo que no es para buscadores lleva `indexar: false` en algún punto de su
 * cadena: el servicio `Seo` le pone `noindex`. Va en el padre cuando todo lo de adentro es privado
 * (el panel, entrar, Mi cuenta), así una pantalla nueva nace fuera del índice.
 */
describe('Lo que no es para buscadores lleva noindex (T353, A4)', () => {
  const seIndexa = (url: string) =>
    !buscar(url)?.datos.some((datos) => datos?.['indexar'] === false);

  it.each([
    'entrar',
    'registro',
    'recuperar-contrasena',
    'nueva-contrasena',
    'verificar-correo',
    'mi-cuenta/reservas',
    'mi-cuenta/partidos',
    'mi-cuenta/cuota',
    'reservas/confirmacion',
    'r/:token',
    'torneos/:id/inscripcion',
    'torneos/inscripcion/:token',
    'administracion/reservas',
    'administracion/personas/:id',
    'administracion/configuracion/reglas',
    'estado',
  ])('/%s no se indexa', (url) => {
    expect(seIndexa(url)).toBe(false);
  });

  it.each([
    '',
    'disponibilidad',
    'clases',
    'torneos',
    'tours',
    'tours/:id',
    'ranking',
    'el-club',
    'preguntas-frecuentes',
    'privacidad',
  ])('/%s se indexa', (url) => {
    expect(buscar(url)).not.toBeNull();
    expect(seIndexa(url)).toBe(true);
  });
});

/**
 * T316 (SPEC-sitio.md A6). `/torneos?inscripcion=5` era el botón «Inscribirme» de la portada, y
 * puede seguir en un marcador o en un enlace compartido: lleva a la página de la inscripción. La vuelta de
 * Webpay, `/torneos?pago=…`, se queda en Torneos, donde está su aviso.
 */
describe('La dirección vieja de la inscripción (T316, A6)', () => {
  const entrarATorneos = (consulta: Record<string, string>) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const [guard] = (buscar('torneos')?.guards ?? []) as CanActivateFn[];

    return TestBed.runInInjectionContext(() =>
      guard?.(
        { queryParamMap: convertToParamMap(consulta) } as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot,
      ),
    );
  };

  it('**/torneos?inscripcion=5 lleva a /torneos/5/inscripcion**', () => {
    expect(String(entrarATorneos({ inscripcion: '5' }))).toBe('/torneos/5/inscripcion');
  });

  it('sin `?inscripcion=`, y al volver de Webpay, se queda en Torneos', () => {
    expect(entrarATorneos({})).toBe(true);
    expect(entrarATorneos({ pago: 'listo' })).toBe(true);
  });
});

describe('Cada ruta en su cascarón', () => {
  it.each([
    ['', CascaronPublico],
    ['disponibilidad', CascaronPublico],
    ['mis-reservas', CascaronPublico],
    ['mi-cuenta', CascaronPublico],
    ['mi-cuenta/reservas', CascaronPublico],
    ['mi-cuenta/partidos', CascaronPublico],
    ['mi-cuenta/cuota', CascaronPublico],
    ['reservas/confirmacion', CascaronPublico],
    ['el-club', CascaronPublico],
    ['privacidad', CascaronPublico],
    ['preguntas-frecuentes', CascaronPublico],
    ['tours', CascaronPublico],
    ['tours/:id', CascaronPublico],
    ['torneos/:id/inscripcion', CascaronPublico],
    ['torneos/inscripcion/:token', CascaronPublico],
    ['entrar', CascaronAuth],
    ['registro', CascaronAuth],
    ['verificar-correo', CascaronAuth],
    ['recuperar-contrasena', CascaronAuth],
    ['nueva-contrasena', CascaronAuth],
    ['administracion/reservas', CascaronAdmin],
    ['administracion/canchas', CascaronAdmin],
    ['administracion/socios', CascaronAdmin],
    ['administracion/reportes', CascaronAdmin],
    ['administracion/cuotas', CascaronAdmin],
    ['administracion/morosos', CascaronAdmin],
    ['administracion/solicitudes', CascaronAdmin],
    ['administracion/configuracion/reglas', CascaronAdmin],
    ['administracion/configuracion/datos', CascaronAdmin],
    ['administracion/configuracion/textos', CascaronAdmin],
    ['administracion/configuracion/gimnasio', CascaronAdmin],
    ['administracion/configuracion/preguntas-frecuentes', CascaronAdmin],
    ['administracion/usuarios', CascaronAdmin],
    ['administracion/tours', CascaronAdmin],
    ['administracion/tours/:id', CascaronAdmin],
    ['estado', CascaronAdmin],
  ])('/%s se dibuja dentro del cascarón que le toca', async (url, cascaron) => {
    expect(await buscar(url)?.cascaron()).toBe(cascaron);
  });
});

describe('El arranque solo trae el sitio público (I6)', () => {
  // Quien visita la portada no necesita el panel ni la pantalla de entrar: sus cascarones,
  // con lo que importan, se bajan con su ruta. Con `MatButton` en el cascarón público
  // (T241), el arranque pasó los 500 kB del aviso.
  const padreDe = (hijo: string) => routes.find((r) => r.children?.some((h) => h.path === hijo));

  it.each(['entrar', 'administracion/reservas'])('el cascarón de /%s baja con su ruta', (url) => {
    expect(padreDe(url)?.component).toBeUndefined();
    expect(padreDe(url)?.loadComponent).toBeDefined();
  });

  it('el público sí viene en el arranque: es lo primero que se ve', () => {
    expect(padreDe('disponibilidad')?.component).toBe(CascaronPublico);
  });
});

/**
 * T277. El nombre del menú lateral es el de la pantalla, en su título y en la pestaña del
 * navegador (SPEC-revision-qa.md, A7): «Agenda del día» en el menú y «Reservas del día» en
 * la pantalla confundían. El título se lee del archivo de la pantalla, el que importa su
 * ruta, como lee las plantillas design-tokens.spec.ts.
 */
describe('El panel se titula como su menú (T277)', () => {
  const fuente = readFileSync(join(process.cwd(), 'src/app/app.routes.ts'), 'utf8');

  /** El archivo de la pantalla de una ruta: el del `import` que la carga. */
  const archivoDe = (url: string): string => {
    const encontrado = fuente.match(new RegExp(`path: '${url}'[\\s\\S]*?import\\('\\./([^']+)'\\)`));
    if (!encontrado) throw new Error(`No encontré la pantalla de ${url}`);
    return join(process.cwd(), 'src/app', `${encontrado[1]}.ts`);
  };

  for (const { ruta, etiqueta } of SECCIONES_DEL_PANEL) {
    it(`«${etiqueta}»: la pantalla y la pestaña se llaman como el ítem`, () => {
      const url = ruta.replace(/^\//, '');
      const titulo = readFileSync(archivoDe(url), 'utf8')
        .match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]
        .replace(/\s+/g, ' ')
        .trim();

      expect(titulo).toBe(etiqueta);
      expect(buscar(url)?.ruta.title).toBe(`${etiqueta} — Administración`);
    });
  }
});
