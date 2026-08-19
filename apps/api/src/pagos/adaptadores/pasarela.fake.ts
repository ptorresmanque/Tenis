import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  InicioPago,
  OrdenPago,
  PasarelaPago,
  ResultadoPago,
} from '../pasarela.port';

/**
 * Doble de `PasarelaPago`. El que deja construir y probar `reservas` sin Transbank.
 *
 * Va antes que el adaptador Webpay a propósito (`tasks/plan.md`): el ambiente de
 * integración es lento, está fuera de nuestro control, y no sabe rechazar un pago a
 * pedido ni reportar un monto distinto al cobrado. Esos son justo los caminos donde
 * viven los bugs caros.
 *
 * Los mandos son campos públicos y no un constructor: el test toma el mismo proveedor
 * que inyecta Nest y le cambia la conducta antes de cada caso.
 */
@Injectable()
export class PasarelaFake extends PasarelaPago {
  readonly nombre = 'doble';

  /** Órdenes recibidas, en orden. Con esto se verifica qué monto viajó de verdad. */
  readonly ordenes: OrdenPago[] = [];
  /** Un elemento por llamada a `confirmar()`, incluidas las repetidas. */
  readonly confirmaciones: string[] = [];
  readonly anulaciones: { tokenPasarela: string; montoClp: number }[] = [];

  /** Qué responde `confirmar()`. */
  respuesta: 'AUTORIZADA' | 'RECHAZADA' = 'AUTORIZADA';
  /** Monto que reporta la pasarela. Nulo = el de la orden, que es lo normal. */
  montoReportado: number | null = null;
  /** Simula la pasarela caída o rechazando la orden antes de redirigir. */
  fallarAlIniciar = false;
  /**
   * Que el segundo `confirmar()` del mismo token falle, como hace Webpay.
   *
   * Transbank responde 422 —`Transaction has an invalid finished state`— cuando se
   * confirma dos veces, tal como se vio contra el ambiente de integración en T17. Es
   * lo que pasa cuando dos callbacks llegan a la vez y los dos alcanzan a preguntar.
   */
  fallarEnConfirmacionRepetida = false;
  /** Simula una devolución que la pasarela no acepta. */
  fallarAlAnular = false;

  private readonly porToken = new Map<string, OrdenPago>();
  private readonly autorizados = new Set<string>();

  iniciar(orden: OrdenPago): Promise<InicioPago> {
    if (this.fallarAlIniciar) {
      return Promise.reject(new Error('La pasarela no aceptó la orden.'));
    }

    const tokenPasarela = randomUUID();
    this.ordenes.push(orden);
    this.porToken.set(tokenPasarela, orden);

    return Promise.resolve({
      tokenPasarela,
      urlRedireccion: `https://pasarela.local/pagar/${tokenPasarela}`,
    });
  }

  confirmar(tokenPasarela: string): Promise<ResultadoPago> {
    const orden = this.porToken.get(tokenPasarela);

    if (!orden) {
      // La pasarela real tampoco conoce un token que no emitió. Responder algo
      // plausible dejaría pasar un cruce de tokens entre transacciones.
      return Promise.reject(new Error('Token desconocido para esta pasarela.'));
    }

    if (
      this.fallarEnConfirmacionRepetida &&
      this.confirmaciones.includes(tokenPasarela)
    ) {
      return Promise.reject(
        new Error('Transaction has an invalid finished state: authorized'),
      );
    }

    // Se registra siempre, también la repetida: el doble **no** es idempotente. Si lo
    // fuera, el test obligatorio de doble confirmación de T18 pasaría sin que nadie
    // hubiera implementado la idempotencia.
    this.confirmaciones.push(tokenPasarela);

    if (this.respuesta === 'RECHAZADA') {
      return Promise.resolve({
        estado: 'RECHAZADA',
        codigoAutorizacion: null,
        montoClp: this.montoReportado ?? orden.montoClp,
        ultimosDigitos: null,
        motivoRechazo: 'Tarjeta rechazada por el emisor',
      });
    }

    this.autorizados.add(tokenPasarela);

    return Promise.resolve({
      estado: 'AUTORIZADA',
      codigoAutorizacion: tokenPasarela.slice(0, 6).toUpperCase(),
      montoClp: this.montoReportado ?? orden.montoClp,
      ultimosDigitos: '4321',
      motivoRechazo: null,
    });
  }

  anular(tokenPasarela: string, montoClp: number): Promise<void> {
    if (this.fallarAlAnular) {
      return Promise.reject(new Error('La pasarela no aceptó la devolución.'));
    }

    if (!this.autorizados.has(tokenPasarela)) {
      // Devolver plata de un cobro que no ocurrió. La pasarela real lo rechaza, y si
      // el doble lo aceptara, T19 se escribiría sin ese caso a la vista.
      return Promise.reject(
        new Error('No hay un cobro autorizado que anular.'),
      );
    }

    this.anulaciones.push({ tokenPasarela, montoClp });
    return Promise.resolve();
  }

  /** Deja el doble como recién creado. Para el `beforeEach` de los tests. */
  reiniciar(): void {
    this.ordenes.length = 0;
    this.confirmaciones.length = 0;
    this.anulaciones.length = 0;
    this.respuesta = 'AUTORIZADA';
    this.montoReportado = null;
    this.fallarAlIniciar = false;
    this.fallarEnConfirmacionRepetida = false;
    this.fallarAlAnular = false;
    this.porToken.clear();
    this.autorizados.clear();
  }
}
