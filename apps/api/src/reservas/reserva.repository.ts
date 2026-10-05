import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';

import { EstadoReserva, Prisma, Reserva } from '../generated/prisma/client';
import {
  esViolacionDeUnicidad,
  reintentarSiHayDeadlock,
} from '../prisma/errores';
import { PrismaService } from '../prisma/prisma.service';
import { EventosDeReserva } from './eventos';

/**
 * Alguien se adelantó y tomó ese bloque.
 *
 * Un error de dominio y no el `P2002` crudo: es la diferencia entre decirle a quien
 * iba a pagar "esa hora la tomaron recién, elige otra" y mostrarle un 500.
 */
export class BloqueTomado extends Error {
  constructor(
    readonly canchaId: number,
    readonly inicio: Date,
  ) {
    super('Ese bloque lo acaban de tomar. Elige otro horario.');
    this.name = 'BloqueTomado';
  }
}

/** Un socio del club, o un invitado externo. Exactamente uno de los dos. */
export interface AcompananteNuevo {
  socioId?: number | null;
  nombre?: string | null;
}

export interface ReservaNueva {
  canchaId: number;
  inicio: Date;
  fin: Date;
  esPico: boolean;
  estado: EstadoReserva;
  /** Nulo = no-socio. */
  socioId?: number | null;
  nombre: string;
  email: string;
  telefono: string;
  acompanantes?: AcompananteNuevo[];
}

@Injectable()
export class ReservaRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventos: EventosDeReserva,
  ) {}

  /**
   * Crea la reserva, o falla porque el bloque ya está tomado.
   *
   * **La unicidad la decide la base**, no una consulta previa: T2 probó contra
   * MariaDB que dos transacciones que leen antes de escribir ven ambas el bloque
   * libre. Acá se consulta para mostrar; el `INSERT` contra el índice es lo que manda.
   */
  async crear(
    datos: ReservaNueva,
    /**
     * El cliente de una transacción en curso, cuando quien llama necesita que la
     * creación comparta el lock que tomó. La reserva del socio lo usa para evaluar sus
     * cupos y crear sin que otra petición suya se cuele en el medio.
     */
    tx?: Prisma.TransactionClient,
  ): Promise<Reserva> {
    datos.acompanantes?.forEach(exigirSocioOInvitado);

    const escribir = (db: Prisma.TransactionClient | PrismaService) =>
      db.reserva.create({
        data: {
          folio: nuevoFolio(),
          canchaId: datos.canchaId,
          inicio: datos.inicio,
          fin: datos.fin,
          esPico: datos.esPico,
          estado: datos.estado,
          socioId: datos.socioId ?? null,
          nombre: datos.nombre,
          email: datos.email,
          telefono: datos.telefono,
          acompanantes: datos.acompanantes?.length
            ? {
                create: datos.acompanantes.map((a) => ({
                  socioId: a.socioId ?? null,
                  nombre: a.nombre ?? null,
                })),
              }
            : undefined,
        },
      });

    try {
      // Dentro de una transacción ajena no se puede reintentar acá: si hay deadlock,
      // la base revierte la transacción entera y la repite quien la abrió (ver
      // `conElSocioBloqueado`). Sola, sí: un deadlock no dejó nada escrito.
      const reserva = await (tx
        ? escribir(tx)
        : reintentarSiHayDeadlock(() => escribir(this.prisma)));

      // Acá y no en cada servicio: por este método pasan todas las reservas que
      // nacen, así que el panel en vivo no depende de que quien agregue un camino
      // nuevo se acuerde de avisar.
      this.eventos.cambio(reserva.inicio);

      return reserva;
    } catch (error) {
      if (esViolacionDeUnicidad(error) && !chocaElFolio(error)) {
        throw new BloqueTomado(datos.canchaId, datos.inicio);
      }

      throw error;
    }
  }

  /**
   * Libera el bloque. Devuelve `false` si ya no había nada que cancelar.
   *
   * El estado viaja en el `where` y no en un `if` previo: dos cancelaciones a la vez
   * —el socio y el admin, o un doble clic— llegan las dos a leer `CONFIRMADA`, y sin
   * esto las dos escribirían `canceladaEn`, la segunda pisando la hora de la primera.
   */
  async cancelar(id: number): Promise<boolean> {
    // Con reintento: al pasar a CANCELADA, `cancha_activa` queda en NULL y la fila
    // sale del tramo del índice por rango, que otra escritura puede tener tomado.
    const { count } = await reintentarSiHayDeadlock(() =>
      this.prisma.reserva.updateMany({
        where: {
          id,
          estado: {
            in: [EstadoReserva.PENDIENTE_PAGO, EstadoReserva.CONFIRMADA],
          },
        },
        data: { estado: EstadoReserva.CANCELADA, canceladaEn: new Date() },
      }),
    );

    if (count > 0) await this.avisar(id);

    return count > 0;
  }

  /** El pago no llegó a tiempo (T19): la hora vuelve a estar a la venta. */
  async expirar(id: number): Promise<boolean> {
    const { count } = await reintentarSiHayDeadlock(() =>
      this.prisma.reserva.updateMany({
        where: { id, estado: EstadoReserva.PENDIENTE_PAGO },
        data: { estado: EstadoReserva.EXPIRADA },
      }),
    );

    if (count > 0) await this.avisar(id);

    return count > 0;
  }

  /**
   * Avisa que ese día cambió.
   *
   * Hace falta releer la fila porque `cancelar` y `expirar` actualizan por
   * `updateMany` —el estado va en el `where` y ese es el compare-and-set que evita
   * que dos cancelaciones simultáneas se pisen— y `updateMany` no devuelve la fila.
   * Es una lectura por clave primaria y solo cuando algo cambió de verdad.
   */
  private async avisar(id: number): Promise<void> {
    const reserva = await this.prisma.reserva.findUnique({
      where: { id },
      select: { inicio: true },
    });

    if (reserva) this.eventos.cambio(reserva.inicio);
  }
}

