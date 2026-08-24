import { Route, Routes } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { routes } from './app.routes';
import { CascaronAdmin } from './cascarones/cascaron-admin';
import { CascaronAuth } from './cascarones/cascaron-auth';
import { CascaronPublico } from './cascarones/cascaron-publico';
import { soloAdmin } from './core/auth/solo-admin.guard';
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
  cascaron: unknown;
}

function buscar(url: string): Encontrada | null {
  const recorrer = (
    rutas: Routes,
    prefijo: string,
    heredados: unknown[],
    cascaron: unknown,
  ): Encontrada | null => {
    for (const ruta of rutas) {
      const camino = [prefijo, ruta.path].filter(Boolean).join('/');
      const guards = [...heredados, ...(ruta.canActivate ?? [])];
      const suCascaron = ruta.component ?? cascaron;

      if (camino === url && (ruta.loadComponent ?? ruta.redirectTo)) {
        return { ruta, guards, cascaron: suCascaron };
      }

      const dentro =
        ruta.children && recorrer(ruta.children, camino, guards, suCascaron);
      if (dentro) return dentro;
    }

    return null;
  };

  return recorrer(routes, '', [], null);
}

describe('Rutas protegidas', () => {
  it.each([
    'administracion/canchas',
    'administracion/reservas',
    'administracion/socios',
    'administracion/reportes',
    'administracion/cuotas',
    'administracion/solicitudes',
    'administracion/configuracion/reglas',
    'administracion/configuracion/datos',
    'administracion/configuracion/administradores',
    'estado',
  ])('%s es solo del admin', (url) => {
    expect(buscar(url)?.guards).toContain(soloAdmin);
  });

  it('registro es solo para quien no tiene sesión', () => {
    expect(buscar('registro')?.guards).toContain(soloVisitantes);
  });

  it('la disponibilidad no está protegida: el visitante sin cuenta es el caso normal', () => {
    // Sin esto, la prueba de arriba pasaría igual con todo el sitio cerrado.
    expect(buscar('disponibilidad')?.guards).toEqual([]);
  });
});

describe('Cada ruta en su cascarón', () => {
  it.each([
    ['', CascaronPublico],
    ['disponibilidad', CascaronPublico],
    ['mis-reservas', CascaronPublico],
    ['reservas/confirmacion', CascaronPublico],
    ['el-club', CascaronPublico],
    ['entrar', CascaronAuth],
    ['registro', CascaronAuth],
    ['administracion/reservas', CascaronAdmin],
    ['administracion/canchas', CascaronAdmin],
    ['administracion/socios', CascaronAdmin],
    ['administracion/reportes', CascaronAdmin],
    ['administracion/cuotas', CascaronAdmin],
    ['administracion/solicitudes', CascaronAdmin],
    ['administracion/configuracion/reglas', CascaronAdmin],
    ['administracion/configuracion/datos', CascaronAdmin],
    ['administracion/configuracion/administradores', CascaronAdmin],
    ['estado', CascaronAdmin],
  ])('/%s se dibuja dentro del cascarón que le toca', (url, cascaron) => {
    expect(buscar(url)?.cascaron).toBe(cascaron);
  });
});
