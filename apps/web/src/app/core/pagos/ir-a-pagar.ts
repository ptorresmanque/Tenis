/** Lo que la API devuelve al iniciar un cobro: a dónde ir y con qué llave. */
export interface RedireccionAPasarela {
  urlRedireccion: string;
  tokenPasarela: string;
}

/**
 * Manda el navegador a la pasarela.
 *
 * **Con un POST y no con `location.href`.** Webpay abre el formulario de pago solo si
 * la URL que devolvió al crear la transacción se visita por `POST` llevando `token_ws`;
 * un `GET` a esa misma URL deja al comprador mirando una página en blanco, con la hora
 * ya tomada y sin forma de pagarla. Está en la documentación de Webpay Plus § "Ir a
 * pagar", y es el único formato que Transbank acepta.
 *
 * El formulario se arma y se envía en el momento: no hay nada que mostrar entre medio
 * —quien apretó "Ir a pagar" ya decidió— y un botón intermedio solo agrega un clic.
 */
export function irAPagar(pago: RedireccionAPasarela): void {
  const formulario = document.createElement('form');
  formulario.method = 'POST';
  formulario.action = pago.urlRedireccion;

  const token = document.createElement('input');
  token.type = 'hidden';
  token.name = 'token_ws';
  token.value = pago.tokenPasarela;

  formulario.append(token);
  // Tiene que estar en el documento: un formulario suelto no se envía.
  document.body.append(formulario);
  formulario.submit();
}
