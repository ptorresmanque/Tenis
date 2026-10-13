import { Injectable } from '@nestjs/common';

import type { DuracionMin } from '../catalogo-canchas/bloques';
import {
  BloqueDisponible,
  CanchaPublica,
  DisponibilidadService,
} from '../catalogo-canchas/disponibilidad.service';
import {
  DuracionesSocioPico,
  EstadoReserva,
  EstadoTransaccion,
} from '../generated/prisma/client';
import { ExpiracionService } from '../pagos/expiracion.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReservaRepository } from './reserva.repository';
import { duracionPermitidaEnPrime } from './cupo';
import { lucesDelDia, type OcupacionNueva } from './tope-de-luz';

/** Un bloque de la grilla, ya sabiendo si alguien lo tiene tomado. */
export interface BloqueConEstado extends BloqueDisponible {
  reservado: boolean;
  /**
   * La cancha está libre pero a esa hora ya no se puede encender (T207): el tope de
   * canchas con luz está lleno. Viaja con `reservado: true`, así la grilla pública la ve
   * tomada sin decir nada de la luz, y el mesón lee esto para explicar por qué.
   */
  topeDeLuz: boolean;
  /**
   * Si el socio puede tomar esta duración acá (T212): no, si toca prime y el club no le
   * permite esa duración en prime. La grilla del socio la esconde; la del visitante, no.
   */
  socioPuede: boolean;
}

/** Lo que la grilla lee una vez por día y no una por cancha. */
interface LoDelDia {
  yaNoSeEnciende: (ocupacion: OcupacionNueva) => boolean;
  duracionesSocioPico: DuracionesSocioPico;
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
  async delDia(
    fecha: string,
    duracionMin: DuracionMin = 60,
    /** La reserva que se está moviendo: su hora no le ocupa la grilla a ella misma (T87). */
    excluyendo?: number,
  ): Promise<GrillaDeCancha[]> {
    const canchas = await this.catalogo.canchas();
    const leido = await this.loDelDia(fecha, excluyendo);

    return Promise.all(
      canchas.map(async (cancha) => ({
        cancha,
        bloques: await this.de(
          cancha.id,
          fecha,
          duracionMin,
          excluyendo,
          leido,
        ),
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
  async de(
    canchaId: number,
    fecha: string,
    duracionMin: DuracionMin = 60,
    excluyendo?: number,
    /** Lo que ya leyó `delDia`, para no leerlo una vez por cancha. */
    leido?: LoDelDia,
  ): Promise<BloqueConEstado[]> {
    const bloques = await this.catalogo.de(canchaId, fecha, duracionMin);

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
        id: excluyendo === undefined ? undefined : { not: excluyendo },
        estado: { in: ACTIVAS },
        inicio: { lt: bloques[bloques.length - 1].fin },
        fin: { gt: bloques[0].inicio },
      },
      // Solo los instantes: la grilla es pública y decir quién reservó sería publicar
      // quién juega y cuándo, que no le importa a nadie más.
      select: { inicio: true, fin: true },
    });

    const { yaNoSeEnciende, duracionesSocioPico } =
      leido ?? (await this.loDelDia(fecha, excluyendo));

    return bloques.map((bloque) => {
      const tomado = tomadas.some(
        (reserva) => bloque.inicio < reserva.fin && bloque.fin > reserva.inicio,
      );
      const topeDeLuz =
        !tomado &&
        !bloque.bloqueado &&
        yaNoSeEnciende({ canchaId, inicio: bloque.inicio, fin: bloque.fin });
      const reservado = tomado || topeDeLuz;

      return {
        ...bloque,
        reservado,
        topeDeLuz,
        socioPuede:
          !bloque.tocaPico ||
          duracionPermitidaEnPrime(duracionMin, duracionesSocioPico),
        // Sin precio si no se puede tomar, igual que el bloqueado en T12: un monto al
        // lado de "reservado" invita a intentar pagarlo.
        montoClp: reservado ? 0 : bloque.montoClp,
      };
    });
  }

  /** El tope de luz del día y las duraciones del socio en prime. */
  private async loDelDia(
    fecha: string,
    excluyendo?: number,
  ): Promise<LoDelDia> {
    const [yaNoSeEnciende, configuracion] = await Promise.all([
      lucesDelDia(this.prisma, fecha, { ignorarReservaId: excluyendo }),
      this.prisma.configuracionClub.findFirstOrThrow({
        select: { duracionesSocioPico: true },
      }),
    ]);

    return { yaNoSeEnciende, ...configuracion };
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
    // **Sin cortar si este barrido no expiró nada.** El barrido es global y la
    // liberación es por cancha y día: si otra consulta expiró la transacción primero
    // —otro día, otra cancha, o las ocho canchas de la grilla del día en paralelo—, el
    // corte dejaba la reserva PENDIENTE_PAGO y la hora tomada para siempre. Lo que
    // decide es el estado de la transacción, que se mira abajo. El costo es una
    // consulta indexada por cancha que casi siempre vuelve vacía.
    await this.expiracion.barrer();

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
