import { EstadoTransaccion } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Lo que una reserva lleva pagado: la suma de sus transacciones autorizadas.
 *
 * La compra y, si la alargó, la diferencia que cobra T89. Lo usan la regla de la
 * diferencia al mover (T88) y la página pública, que la muestra como dato. El socio y
 * el visitante del mesón no pasan por la pasarela: para ellos es cero.
 */
export async function pagadoPor(
  prisma: PrismaService,
  reservaId: number,
): Promise<number> {
  const { _sum } = await prisma.transaccion.aggregate({
    where: {
      concepto: 'RESERVA',
      conceptoId: reservaId,
      estado: EstadoTransaccion.AUTORIZADA,
    },
    _sum: { montoClp: true },
  });

  return _sum.montoClp ?? 0;
}
