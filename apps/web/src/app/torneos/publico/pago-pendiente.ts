import { DestroyRef, inject } from '@angular/core';

import { Torneos } from '../torneos.service';

/**
 * La marca de "esta pestaña se fue a pagar y todavía no volvió con el pago hecho".
 *
 * **Existe porque apretar "atrás" en el navegador no le avisa a nadie.** La pasarela no
 * sabe que pasó y el servidor tampoco: no hay callback, no hay `token_ws`, no hay nada.
 * Lo único que sí ocurre es que la persona **vuelve a estar en nuestra página**, y esta
 * marca es cómo la página se entera de que viene de un pago sin terminar.
 *
 * En `sessionStorage` y no en una señal: la ida a Webpay es una navegación de verdad
 * —un `POST` fuera del sitio—, así que el estado del componente no sobrevive. Y en
 * `sessionStorage` y no en `localStorage` porque es de **esta pestaña y esta visita**:
 * la marca de una pestaña no tiene por qué soltarle el cupo a otra.
 *
 * Guarda la llave de la inscripción, que es lo único con que quien no tiene cuenta
 * puede pedir que suelten su propio cupo.
 */
const LLAVE = 'torneo-pago-pendiente';

export function recordarPagoPendiente(token: string): void {
  sessionStorage.setItem(LLAVE, token);
}

/**
 * Devuelve la llave y la olvida en el mismo paso.
 *
 * Las dos cosas juntas a propósito: si se leyera sin borrar, un `pageshow` seguido del
 * arranque del componente pediría soltar dos veces la misma inscripción.
 */
export function olvidarPagoPendiente(): string | null {
  const token = sessionStorage.getItem(LLAVE);
  sessionStorage.removeItem(LLAVE);

  return token;
}

/**
 * Lo que se le dice a quien vuelve de la pasarela.
 *
 * **Los dos finales importan por igual**: que el pago entró hay que decirlo, y que no
 * entró, más — esa persona tiene que enterarse de que **no quedó inscrita**, porque su
 * lugar se soltó y el cuadro sigue abierto para otro.
 */
export const AVISOS_DEL_PAGO: Record<string, { variante: 'exito' | 'error'; texto: string }> = {
  listo: {
    variante: 'exito',
    texto: 'Pago recibido: tu inscripción quedó confirmada. Nos vemos en la cancha.',
  },
  rechazado: {
    variante: 'error',
    texto:
      'El pago fue rechazado, así que tu inscripción no quedó tomada. Puedes ' +
      'inscribirte de nuevo con otro medio de pago.',
  },
  anulado: {
    variante: 'error',
    texto:
      'No terminaste el pago, así que tu inscripción no quedó tomada y tu cupo ' +
      'volvió a estar disponible. Puedes inscribirte de nuevo.',
  },
};

/**
 * Si esta pestaña vuelve de un pago sin terminar, le pide al servidor que suelte ese cupo, y
 * llama a `alSoltar` si lo soltó. Va en el constructor de la página a la que se vuelve.
 *
 * **Al arrancar y en cada `pageshow`.** Volver atrás puede restaurar la página desde el caché del
 * navegador sin construir el componente de nuevo, y ese es justo el caso que esto atiende.
 *
 * No mira `?pago=` para decidir: si la persona pagó, su inscripción ya no está pendiente y el
 * servidor no suelta nada (`soltada: false`), así que la llamada es inofensiva.
 */
export function soltarSiVolvioSinPagar(alSoltar: () => void): void {
  const api = inject(Torneos);
  const soltar = async () => {
    const token = olvidarPagoPendiente();
    if (!token) return;

    const { soltada } = await api.soltarInscripcion(token);
    if (soltada) alSoltar();
  };

  void soltar();
  const alVolver = () => void soltar();
  window.addEventListener('pageshow', alVolver);
  inject(DestroyRef).onDestroy(() => window.removeEventListener('pageshow', alVolver));
}
