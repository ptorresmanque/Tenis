import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { Auth } from './auth';

/**
 * Evita mostrar una pantalla de administración a quien no va a poder usarla.
 *
 * **Es comodidad, no control.** Quien llame la API a mano se topa igual con el
 * `@SoloAdmin()` del servidor, que es lo que de verdad protege los datos. Este
 * guard existe para no llevar a un socio a una pantalla llena de errores 403.
 *
 * Su primer consumidor real es el panel de canchas de T13.
 */
export const soloAdmin: CanActivateFn = async () => {
  const auth = inject(Auth);
  const router = inject(Router);

  // La sesión puede no estar resuelta todavía si alguien entra directo por URL.
  if (auth.usuario() === null) {
    await auth.refrescar();
  }

  if (auth.esAdmin()) {
    return true;
  }

  // Quien ya entró y no es admin no tiene nada que hacer en la pantalla de
  // ingreso: vuelve al inicio. A quien no entró se le pide la sesión.
  return router.createUrlTree([auth.usuario() ? '/' : '/entrar']);
};
