import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';

import { EstadoReserva, Prisma, Reserva } from '../generated/prisma/client';
import { esViolacionDeUnicidad } from '../prisma/errores';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Alguien se adelantó y tomó ese bloque.
 *
 * Un error de dominio y no el `P2002` crudo: es la diferencia entre decirle a quien
 * iba a pagar "esa hora la tomaron recién, elegí otra" y mostrarle un 500.
 */
export class BloqueTomado extends Error {
  constructor(
    readonly canchaId: number,
    readonly inicio: Date,
  ) {
    super('Ese bloque lo acaban de tomar. Elegí otro horario.');
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
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crea la reserva, o falla porque el bloque ya está tomado.
   *
   * **La unicidad la decide la base**, no una consulta previa: T2 probó contra
   * MariaDB que dos transacciones que leen antes de escribir ven ambas el bloque
   * libre. Acá se consulta para mostrar; el `INSERT` contra el índice es lo que manda.
   */
  async crear(datos: ReservaNueva): Promise<Reserva> {
    datos.acompanantes?.forEach(exigirSocioOInvitado);

    try {
      return await this.prisma.reserva.create({
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
    const { count } = await this.prisma.reserva.updateMany({
      where: {
        id,
        estado: {
          in: [EstadoReserva.PENDIENTE_PAGO, EstadoReserva.CONFIRMADA],
        },
      },
      data: { estado: EstadoReserva.CANCELADA, canceladaEn: new Date() },
    });

    return count > 0;
  }

  /** El pago no llegó a tiempo (T19): la hora vuelve a estar a la venta. */
  async expirar(id: number): Promise<boolean> {
    const { count } = await this.prisma.reserva.updateMany({
      where: { id, estado: EstadoReserva.PENDIENTE_PAGO },
      data: { estado: EstadoReserva.EXPIRADA },
    });

    return count > 0;
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
