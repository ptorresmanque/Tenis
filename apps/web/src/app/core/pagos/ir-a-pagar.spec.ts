import { beforeEach, describe, expect, it, vi } from 'vitest';

import { irAPagar } from './ir-a-pagar';

/**
 * La salida a la pasarela.
 *
 * Se prueba el **formato** de la redirección y no que navegue: con un `GET` a la URL
 * de Webpay el comprador queda mirando una página en blanco con la hora ya tomada, y
 * ese es justo el bug que este archivo arregla. Si alguien vuelve a `location.href`,
 * acá se nota.
 */
describe('irAPagar', () => {
  beforeEach(() => {
    // jsdom no navega: `submit()` no está implementado.
    HTMLFormElement.prototype.submit = vi.fn();
    document.body.innerHTML = '';
  });

  it('sale por POST con el token en `token_ws`', () => {
    irAPagar({
      urlRedireccion: 'https://webpay3gint.transbank.cl/webpayserver/initTransaction',
      tokenPasarela: 'e1a2b3',
    });

    const formulario = document.body.querySelector('form')!;

    expect(formulario.method).toBe('post');
    expect(formulario.action).toBe(
      'https://webpay3gint.transbank.cl/webpayserver/initTransaction',
    );
    expect(
      formulario.querySelector<HTMLInputElement>('input[name="token_ws"]')!.value,
    ).toBe('e1a2b3');
    expect(formulario.submit).toHaveBeenCalled();
  });
});
