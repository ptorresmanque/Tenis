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
