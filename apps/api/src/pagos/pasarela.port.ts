import { Injectable } from '@nestjs/common';

/** Lo que se manda a cobrar. `SPEC-pagos.md` § El puerto. */
export interface OrdenPago {
  /** Id de la `Transaccion`, opaco para la pasarela. */
  referencia: string;
  /** Entero, siempre. El peso chileno no tiene centavos. */
  montoClp: number;
  urlRetorno: string;
}

export interface InicioPago {
  tokenPasarela: string;
  urlRedireccion: string;
}

export interface ResultadoPago {
  estado: 'AUTORIZADA' | 'RECHAZADA';
  codigoAutorizacion: string | null;
  /** Lo que la pasarela dice haber cobrado. Se compara contra lo guardado (T18). */
  montoClp: number;
  ultimosDigitos: string | null;
  motivoRechazo: string | null;
}

/**
 * Cobrar un monto y saber con certeza si se cobró. Nada más.
 *
 * La pasarela no sabe qué se está pagando: recibe una referencia opaca y un monto.
 * Por eso cambiar de Webpay a Flow toca un solo archivo, el adaptador.
 *
 * **Ningún módulo fuera de `src/pagos/adaptadores/` importa nada de Transbank.** Si
 * ese import aparece en otro lado, la abstracción ya se rompió y el cambio de
 * pasarela vuelve a ser cirugía. Un test lo verifica en T17.
 *
 * Clase abstracta y no `interface`: es el token de inyección de Nest, el mismo trato
 * que `EnviadorCorreo` en `identidad`.
 */
@Injectable()
export abstract class PasarelaPago {
  abstract readonly nombre: string;

  abstract iniciar(orden: OrdenPago): Promise<InicioPago>;
  abstract confirmar(tokenPasarela: string): Promise<ResultadoPago>;
  abstract anular(tokenPasarela: string, montoClp: number): Promise<void>;
}
