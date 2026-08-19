import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { EstadoTransaccion } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { transicionar } from './estados';
import { PasarelaPago } from './pasarela.port';

@Injectable()
export class AnulacionService {
  private readonly log = new Logger('Pagos');

  constructor(
    private readonly prisma: PrismaService,
    private readonly pasarela: PasarelaPago,
  ) {}

  /**
   * Devuelve el monto completo y deja la transacción `ANULADA`.
   *
   * **`pagos` no evalúa la política de reembolso**: no sabe qué es una reserva ni
   * cuándo empieza. `reservas` decide si corresponde devolver —la ventana de 24 horas
   * contra `inicioBloqueOriginal`, T24— y recién entonces llama acá. Esto solo ejecuta
   * y registra.
   *
   * Solo existe la devolución total (`SPEC-pagos.md` § Reembolso). Devolver de menos
   * es una discusión con el socio que nadie quiere tener en el mesón.
   */
  async anular(transaccionId: number): Promise<void> {
    const transaccion = await this.prisma.transaccion.findUnique({
      where: { id: transaccionId },
    });

    if (!transaccion) {
      throw new NotFoundException('No hay una transacción con ese id.');
    }

    if (transaccion.estado === EstadoTransaccion.ANULADA) {
      // Ya se devolvió. Pedirlo de nuevo a la pasarela sería devolver dos veces, y
      // tratarlo como error obligaría a quien llama a distinguir un caso que da igual.
      return;
    }

    if (!transaccion.tokenPasarela) {
      // Sin token no llegó a haber cobro: no hay nada que devolver.
      throw new Error(
        `La transacción ${transaccion.id} no tiene token de pasarela.`,
      );
    }

    // Falla si no está AUTORIZADA. Anular un pago que no se cobró es un error de
    // quien llama, no algo que haya que tolerar.
    const estadoNuevo = transicionar(
      transaccion.estado,
      EstadoTransaccion.ANULADA,
    );
    const { tokenPasarela, montoClp } = transaccion;

    const devuelto = await this.prisma.$transaction(async (tx) => {
      // El cambio de estado va **antes** de pedir la plata, y adentro de la misma
      // transacción: el UPDATE toma el lock de la fila, así que una segunda anulación
      // simultánea espera acá y después encuentra `count: 0`. Sin esto, las dos leen
      // AUTORIZADA y las dos piden la devolución — plata que sale dos veces del club.
      const { count } = await tx.transaccion.updateMany({
        where: { id: transaccion.id, estado: EstadoTransaccion.AUTORIZADA },
        data: { estado: estadoNuevo },
      });

      if (count === 0) return false;

      // Adentro de la transacción a propósito. Si la pasarela falla, el rollback deja
      // la transacción AUTORIZADA otra vez y se puede reintentar; marcarla devuelta
      // sin que nadie haya recibido nada es peor que reintentar.
      //
      // `ponytail: mantiene el lock de la fila durante la llamada a la pasarela. Se
      // paga porque anular es raro y toca una sola fila; en el camino de confirmación,
      // que es caliente, T18 usa compare-and-set sin lock por eso mismo.`
      await this.pasarela.anular(tokenPasarela, montoClp);
      return true;
    });

    if (devuelto) {
      this.log.log(
        `Transacción ${transaccion.id}: devueltos $${montoClp} y anulada.`,
      );
    }
  }
}
