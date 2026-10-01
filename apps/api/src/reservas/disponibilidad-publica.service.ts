import { Injectable } from '@nestjs/common';

import {
  BloqueDisponible,
  CanchaPublica,
  DisponibilidadService,
} from '../catalogo-canchas/disponibilidad.service';
import { EstadoReserva, EstadoTransaccion } from '../generated/prisma/client';
import { ExpiracionService } from '../pagos/expiracion.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReservaRepository } from './reserva.repository';

/** Un bloque de la grilla, ya sabiendo si alguien lo tiene tomado. */
export interface BloqueConEstado extends BloqueDisponible {
  reservado: boolean;
}

/** Una cancha con sus bloques del día, que es lo que dibuja la grilla. */
export interface GrillaDeCancha {
  cancha: CanchaPublica;
  bloques: BloqueConEstado[];
}

/** Estados en que una reserva ocupa la cancha. */
const ACTIVAS = [EstadoReserva.PENDIENTE_PAGO, EstadoReserva.CONFIRMADA];

@Injectable()
export class DisponibilidadPublicaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogo: DisponibilidadService,
    private readonly expiracion: ExpiracionService,
    private readonly reservas: ReservaRepository,
  ) {}

  /**
   * El día entero: cada cancha activa con sus bloques.
   *
   * **Existe para ahorrar viajes, no para responder otra cosa.** La portada pedía
   * el catálogo y después una consulta por cancha: con ocho canchas eran nueve
   * viajes para pintar seis horas libres. El comentario de `de()` ya avisaba que
   * ese era el camino en cuanto el club creciera.
   *
   * Las canchas se resuelven en paralelo y cada una pasa por el mismo `de()` que
   * usa la consulta suelta, así que las dos respuestas no pueden divergir: hay un
   * test que lo comprueba comparándolas.
   */
  async delDia(fecha: string): Promise<GrillaDeCancha[]> {
    const canchas = await this.catalogo.canchas();

    return Promise.all(
      canchas.map(async (cancha) => ({
        cancha,
        bloques: await this.de(cancha.id, fecha),
      })),
    );
  }

  /**
   * Los bloques de una cancha en un día, con las reservas superpuestas.
   *
   * `catalogo-canchas` no sabe de reservas a propósito: calcula qué bloques existen y
   * cuánto valen. Juntarlos es de `reservas`, que es el único módulo que lee esa
   * tabla (`SPEC-reservas.md` § Contrato).
   */
  async de(canchaId: number, fecha: string): Promise<BloqueConEstado[]> {
    const bloques = await this.catalogo.de(canchaId, fecha);

    if (bloques.length === 0) return [];

    // El barrido va acá, al consultar disponibilidad, y no en un job programado
    // (`SPEC-pagos.md` § Expiración). Un cron es una pieza más que instalar y que
    // falla en silencio; acá corre justo cuando su resultado se va a usar.
    await this.expirarPagosAbandonados(
      canchaId,
      bloques[0].inicio,
      bloques[bloques.length - 1].fin,
    );

    const tomadas = await this.prisma.reserva.findMany({
      where: {
        canchaId,
        estado: { in: ACTIVAS },
        inicio: { lt: bloques[bloques.length - 1].fin },
        fin: { gt: bloques[0].inicio },
      },
      // Solo los instantes: la grilla es pública y decir quién reservó sería publicar
      // quién juega y cuándo, que no le importa a nadie más.
      select: { inicio: true, fin: true },
    });

    return bloques.map((bloque) => {
      const reservado = tomadas.some(
        (reserva) => bloque.inicio < reserva.fin && bloque.fin > reserva.inicio,
      );

      return {
        ...bloque,
        reservado,
        // Sin precio si no se puede tomar, igual que el bloqueado en T12: un monto al
        // lado de "reservado" invita a intentar pagarlo.
        montoClp: reservado ? 0 : bloque.montoClp,
      };
    });
  }

  /**
   * Expira las transacciones vencidas y libera las reservas que dependían de ellas.
   *
   * Son dos pasos y no uno porque `pagos` no sabe qué es una reserva: expira lo suyo
   * y devuelve el control. Acá se traduce a bloques libres, que es lo que la grilla
   * muestra.
   *
   * **Se mira solo el día y la cancha que se están consultando.** La primera versión
   * traía todas las transacciones expiradas del sistema en cada carga de la grilla, y
   * esa lista solo crece: al año de funcionar, cada persona que abre la pantalla se
   * llevaría miles de filas para liberar, a lo sumo, una hora.
   */
  private async expirarPagosAbandonados(
    canchaId: number,
    desde: Date,
    hasta: Date,
  ): Promise<void> {
    if ((await this.expiracion.barrer()) === 0) return;

    const enEspera = await this.prisma.reserva.findMany({
      where: {
        canchaId,
        estado: EstadoReserva.PENDIENTE_PAGO,
        inicio: { lt: hasta },
        fin: { gt: desde },
      },
      select: { id: true },
    });

    if (enEspera.length === 0) return;

    const sinPago = await this.prisma.transaccion.findMany({
      where: {
        concepto: 'RESERVA',
        conceptoId: { in: enEspera.map((r) => r.id) },
        estado: EstadoTransaccion.EXPIRADA,
      },
      select: { conceptoId: true },
    });

    // Una por una y por el repositorio, no con un `updateMany` propio: es el único
    // lugar que escribe `reserva` y así el aviso al panel del admin sale sin que haya
    // que acordarse acá. Con un `updateMany` suelto, el bloque volvía a la grilla
    // pública mientras el panel seguía mostrando "Esperando el pago" para siempre.
    // Son las pendientes vencidas de una cancha y un día: casi siempre ninguna o una.
    for (const { conceptoId } of sinPago) {
      await this.reservas.expirar(conceptoId);
    }
  }
}
