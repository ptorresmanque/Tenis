import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Route, Routes } from '@angular/router';
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
  /** El cascarón, venga en la ruta (`component`) o se cargue con ella (`loadComponent`). */
  cascaron: () => Promise<unknown>;
}

function buscar(url: string): Encontrada | null {
  const recorrer = (
    rutas: Routes,
    prefijo: string,
    heredados: unknown[],
    cascaron: () => Promise<unknown>,
  ): Encontrada | null => {
    for (const ruta of rutas) {
      const camino = [prefijo, ruta.path].filter(Boolean).join('/');
      const guards = [...heredados, ...(ruta.canActivate ?? [])];
      // Los cascarones son las rutas de primer nivel con hijos; más adentro, un
      // `loadComponent` con hijos es una página con pestañas (Configuración).
      const esCascaron = rutas === routes && ruta.children !== undefined;
      const suCascaron = ruta.component
        ? async () => ruta.component
        : esCascaron && ruta.loadComponent
          ? async () => ruta.loadComponent?.()
          : cascaron;

      if (camino === url && (ruta.loadComponent ?? ruta.redirectTo)) {
        return { ruta, guards, cascaron: suCascaron };
      }

      // `canActivateChild` del padre corre para cada hijo (T220: así va el del panel).
      const dentro =
        ruta.children &&
        recorrer(
          ruta.children,
          camino,
          [...guards, ...(ruta.canActivateChild ?? [])],
          suCascaron,
        );
      if (dentro) return dentro;
    }

    return null;
  };

  return recorrer(routes, '', [], async () => null);
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

describe('Cada ruta en su cascarón', () => {
  it.each([
    ['', CascaronPublico],
    ['disponibilidad', CascaronPublico],
    ['mis-reservas', CascaronPublico],
    ['mi-cuenta', CascaronPublico],
    ['reservas/confirmacion', CascaronPublico],
    ['el-club', CascaronPublico],
    ['privacidad', CascaronPublico],
    ['preguntas-frecuentes', CascaronPublico],
    ['tours', CascaronPublico],
    ['tours/:id', CascaronPublico],
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
