import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { Auth } from './auth';

/**
 * El reverso de `soloAdmin`: pantallas que solo tienen sentido sin sesión.
 *
 * Esconder el enlace de "Crear cuenta" no cierra la pantalla —la URL sigue viva y el
 * autocompletado del navegador la ofrece sola—, y el formulario terminaría en un
 * "ese correo ya está en uso" sobre la cuenta con la que la persona ya entró.
 */
export const soloVisitantes: CanActivateFn = async () => {
  const auth = inject(Auth);
  const router = inject(Router);

  // Igual que en `soloAdmin`: entrar directo por URL puede llegar antes de que la
  // primera consulta de sesión se haya resuelto.
  if (auth.usuario() === null) {
    await auth.refrescar();
  }

  return auth.usuario() === null ? true : router.createUrlTree(['/']);
};
