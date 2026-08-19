import { Injectable, Logger } from '@nestjs/common';

import { EstadoTransaccion } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { limiteDeExpiracion } from './expiracion';

@Injectable()
export class ExpiracionService {
  private readonly log = new Logger('Pagos');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Marca `EXPIRADA` toda pendiente que ya pasó su ventana. Devuelve cuántas.
   *
   * Sin esto, quien abandona el pago deja la cancha tomada para siempre: el bloque no
   * vuelve a ofrecerse y nadie entiende por qué esa hora nunca está libre.
   *
   * **Se llama al consultar disponibilidad, no desde un job programado** (`SPEC-pagos.md`
   * § Expiración). Un cron es una pieza más que instalar, monitorear y que falla en
   * silencio; acá el barrido ocurre exactamente cuando su resultado se va a usar.
   *
   * `ponytail: un UPDATE por consulta de disponibilidad. Si el volumen crece, pasa a
   * un cron o a un barrido con throttle.`
   */
  async barrer(ahora: Date = new Date()): Promise<number> {
    const { count } = await this.prisma.transaccion.updateMany({
      // Estrictamente menor: quien empezó a pagar hace exactamente 15 minutos todavía
      // está dentro de su ventana. La cuenta se hace entera, como `alDiaHasta`.
      where: {
        estado: EstadoTransaccion.PENDIENTE,
        creadaEn: { lt: limiteDeExpiracion(ahora) },
      },
      data: { estado: EstadoTransaccion.EXPIRADA },
    });

    if (count > 0) {
      this.log.log(`Expiraron ${count} transacciones pendientes.`);
    }

    return count;
  }
}
