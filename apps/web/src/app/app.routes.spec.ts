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
    'administracion/reservas',
    'administracion/socios',
    'administracion/reportes',
    'administracion/cuotas',
    'administracion/morosos',
    'administracion/solicitudes',
    'administracion/configuracion/reglas',
    'administracion/configuracion/datos',
    'administracion/configuracion/textos',
    'administracion/configuracion/tienda',
    'administracion/configuracion/cafeteria',
    'administracion/configuracion/gimnasio',
    'administracion/configuracion/preguntas-frecuentes',
    'administracion/usuarios',
    'administracion/tours',
    'administracion/tours/:id',
    'estado',
  ])('%s pasa por el guard del panel', (url) => {
    expect(buscar(url)?.guards).toContain(conPanel);
  });

  it('**la ruta vieja de la tienda y la cafetería lleva a la tienda** (T236, G6)', () => {
    expect(buscar('administracion/configuracion/tienda-y-cafeteria')?.ruta.redirectTo).toBe(
      'tienda',
    );
  });

  it.each([
    ['tienda', 'TIENDA'],
    ['cafeteria', 'CAFETERIA'],
    ['gimnasio', 'GIMNASIO'],
  ])('la pestaña %s le dice al panel qué lugar es (T236)', (ruta, lugar) => {
    expect(buscar(`administracion/configuracion/${ruta}`)?.ruta.data).toEqual({ lugar });
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
