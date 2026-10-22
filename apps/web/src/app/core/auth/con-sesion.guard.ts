import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { Auth } from './auth';

/**
 * Pantallas del sitio que son de quien entró, como Mi cuenta: sin sesión, a la de ingreso.
 *
 * `conPanel` no sirve acá: además de la sesión pide un tipo del panel, y a un socio lo
 * devolvería al inicio. Igual que ese, **es comodidad, no control**: los datos los protege la
 * API. Este existe para no mostrar un error de carga con el 401 a quien no entró.
 */
export const conSesion: CanActivateFn = async () => {
  const auth = inject(Auth);
  const router = inject(Router);

  // Igual que en `conPanel`: entrar directo por URL puede llegar antes de que la
  // primera consulta de sesión se haya resuelto.
  if (auth.usuario() === null) {
    await auth.refrescar();
  }

  return auth.usuario() === null ? router.createUrlTree(['/entrar']) : true;
};
