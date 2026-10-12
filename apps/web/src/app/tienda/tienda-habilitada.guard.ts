import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import type { DatosDelClub } from '../club/club.service';

/**
 * Con la tienda apagada en este ambiente, su panel lleva al inicio del panel (T157), y la
 * tienda del sitio, a la portada (T162).
 *
 * **Es comodidad, no control**, como `soloAdmin`: la API igual responde 404 a toda ruta
 * de la tienda (T156). Existe para que quien escriba la URL no caiga en una pantalla llena
 * de errores.
 *
 * Pregunta a `/api/club` y no lee el recurso compartido del sitio: ese recurso se pide una
 * vez por visita y, si todavía no volvió, dice "apagada" por omisión. Si no hay respuesta,
 * tampoco deja pasar: sin saber, no se ofrece.
 */
export const tiendaHabilitada: CanActivateFn = async (_ruta, estado) => {
  const router = inject(Router);
  const http = inject(HttpClient);

  try {
    const club = await firstValueFrom(
      http.get<Pick<DatosDelClub, 'tiendaHabilitada'>>('/api/club'),
    );

    if (club.tiendaHabilitada) return true;
  } catch {
    // Sin respuesta, como apagada: la redirección de abajo.
  }

  return router.createUrlTree([
    estado.url.startsWith('/administracion') ? '/administracion/reservas' : '/',
  ]);
};
