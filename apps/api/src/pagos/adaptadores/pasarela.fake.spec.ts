import { PasarelaFake } from './pasarela.fake';

/**
 * T16. El doble de `PasarelaPago`.
 *
 * Existe para que `reservas` se construya y se pruebe sin Transbank: el ambiente de
 * integración es lento, está fuera de nuestro control y no sabe rechazar a pedido.
 * Los cuatro escenarios que tiene que saber montar son los que producen los bugs
 * caros — rechazo, monto distinto y callback repetido.
 */
describe('PasarelaFake', () => {
  let pasarela: PasarelaFake;

  const orden = {
    referencia: 'ref-1',
    montoClp: 12000,
    urlRetorno: 'https://club.local/pagos/retorno',
  };

  beforeEach(() => {
    pasarela = new PasarelaFake();
  });

  it('iniciar devuelve token y URL de redirección, y guarda la orden', async () => {
    const inicio = await pasarela.iniciar(orden);

    expect(inicio.tokenPasarela).toBeTruthy();
    expect(inicio.urlRedireccion).toContain(inicio.tokenPasarela);
    // La orden queda registrada: es lo que deja verificar que el monto que viajó a
    // la pasarela es el del servidor y no el que mandó el cliente.
    expect(pasarela.ordenes).toEqual([orden]);
  });

  it('dos órdenes no comparten token', async () => {
    const uno = await pasarela.iniciar(orden);
    const otro = await pasarela.iniciar({ ...orden, referencia: 'ref-2' });

    // Con tokens repetidos, el único de `tokenPasarela` haría fallar la segunda
    // transacción y el fallo parecería un bug de la aplicación.
    expect(uno.tokenPasarela).not.toBe(otro.tokenPasarela);
  });

  it('autoriza por defecto, con código y últimos dígitos', async () => {
    const { tokenPasarela } = await pasarela.iniciar(orden);

    expect(await pasarela.confirmar(tokenPasarela)).toMatchObject({
      estado: 'AUTORIZADA',
      montoClp: 12000,
      motivoRechazo: null,
    });
  });

  it('se le puede pedir que rechace, con motivo', async () => {
    pasarela.respuesta = 'RECHAZADA';
    const { tokenPasarela } = await pasarela.iniciar(orden);

    const resultado = await pasarela.confirmar(tokenPasarela);

    expect(resultado.estado).toBe('RECHAZADA');
    expect(resultado.motivoRechazo).toBeTruthy();
    // Sin código de autorización: no hay nada autorizado que registrar.
    expect(resultado.codigoAutorizacion).toBeNull();
  });

  it('se le puede pedir que reporte un monto distinto al de la orden', async () => {
    // El escenario del criterio 6 de SPEC-pagos.md: la pasarela dice haber cobrado
    // otra cosa. En producción es manipulación o un bug; T18 lo manda a revisión
    // manual sin confirmar el efecto de negocio. Sin este mando, ese camino no se
    // puede probar.
    pasarela.montoReportado = 999;
    const { tokenPasarela } = await pasarela.iniciar(orden);

    expect((await pasarela.confirmar(tokenPasarela)).montoClp).toBe(999);
  });

  it('confirmar dos veces devuelve lo mismo y registra las dos llamadas', async () => {
    const { tokenPasarela } = await pasarela.iniciar(orden);

    const primera = await pasarela.confirmar(tokenPasarela);
    const segunda = await pasarela.confirmar(tokenPasarela);

    expect(segunda).toEqual(primera);
    // El doble **no** es idempotente a propósito: la idempotencia es de T18, y si el
    // doble la resolviera, el test obligatorio de doble confirmación pasaría sin que
    // nadie la haya implementado.
    expect(pasarela.confirmaciones).toEqual([tokenPasarela, tokenPasarela]);
  });

  it('un token que no emitió no se confirma', async () => {
    // La pasarela real tampoco conoce un token que no entregó. Devolver algo
    // plausible acá dejaría pasar un bug de tokens cruzados entre transacciones.
    await expect(pasarela.confirmar('token-inventado')).rejects.toThrow();
  });

  it('anular registra el token y el monto devuelto', async () => {
    const { tokenPasarela } = await pasarela.iniciar(orden);
    await pasarela.confirmar(tokenPasarela);

    await pasarela.anular(tokenPasarela, 12000);

    expect(pasarela.anulaciones).toEqual([{ tokenPasarela, montoClp: 12000 }]);
  });

  it('no anula lo que no autorizó', async () => {
    pasarela.respuesta = 'RECHAZADA';
    const { tokenPasarela } = await pasarela.iniciar(orden);
    await pasarela.confirmar(tokenPasarela);

    // Devolver plata de un cobro que no ocurrió. La pasarela real lo rechaza y el
    // doble tiene que hacerlo también, o T19 se escribe sin ese caso a la vista.
    await expect(pasarela.anular(tokenPasarela, 12000)).rejects.toThrow();
  });
});
