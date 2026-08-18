import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  IntegrationApiKeys,
  IntegrationCommerceCodes,
  WebpayPlus,
} from 'transbank-sdk';

import {
  InicioPago,
  OrdenPago,
  PasarelaPago,
  ResultadoPago,
} from '../pasarela.port';

/** Máximo de `buyOrder` en Webpay. Lo valida el SDK, pero tarde y con su mensaje. */
const LARGO_MAXIMO_ORDEN = 26;

/**
 * Lo que el adaptador usa del SDK: tres métodos de `WebpayPlus.Transaction`.
 *
 * Se declara acá para poder doblarlo en los tests sin construir una transacción real.
 * El `Transaction` del SDK encaja por forma, así que no hay que envolverlo.
 */
export interface TransaccionWebpay {
  create(
    buyOrder: string,
    sessionId: string,
    amount: number,
    returnUrl: string,
  ): Promise<unknown>;
  commit(token: string): Promise<unknown>;
  refund(token: string, amount: number): Promise<unknown>;
}

/**
 * `PasarelaPago` contra Webpay Plus.
 *
 * **Este archivo y sus hermanos de `adaptadores/` son los únicos que importan
 * Transbank.** Lo verifica `test/frontera-transbank.spec.ts`: en cuanto ese import
 * aparece en un servicio, cambiar de pasarela deja de ser cambiar una línea del
 * módulo y vuelve a ser cirugía.
 */
@Injectable()
export class WebpayAdapter extends PasarelaPago {
  readonly nombre = 'webpay';

  // Sin valor por defecto: Nest ignora los defaults del constructor y trataría esto
  // como una dependencia a inyectar, que para una interfaz no existe. La transacción
  // se arma en `PagosModule`, que es donde se elige el ambiente.
  constructor(private readonly webpay: TransaccionWebpay) {
    super();
  }

  async iniciar(orden: OrdenPago): Promise<InicioPago> {
    if (orden.referencia.length > LARGO_MAXIMO_ORDEN) {
      throw new Error(
        `La referencia no cabe en la orden de compra de Webpay: ` +
          `${orden.referencia.length} caracteres, el máximo es ${LARGO_MAXIMO_ORDEN}.`,
      );
    }

    const respuesta = (await this.webpay.create(
      orden.referencia,
      // `sessionId` es un campo libre que vuelve en la respuesta. No se usa para
      // nada nuestro: la transacción se reconoce por el token.
      randomUUID(),
      orden.montoClp,
      orden.urlRetorno,
    )) as { token?: string; url?: string };

    // Lo que llega de Transbank es dato de afuera, no una promesa. Sin token no hay
    // forma de reconocer el pago cuando vuelva, y guardarlo nulo dejaría un cobro
    // iniciado allá que acá figura como pendiente para siempre.
    if (!respuesta.token || !respuesta.url) {
      throw new Error(
        'Webpay no devolvió token y URL de redirección al crear la transacción.',
      );
    }

    return {
      tokenPasarela: respuesta.token,
      urlRedireccion: respuesta.url,
    };
  }

  async confirmar(tokenPasarela: string): Promise<ResultadoPago> {
    const respuesta = (await this.webpay.commit(
      tokenPasarela,
    )) as RespuestaCommit;

    if (typeof respuesta.amount !== 'number') {
      // El monto de Transbank es el insumo de la comparación de T18. Si llega vacío,
      // esa comparación sería contra nada y el efecto de negocio se confirmaría a
      // ciegas: mejor caerse acá, con la transacción todavía pendiente.
      throw new Error('Webpay no devolvió el monto de la transacción.');
    }

    // Las dos condiciones, no una: `response_code: 0` con otro estado aparece en
    // transacciones anuladas, y darlas por autorizadas confirmaría una reserva sobre
    // un cobro que ya no está en pie.
    const autorizada =
      respuesta.response_code === 0 && respuesta.status === 'AUTHORIZED';

    return {
      estado: autorizada ? 'AUTORIZADA' : 'RECHAZADA',
      codigoAutorizacion: autorizada
        ? (respuesta.authorization_code ?? null)
        : null,
      // El monto que reporta Transbank, sin corregir: T18 lo compara contra el
      // guardado y si se devolviera el nuestro, la comparación coincidiría siempre.
      montoClp: respuesta.amount,
      // La API REST los manda en `card_detail`; la referencia del SDK, en la raíz.
      ultimosDigitos: ultimosCuatro(
        respuesta.card_detail?.card_number ?? respuesta.card_number,
      ),
      motivoRechazo: autorizada ? null : motivoDe(respuesta),
    };
  }

