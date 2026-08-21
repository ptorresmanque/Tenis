import { describe, expect, it } from 'vitest';

import { routes } from './app.routes';
import { soloAdmin } from './core/auth/solo-admin.guard';
import { soloVisitantes } from './core/auth/solo-visitantes.guard';

/**
 * T27. Los guards tienen su propio test; esto prueba que están **puestos**.
 *
 * La regresión que este archivo ataja no es que un guard decida mal, sino que
 * alguien agregue una ruta y olvide el `canActivate`. Escondiendo el enlace, la
 * pantalla sigue abierta para quien escriba la URL y nada falla hasta que pasa.
 */
describe('Rutas protegidas', () => {
  const guardsDe = (ruta: string) =>
    routes.find((r) => r.path === ruta)?.canActivate ?? [];

  it.each([
    'administracion/canchas',
    'administracion/reservas',
    'administracion/socios',
    'estado',
  ])(
    '%s es solo del admin',
    (ruta) => {
      expect(guardsDe(ruta)).toContain(soloAdmin);
    },
  );

  it('registro es solo para quien no tiene sesión', () => {
    expect(guardsDe('registro')).toContain(soloVisitantes);
  });
});