/**
 * Un acompañante es un socio del club **o** un invitado externo, nunca los dos ni
 * ninguno.
 *
 * La regla vive acá y no en un CHECK de la base porque **MariaDB no permite que una
 * columna con foreign key participe en un CHECK constraint** — probado en las dos
 * formas, dentro del `CREATE TABLE` y por `ALTER`. Entre la foreign key y el CHECK
 * gana la foreign key: garantiza que el socio existe y limpia la fila cuando se da de
 * baja. Sin este guardia, una fila vacía contaría como "declaró con quién juega".
 */
function exigirSocioOInvitado(acompanante: AcompananteNuevo): void {
  const esSocio = acompanante.socioId != null;
  const esInvitado =
    acompanante.nombre != null && acompanante.nombre.trim() !== '';

  if (esSocio === esInvitado) {
    throw new Error(
      'Cada acompañante es un socio del club o un invitado externo, no las dos cosas ' +
        'ni ninguna.',
    );
  }
}

/**
 * El único que chocó fue el del folio, no el del bloque.
 *
 * Sin distinguirlos, una colisión de folio —astronómicamente improbable pero posible—
 * le diría a alguien que su hora está tomada cuando en realidad está libre, y quien
 * lo depure va a buscar el problema en el lugar equivocado.
 */
function chocaElFolio(error: unknown): boolean {
  const objetivo = (error as Prisma.PrismaClientKnownRequestError).meta?.target;

  return JSON.stringify(objetivo ?? '').includes('folio');
}

/**
 * Un folio corto para decir por teléfono.
 *
 * Sin `0`, `O`, `1` ni `I`: quien lo dicte en el mesón no tiene que aclarar si es cero
 * o la letra. Son 32^7 combinaciones, y si aun así chocara, el único de la base lo
 * rechaza en vez de entregar dos reservas con el mismo folio.
 */
function nuevoFolio(): string {
  const alfabeto = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

  return Array.from(
    { length: 7 },
    () => alfabeto[randomInt(alfabeto.length)],
  ).join('');
}
