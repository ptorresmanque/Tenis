import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DisponibilidadService } from '../catalogo-canchas/disponibilidad.service';
import { hoyEnElClub, instanteEnElClub } from '../comun/tiempo';
import { EstadoReserva, Prisma } from '../generated/prisma/client';
import { UsuarioActual } from '../identidad/usuario-actual';
import { PrismaService } from '../prisma/prisma.service';
import {
  AcompananteDeclarado,
  evaluarReservaDeSocio,
  OcupacionDeSocio,
  Rechazo,
  SocioQueReserva,
} from './cupo';
import { mesDelClub } from './invitados';
import { BloqueTomado, ReservaRepository } from './reserva.repository';

/**
 * El cliente de Prisma o el de una transacción en curso: los dos saben consultar.
 *
 * Las consultas de cupo lo reciben para poder correr **dentro** de la transacción que
 * tomó el lock; con el cliente de fuera contarían lo de antes y el lock no serviría.
 */
export type ClienteDePrisma = PrismaService | Prisma.TransactionClient;

/** Los estados en que una reserva ocupa la cancha y cuenta para los cupos. */
export const ACTIVAS = [EstadoReserva.PENDIENTE_PAGO, EstadoReserva.CONFIRMADA];

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

    const acompanantes = await this.resolverNumerosDeSocio(datos.acompanantes);
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
        // La sanción por una hora no usada se evalúa junto al resto (T34).
        sancionadoHasta: true,
        // El teléfono viaja a la reserva para que el panel del admin sepa a quién
        // llamar sin ir a buscar la ficha. `UsuarioActual` no lo trae: es un dato
        // de contacto, no de autorización.
        usuario: { select: { telefono: true } },
      },
    });

    try {
      // **Evaluar y crear en la misma transacción, con las reservas del socio
      // bloqueadas.** Sin esto, dos pestañas apretando "Reservar" a la vez leen las dos
      // "cero horas hoy" y las dos pasan: el bloque no se duplica —de eso se encarga el
      // índice único— pero el socio termina con dos horas y otro se queda sin cupo.
      const reserva = await this.conElSocioBloqueado(socio.id, async (tx) => {
        const rechazo = await this.evaluarParaSocio({
          socio,
          bloque,
          acompanantes,
          db: tx,
        });

        if (rechazo) {
          // 409 y no 403: no es un problema de permisos sino del estado de las cosas —
          // el cupo de hoy, la cuota, otra cancha a la misma hora.
          throw new ConflictException({
            motivo: rechazo.tipo,
            message: rechazo.mensaje,
          });
        }

        return this.reservas.crear(
          {
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
            acompanantes,
          },
          tx,
        );
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
   * Las reglas del socio para un bloque, con los datos que necesitan ya reunidos.
   *
   * Vive acá y no en cada quien la use porque **mover una reserva es reservar otra vez**:
   * el mismo cupo diario, el mismo pico semanal, los mismos invitados. Sin este método
   * compartido, `modificar` sería una segunda versión de las reglas y una de las dos
   * quedaría vieja.
   *
   * `excluyendo` es la reserva que se está moviendo: si se contara a sí misma, el cupo
   * diario de una hora haría imposible cambiar de horario dentro del mismo día, y la
   * regla de "nadie en dos canchas a la vez" la rechazaría por estar donde está.
   *
   * Al crear se llama **dentro de la transacción que bloqueó la ficha del socio**, con
   * `db` apuntando a ella: así el conteo ve lo que esa transacción tiene tomado y dos
   * peticiones simultáneas no leen las dos "cero horas hoy". Al mover no hace falta: la
   * reserva ya existe y el bloque lo defiende el índice único.
   */
  async evaluarParaSocio(entrada: {
    socio: SocioQueReserva;
    bloque: { inicio: Date; fin: Date; esPico: boolean };
    acompanantes: AcompananteDeclarado[];
    excluyendo?: number;
    /** Dentro de una transacción, para que el conteo vea lo que esa transacción bloqueó. */
    db?: ClienteDePrisma;
  }): Promise<Rechazo | null> {
    const { socio, bloque, acompanantes, excluyendo } = entrada;
    const db = entrada.db ?? this.prisma;
    const fecha = fechaCivilDelClub(bloque.inicio);

    const [reservasDelDia, horasPicoDeLaSemana, invitadosDelMes, ocupados] =
      await Promise.all([
        this.contarDelDia(db, socio.id, fecha, excluyendo),
        this.contarPicoDeLaSemana(db, socio.id, fecha, excluyendo),
        this.contarInvitadosDelMes(db, socio.id, fecha, excluyendo),
        this.ocupacionesEnElRango(
          db,
          [socio.id, ...socioIdsDe(acompanantes)],
          bloque.inicio,
          bloque.fin,
          excluyendo,
        ),
      ]);

    const config = await db.configuracionClub.findFirstOrThrow();

    return evaluarReservaDeSocio({
      socio,
      bloque,
      hoyEnElClub: fechaCivilDelClub(new Date()),
      config,
      reservasDelDia,
      horasPicoDeLaSemana,
      invitadosDelMes,
      acompanantes,
      ocupados,
    });
  }

  /**
   * Corre `trabajo` con la ficha del socio bloqueada, en una sola transacción.
   *
   * Lo usan los dos caminos que tocan sus cupos —reservar y mover—: si cada uno
   * armara su transacción, la próxima operación que se agregue va a olvidarse.
   */
  async conElSocioBloqueado<T>(
    socioId: number,
    trabajo: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await this.bloquearAlSocio(tx, socioId);

      return trabajo(tx);
    });
  }

  /**
   * Serializa las reservas de un socio bloqueando **su propia ficha**.
   *
   * La fila de `socio` hace de cerrojo: existe siempre, se toma por clave primaria y
   * cada socio tiene la suya, así que dos peticiones del mismo se ponen en fila y las
   * de socios distintos no se cruzan.
   *
   * **No se bloquean sus reservas.** Fue el primer intento y produce deadlocks: sobre
   * un socio sin reservas, el `FOR UPDATE` no encuentra filas pero deja un gap lock en
   * el índice; los gap locks son compatibles entre sí, así que las dos transacciones lo
   * toman y después cada `INSERT` espera al de la otra. MariaDB mata a una con
   * "Deadlock found when trying to get lock", que es un 500 en la cara de alguien que
   * solo quería una cancha.
   *
   * Va por SQL crudo porque Prisma no expone `FOR UPDATE`. El id viaja parametrizado
   * —`$queryRaw` con plantilla, no concatenación—, así que no hay SQL armado a mano.
   */
  private async bloquearAlSocio(
    tx: Prisma.TransactionClient,
    socioId: number,
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM socio WHERE id = ${socioId} FOR UPDATE`;
  }

  /**
   * Traduce los números de socio a ids.
   *
   * La persona declara "socio 214", que es lo que sabe; el id interno no lo conoce
   * nadie fuera de la base. Un número que no existe se rechaza acá con su mensaje, y
   * no como un acompañante que misteriosamente no cuenta.
   */
  private async resolverNumerosDeSocio(
    acompanantes: AcompananteDeclarado[],
  ): Promise<AcompananteDeclarado[]> {
    return Promise.all(
      acompanantes.map(async (acompanante) => {
        if (!acompanante.numeroSocio) return acompanante;

        const socio = await this.prisma.socio.findUnique({
          where: { numeroSocio: acompanante.numeroSocio },
          select: { id: true },
        });

        if (!socio) {
          throw new NotFoundException(
            `No hay ningún socio con el número ${acompanante.numeroSocio}.`,
          );
        }

        return { socioId: socio.id };
      }),
    );
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
  private contarDelDia(
    db: ClienteDePrisma,
    socioId: number,
    fecha: string,
    excluyendo?: number,
  ): Promise<number> {
    return db.reserva.count({
      where: {
        socioId,
        id: excluyendo ? { not: excluyendo } : undefined,
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
    db: ClienteDePrisma,
    socioId: number,
    fecha: string,
    excluyendo?: number,
  ): Promise<number> {
    const { lunes, siguienteLunes } = semanaDelClub(fecha);

    return db.reserva.count({
      where: {
        socioId,
        id: excluyendo ? { not: excluyendo } : undefined,
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
   * Invitados externos que el socio ya registró en el mes del bloque.
   *
   * **El mes del bloque y no el de hoy**, igual que el cupo diario y el pico: quien
   * reserva en agosto una hora de septiembre gasta un invitado de septiembre, que es
   * el mes en que va a traer a esa persona.
   *
   * Cuenta filas de `AcompananteReserva` con nombre: por eso los acompañantes son una
   * tabla y no una columna de texto (`SPEC-reservas.md` § Modelo de datos).
   */
  private contarInvitadosDelMes(
    db: ClienteDePrisma,
    socioId: number,
    fecha: string,
    excluyendo?: number,
  ): Promise<number> {
    const { desde, hasta } = mesDelClub(fecha);

    return db.acompananteReserva.count({
      where: {
        nombre: { not: null },
        reserva: {
          socioId,
          id: excluyendo ? { not: excluyendo } : undefined,
          estado: { in: ACTIVAS },
          inicio: {
            gte: instanteEnElClub(desde, '00:00'),
            lt: instanteEnElClub(hasta, '00:00'),
          },
        },
      },
    });
  }

  /**
   * Dónde están comprometidos esos socios en el rango del bloque, como titulares o
   * como acompañantes declarados.
   */
  private async ocupacionesEnElRango(
    db: ClienteDePrisma,
    socioIds: number[],
    inicio: Date,
    fin: Date,
    excluyendo?: number,
  ): Promise<OcupacionDeSocio[]> {
    // Solapamiento por rango: `inicio < finOtro && fin > inicioOtro`.
    const reservas = await db.reserva.findMany({
      where: {
        id: excluyendo ? { not: excluyendo } : undefined,
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