  async anular(tokenPasarela: string, montoClp: number): Promise<void> {
    // El error se propaga tal cual: una devolución que no ocurrió no se puede dar
    // por hecha, y `reservas` tiene que enterarse para no decirle a nadie que le
    // devolvieron la plata.
    await this.webpay.refund(tokenPasarela, montoClp);
  }
}

interface RespuestaCommit {
  status?: string;
  response_code?: number;
  authorization_code?: string | null;
  amount: number;
  card_number?: string | null;
  card_detail?: { card_number?: string | null };
}

/**
 * Los últimos cuatro dígitos, venga el número como venga.
 *
 * Transbank a veces manda solo los cuatro y a veces el número enmascarado
 * (`****1111`). La columna es `VARCHAR(4)`: guardar la máscara completa revienta el
 * insert justo al confirmar un pago real. Y de la tarjeta no se guarda nada más —
 * nunca el número, ni siquiera enmascarado.
 */
function ultimosCuatro(numero: string | null | undefined): string | null {
  const digitos = (numero ?? '').replace(/\D/g, '');

  return digitos ? digitos.slice(-4) : null;
}

/**
 * Los rechazos que Transbank documenta, en castellano.
 *
 * Un "-1" en pantalla no le dice nada a quien acaba de intentar pagar, y el que
 * atiende el teléfono del club tampoco lo tiene a mano.
 */
const MOTIVOS: Record<number, string> = {
  [-1]: 'La tarjeta fue rechazada por el emisor.',
  [-2]: 'El pago falló. Se puede volver a intentar.',
  [-3]: 'Hubo un error al procesar el pago.',
  [-4]: 'El emisor de la tarjeta rechazó el pago.',
  [-5]: 'El pago fue rechazado por riesgo de fraude.',
  [-6]: 'Se excedió el cupo máximo en cuotas.',
  [-7]: 'Se excedió el límite de la tarjeta.',
  [-8]: 'La tarjeta no permite este tipo de compra.',
};

function motivoDe(respuesta: RespuestaCommit): string {
  const codigo = respuesta.response_code;

  if (codigo === undefined) {
    return `Transbank no autorizó el pago (estado ${respuesta.status ?? 'desconocido'}).`;
  }

  return (
    MOTIVOS[codigo] ??
    `Transbank rechazó el pago (código ${codigo}, estado ${respuesta.status ?? 'desconocido'}).`
  );
}

/**
 * La transacción de Webpay según el entorno.
 *
 * Por defecto, el **ambiente de integración con las credenciales públicas de
 * prueba**: el club no tiene afiliación comercial y no la tendrá hasta que se cierre
 * el trato (`SPEC-pagos.md` § Ambiente). Producción exige las tres variables, y si
 * falta alguna se cae acá y no con un cobro que se pierde.
 */
export function webpayDesdeEntorno(): TransaccionWebpay {
  const codigoComercio = process.env.WEBPAY_CODIGO_COMERCIO;
  const apiKey = process.env.WEBPAY_API_KEY;

  if (process.env.WEBPAY_AMBIENTE === 'produccion') {
    if (!codigoComercio || !apiKey) {
      throw new Error(
        'WEBPAY_AMBIENTE=produccion exige WEBPAY_CODIGO_COMERCIO y WEBPAY_API_KEY. ' +
          'Sin credenciales reales no se puede cobrar de verdad.',
      );
    }

    return WebpayPlus.Transaction.buildForProduction(codigoComercio, apiKey);
  }

  return WebpayPlus.Transaction.buildForIntegration(
    codigoComercio ?? IntegrationCommerceCodes.WEBPAY_PLUS,
    apiKey ?? IntegrationApiKeys.WEBPAY,
  );
}
