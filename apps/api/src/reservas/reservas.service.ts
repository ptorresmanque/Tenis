import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DisponibilidadService } from '../catalogo-canchas/disponibilidad.service';
import { hoyEnElClub, instanteEnElClub } from '../comun/tiempo';
import { EstadoReserva } from '../generated/prisma/client';
import { UsuarioActual } from '../identidad/usuario-actual';
import { PrismaService } from '../prisma/prisma.service';
import {
  AcompananteDeclarado,
  evaluarReservaDeSocio,
  OcupacionDeSocio,
} from './cupo';
import { BloqueTomado, ReservaRepository } from './reserva.repository';

/** Los estados en que una reserva ocupa la cancha y cuenta para los cupos. */
const ACTIVAS = [EstadoReserva.PENDIENTE_PAGO, EstadoReserva.CONFIRMADA];

export interface ReservaDeSocio {
  canchaId: number;
  /** Instante de inicio del bloque, tal como lo devuelve la disponibilidad. */
  inicio: Date;
  acompanantes: AcompananteDeclarado[];
}

export interface ReservaCreada {
  id: number;
  folio: string;
  canchaId: number;
  inicio: Date;
  fin: Date;
  esPico: boolean;
}

@Injectable()
export class ReservasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly disponibilidad: DisponibilidadService,
    private readonly reservas: ReservaRepository,
  ) {}

  /**
   * La reserva del socio: sin pago, contra sus cupos.
   *
   * Las reglas viven en `cupo.ts` y son puras; acá se juntan los datos que necesitan.
   * La separación no es ceremonia: las reglas son lo que el club discute y cambia, y
   * poder probarlas sin base de datos es lo que hace barato ese cambio.
   */
  async reservarComoSocio(
    yo: UsuarioActual,
    datos: ReservaDeSocio,
  ): Promise<ReservaCreada> {
    if (yo.socioId === null) {
      throw new NotFoundException('No tienes ficha de socio en el club.');
    }

    const fecha = fechaCivilDelClub(datos.inicio);
    const bloque = await this.bloqueDeLaGrilla(
      datos.canchaId,
      fecha,
      datos.inicio,
    );

    const socio = await this.prisma.socio.findUniqueOrThrow({
      where: { id: yo.socioId },
      select: {
        id: true,
        estado: true,
        alDiaHasta: true,
        // El teléfono viaja a la reserva para que el panel del admin sepa a quién
        // llamar sin ir a buscar la ficha. `UsuarioActual` no lo trae: es un dato
        // de contacto, no de autorización.
        usuario: { select: { telefono: true } },
      },
    });

    const [reservasDelDia, horasPicoDeLaSemana, ocupados] = await Promise.all([
      this.contarDelDia(socio.id, fecha),
      this.contarPicoDeLaSemana(socio.id, fecha),
      this.ocupacionesEnElRango(
        [socio.id, ...socioIdsDe(datos.acompanantes)],
        bloque.inicio,
        bloque.fin,
      ),
    ]);

    const config = await this.prisma.configuracionClub.findFirstOrThrow();

    // `ponytail: los cupos se evalúan sobre lo que había al consultar, no bajo lock.
    // Dos reservas simultáneas del mismo socio en bloques distintos del mismo día
    // pueden pasar las dos y dejarlo con dos horas. El bloque en sí no se duplica —de
    // eso se encarga el índice único—, y el daño es una hora de más para un socio, no
    // una cancha vendida dos veces. Si el club ve que ocurre, la salida es evaluar e
    // insertar dentro de una transacción con SELECT ... FOR UPDATE sobre sus reservas
    // del día.`
    const rechazo = evaluarReservaDeSocio({
      socio,
      bloque,
      hoyEnElClub: fechaCivilDelClub(new Date()),
      config,
      reservasDelDia,
      horasPicoDeLaSemana,
      acompanantes: datos.acompanantes,
      ocupados,
    });

    if (rechazo) {
      // 409 y no 403: no es un problema de permisos sino del estado de las cosas —
      // el cupo de hoy, la cuota, otra cancha a la misma hora.
      throw new ConflictException({
        motivo: rechazo.tipo,
        message: rechazo.mensaje,
      });
    }

    try {
      const reserva = await this.reservas.crear({
        canchaId: datos.canchaId,
        inicio: bloque.inicio,
        fin: bloque.fin,
        esPico: bloque.esPico,
        // El socio no paga: la reserva nace confirmada, sin transacción detrás.
        estado: EstadoReserva.CONFIRMADA,
        socioId: socio.id,
        nombre: yo.nombre,
        email: yo.email,
        telefono: socio.usuario.telefono ?? '',
        acompanantes: datos.acompanantes,
      });

      return {
        id: reserva.id,
        folio: reserva.folio,
        canchaId: reserva.canchaId,
        inicio: reserva.inicio,
        fin: reserva.fin,
        esPico: reserva.esPico,
      };
    } catch (error) {
      if (error instanceof BloqueTomado) {
        // La carrera que el índice único atajó: alguien reservó entre la consulta de
        // disponibilidad y este insert.
        throw new ConflictException({
          motivo: 'BLOQUE_TOMADO',
          message: error.message,
        });
      }

      throw error;
    }
  }

  /**
   * El bloque, tal como lo ve la grilla pública.
   *
   * No se confía en el `inicio` que manda el cliente: se busca entre los bloques que
   * el catálogo calculó para ese día. Un instante inventado —o el de un horario que
   * el club ya cambió— no encuentra bloque y se rechaza acá.
   */
  private async bloqueDeLaGrilla(
    canchaId: number,
    fecha: string,
    inicio: Date,
  ): Promise<{ inicio: Date; fin: Date; esPico: boolean }> {
    const bloques = await this.disponibilidad.de(canchaId, fecha);
    const bloque = bloques.find((b) => b.inicio.getTime() === inicio.getTime());

    if (!bloque) {
      throw new NotFoundException(
        'Esa hora no está en el horario de la cancha.',
      );
    }

    if (bloque.bloqueado) {
      throw new ConflictException({
        motivo: 'BLOQUE_NO_DISPONIBLE',
        message: `Esa hora no está disponible: ${bloque.motivoBloqueo ?? 'la cancha está cerrada'}.`,
      });
    }

    return { inicio: bloque.inicio, fin: bloque.fin, esPico: bloque.esPico };
  }

  /** Reservas activas del socio en ese día del club. */
  private contarDelDia(socioId: number, fecha: string): Promise<number> {
    return this.prisma.reserva.count({
      where: {
        socioId,
        estado: { in: ACTIVAS },
        inicio: {
          gte: instanteEnElClub(fecha, '00:00'),
          lt: instanteEnElClub(fecha, '24:00'),
        },
      },
    });
  }

  /**
   * Horas pico activas del socio en la semana del bloque, **lunes a domingo**.
   *
   * La semana se recorta en hora del club: contra el calendario UTC, las reservas del
   * domingo por la noche caerían en la semana siguiente y el cupo se renovaría solo.
   */
  private contarPicoDeLaSemana(
    socioId: number,
    fecha: string,
  ): Promise<number> {
    const { lunes, siguienteLunes } = semanaDelClub(fecha);

    return this.prisma.reserva.count({
      where: {
        socioId,
        esPico: true,
        estado: { in: ACTIVAS },
        inicio: {
          gte: instanteEnElClub(lunes, '00:00'),
          lt: instanteEnElClub(siguienteLunes, '00:00'),
        },
      },
    });
  }

  /**
   * Dónde están comprometidos esos socios en el rango del bloque, como titulares o
   * como acompañantes declarados.
   */
  private async ocupacionesEnElRango(
    socioIds: number[],
    inicio: Date,
    fin: Date,
  ): Promise<OcupacionDeSocio[]> {
    // Solapamiento por rango: `inicio < finOtro && fin > inicioOtro`.
    const reservas = await this.prisma.reserva.findMany({
      where: {
        estado: { in: ACTIVAS },
        inicio: { lt: fin },
        fin: { gt: inicio },
        OR: [
          { socioId: { in: socioIds } },
          { acompanantes: { some: { socioId: { in: socioIds } } } },
        ],
      },
      select: {
        inicio: true,
        fin: true,
        socioId: true,
        cancha: { select: { nombre: true } },
        socio: { select: { usuario: { select: { nombre: true } } } },
        acompanantes: {
          select: {
            socioId: true,
            socio: { select: { usuario: { select: { nombre: true } } } },
          },
        },
      },
    });

    return reservas.flatMap((reserva) => {
      const involucrados = [
        ...(reserva.socioId !== null
          ? [
              {
                socioId: reserva.socioId,
                nombre: reserva.socio?.usuario.nombre ?? 'Otro socio',
              },
            ]
          : []),
        ...reserva.acompanantes
          .filter((a) => a.socioId !== null)
          .map((a) => ({
            socioId: a.socioId!,
            nombre: a.socio?.usuario.nombre ?? 'Otro socio',
          })),
      ];

      return involucrados
        .filter((quien) => socioIds.includes(quien.socioId))
        .map((quien) => ({
          ...quien,
          cancha: reserva.cancha.nombre,
          inicio: reserva.inicio,
          fin: reserva.fin,
        }));
    });
  }
}

/** La fecha civil del club de un instante, "AAAA-MM-DD". */
function fechaCivilDelClub(instante: Date): string {
  return hoyEnElClub(instante).toISOString().slice(0, 10);
}

/** El lunes de esa semana y el lunes siguiente, como fechas civiles. */
function semanaDelClub(fecha: string): {
  lunes: string;
  siguienteLunes: string;
} {
  const dia = new Date(`${fecha}T00:00:00.000Z`);
  // `getUTCDay` da 0 para domingo; la semana del club corre de lunes a domingo.
  const desdeElLunes = (dia.getUTCDay() + 6) % 7;
  const lunes = new Date(dia.getTime() - desdeElLunes * 24 * 60 * 60 * 1000);
  const siguiente = new Date(lunes.getTime() + 7 * 24 * 60 * 60 * 1000);

  return {
    lunes: lunes.toISOString().slice(0, 10),
    siguienteLunes: siguiente.toISOString().slice(0, 10),
  };
}

function socioIdsDe(acompanantes: AcompananteDeclarado[]): number[] {
  return acompanantes
    .map((a) => a.socioId)
    .filter((id): id is number => id != null);
}
