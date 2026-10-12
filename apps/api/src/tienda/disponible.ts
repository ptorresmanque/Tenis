import { CanalPedido, EstadoPedido, Prisma } from '../generated/prisma/client';
import { limiteDeExpiracion } from '../pagos/expiracion';

/**
 * Lo disponible de cada variante (T164): su stock menos lo que apartan los pedidos en
 * línea pendientes de pago creados hace menos de `MINUTOS_PARA_EXPIRAR`, nunca menos de
 * cero (`SPEC-tienda.md` § Disponibilidad).
 *
 * **El apartado se calcula al leer, sin job**: pasado el plazo, la unidad vuelve sola. Es
 * el mismo barrido por consulta que libera los bloques de `reservas`. Lo usan la ficha,
 * la lista, el carrito y el pedido, para que la regla esté una vez.
 */
export async function disponibles(
  db: Prisma.TransactionClient,
  variantes: { id: number; stock: number }[],
  ahora = new Date(),
): Promise<Map<number, number>> {
  const apartadas =
    variantes.length === 0
      ? []
      : await db.lineaPedido.groupBy({
          by: ['varianteId'],
          where: {
            varianteId: { in: variantes.map((v) => v.id) },
            pedido: {
              canal: CanalPedido.EN_LINEA,
              estado: EstadoPedido.PENDIENTE_PAGO,
              creadoEn: { gt: limiteDeExpiracion(ahora) },
            },
          },
          _sum: { cantidad: true },
        });
  const porVariante = new Map(
    apartadas.map((a) => [a.varianteId, a._sum.cantidad ?? 0]),
  );

  return new Map(
    variantes.map((v) => [
      v.id,
      Math.max(0, v.stock - (porVariante.get(v.id) ?? 0)),
    ]),
  );
}
