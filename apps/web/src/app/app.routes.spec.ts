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
    'administracion/morosos',
    'administracion/solicitudes',
    'administracion/configuracion/reglas',
    'administracion/configuracion/datos',
    'administracion/configuracion/administradores',
    'estado',
  ])('%s es solo del admin', (url) => {
    expect(buscar(url)?.guards).toContain(soloAdmin);
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
    ['administracion/configuracion/administradores', CascaronAdmin],
    ['estado', CascaronAdmin],
  ])('/%s se dibuja dentro del cascarón que le toca', (url, cascaron) => {
    expect(buscar(url)?.cascaron).toBe(cascaron);
  });
});
