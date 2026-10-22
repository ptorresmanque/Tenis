import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';

import { Auth } from './auth';
import { inicioDelPanel, puedeVer } from './tipos-del-panel';

/**
 * Lleva a cada uno a lo suyo del panel (T220): el admin entra a todo, el gestor a la
 * agenda del día y el profesor a Clases. Quien pide una pantalla que no le toca vuelve a
 * su portada; quien no tiene panel, al inicio del sitio.
 *
 * Va como `canActivateChild` del cascarón: corre en cada pantalla del panel, no solo al
 * entrar, porque pasar de la agenda a Canchas no vuelve a activar al padre.
 *
 * **Es comodidad, no control.** Quien llame la API a mano se topa igual con los guards
 * del servidor, que son los que protegen los datos. Este existe para no llevar a nadie
 * a una pantalla llena de errores 403.
 */
export const conPanel: CanActivateChildFn = async (_ruta, estado) => {
  const auth = inject(Auth);
  const router = inject(Router);

  // La sesión puede no estar resuelta todavía si alguien entra directo por URL.
  if (auth.usuario() === null) {
    await auth.refrescar();
  }

  const usuario = auth.usuario();

  if (puedeVer(estado.url, usuario)) {
    return true;
  }

  // Quien ya entró no tiene nada que hacer en la pantalla de ingreso: vuelve a su
  // portada del panel, o al inicio si no tiene. A quien no entró se le pide la sesión,
  // y después de entrar vuelve a la pantalla que pidió.
  if (!usuario) {
    return router.createUrlTree(['/entrar'], { queryParams: { volver: estado.url } });
  }

  return router.createUrlTree([inicioDelPanel(usuario) ?? '/']);
};
