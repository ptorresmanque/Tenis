import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { DuracionMin } from '../catalogo-canchas/bloques';
import { DisponibilidadService } from '../catalogo-canchas/disponibilidad.service';
import { hoyEnElClub, instanteEnElClub } from '../comun/tiempo';
import {
  EstadoCuota,
  EstadoReserva,
  EstadoSocio,
  Prisma,
  TipoCuota,
} from '../generated/prisma/client';
import { UsuarioActual } from '../identidad/usuario-actual';
import { reintentarSiHayDeadlock } from '../prisma/errores';
import { PrismaService } from '../prisma/prisma.service';
import {
  AcompananteDeclarado,
  evaluarReservaDeSocio,
  OcupacionDeSocio,
  Rechazo,
  SocioQueReserva,
} from './cupo';
import { invitadosAnteriores, mesDelClub } from './invitados';
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
  /** 1 hora o 1 hora y media (T83b). El socio no paga, así que no necesita precio. */
  duracionMin: DuracionMin;
  acompanantes: AcompananteDeclarado[];
}

export interface ReservaCreada {
  id: number;
  folio: string;
  /** La llave de su página pública: el socio también tiene su QR. */
  token: string;
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
   *
   * `tomableHasta` lo cambia solo el mesón (`ReservaDelAdminService`).
   */
  async reservarComoSocio(
    yo: UsuarioActual,
    datos: ReservaDeSocio,
    ahora = new Date(),
    tomableHasta: TomableHasta = 'inicio',
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
      ahora,
      tomableHasta,
      datos.duracionMin,
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
      // "cero reservas ese día" y las dos pasan: el bloque no se duplica —de eso se
      // encarga el índice único— pero el socio termina con dos horas y otro se queda sin
      // cupo.
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
        token: reserva.token,
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
   * peticiones simultáneas no leen las dos "cero reservas ese día". Al mover no hace falta: la
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

    // La configuración va primero y no dentro del `Promise.all`: el corte de la
    // incorporación sale de acá, y consultarla dos veces —una para el corte y otra
    // para los cupos— es una ida más a la base en el camino más caliente del sistema.
    const config = await db.configuracionClub.findFirstOrThrow();

    const [
      reservasDelDia,
      reservasPicoDeLaSemana,
      reservasConInvitadosDelMes,
      ocupados,
      incorporacionPendiente,
    ] = await Promise.all([
      this.contarDelDia(db, socio.id, fecha, excluyendo),
      this.contarPicoDeLaSemana(db, socio.id, fecha, excluyendo),
      this.contarReservasConInvitadosDelMes(db, socio.id, fecha, excluyendo),
      this.ocupacionesEnElRango(
        db,
        [socio.id, ...socioIdsDe(acompanantes)],
        bloque.inicio,
        bloque.fin,
        excluyendo,
      ),
      this.debeLaIncorporacion(db, socio.id, config.cobraIncorporacionDesde),
    ]);

    return evaluarReservaDeSocio({
      socio,
      bloque,
      hoyEnElClub: fechaCivilDelClub(new Date()),
      config,
      reservasDelDia,
      reservasPicoDeLaSemana,
      reservasConInvitadosDelMes,
      incorporacionPendiente,
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
    // La transacción entera se repite si la base la aborta por deadlock: el índice
    // por rango de `reserva` bloquea tramos (T76), y lo que se haya evaluado o escrito
    // adentro se revirtió con ella, así que repetirla es empezar de cero.
    return reintentarSiHayDeadlock(() =>
      this.prisma.$transaction(async (tx) => {
        await this.bloquearAlSocio(tx, socioId);

        return trabajo(tx);
      }),
    );
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
   *
   * **Y tiene que estar activo.** Un acompañante con `socioId` no descuenta invitados
   * del mes (`cupo.ts`, `esInvitadoExterno`), así que el número de alguien retirado o
   * suspendido sería la puerta para meter gente sin tocar el cupo y sin límite. La
   * regla vive acá, en el único camino que crea reservas de socio: dejarla solo en la
   * lista que ofrece la interfaz es dejarla en el lado que no manda.
   */
  private async resolverNumerosDeSocio(
    acompanantes: AcompananteDeclarado[],
  ): Promise<AcompananteDeclarado[]> {
    return Promise.all(
      acompanantes.map(async (acompanante) => {
        if (!acompanante.numeroSocio) return acompanante;

        const socio = await this.prisma.socio.findUnique({
          where: { numeroSocio: acompanante.numeroSocio },
          select: { id: true, estado: true },
        });

        if (!socio) {
          throw new NotFoundException(
            `No hay ningún socio con el número ${acompanante.numeroSocio}.`,
          );
        }

        if (socio.estado !== EstadoSocio.ACTIVO) {
          // 409 con motivo, como el resto de los rechazos de negocio: la SPA ya sabe
          // mostrar este mensaje tal cual viene escrito.
          throw new ConflictException({
            motivo: 'ACOMPANANTE_NO_ACTIVO',
            message:
              `El socio ${acompanante.numeroSocio} no tiene la membresía activa: ` +
              'no puede entrar como acompañante. Puedes declararlo como invitado, ' +
              'que descuenta de tus invitados del mes.',
          });
        }

        return { socioId: socio.id };
      }),
    );
  }

  /**
   * Los invitados que el socio declaró en sus reservas, para sugerírselos al reservar
   * (T106). Solo los externos: un compañero socio se elige de la lista de socios.
   *
   * Por id descendente, que es el orden en que se declararon: el acompañante se crea con
   * su reserva y no se edita. Incluye los de reservas canceladas, porque el invitado
   * sigue siendo alguien con quien el socio juega.
   */
  async misInvitados(socioId: number): Promise<string[]> {
    const filas = await this.prisma.acompananteReserva.findMany({
      where: { reserva: { socioId }, nombre: { not: null } },
      select: { nombre: true },
      orderBy: { id: 'desc' },
      // ponytail: las 200 declaraciones más recientes; un invitado que no aparece en
      // ellas lleva años sin venir. Paginar si algún socio llega a echarlo de menos.
      take: 200,
    });

    return invitadosAnteriores(filas.flatMap(({ nombre }) => nombre ?? []));
  }

  /**
   * Lo que el socio ya lleva usado, para mostrarlo antes de tomarle una hora.
   *
   * Las tres cuentas son las mismas que evalúa `evaluarParaSocio`; acá salen a la
   * superficie sin decidir nada. Quien decide sigue siendo la evaluación completa
   * en el momento de crear: entre que el mesón mira esto y aprieta "Reservar" el
   * socio pudo tomar una hora desde su teléfono.
   */
  async ocupacionDelSocio(
    socioId: number,
    fecha: string,
  ): Promise<{
    reservasDelDia: number;
    reservasPicoDeLaSemana: number;
    reservasConInvitadosDelMes: number;
  }> {
    const [reservasDelDia, reservasPicoDeLaSemana, reservasConInvitadosDelMes] =
      await Promise.all([
        this.contarDelDia(this.prisma, socioId, fecha),
        this.contarPicoDeLaSemana(this.prisma, socioId, fecha),
        this.contarReservasConInvitadosDelMes(this.prisma, socioId, fecha),
      ]);

    return {
      reservasDelDia,
      reservasPicoDeLaSemana,
      reservasConInvitadosDelMes,
    };
  }

  /**
   * La hora que el club toma en el mesón, a nombre de quien no es socio.
   *
   * **Nace confirmada y sin transacción**: el cobro pasa en el mostrador, no por
   * Webpay. Es el único camino en que una reserva de no-socio queda confirmada sin
   * pago registrado, y existe porque el club atiende gente que llega en persona.
   * Por lo mismo, la hora se puede tomar mientras no termine.
   */
  async reservarComoVisitanteDelMeson(
    datos: {
      canchaId: number;
      inicio: Date;
      duracionMin: DuracionMin;
      nombre: string;
      email: string;
      telefono: string;
    },
    ahora = new Date(),
  ): Promise<ReservaCreada> {
    // Sin mirar el precio: se cobra en el mostrador, así que la franja sin precio de 1
    // hora y media no lo impide (T85).
    const bloque = await this.bloqueDeLaGrilla(
      datos.canchaId,
      fechaCivilDelClub(datos.inicio),
      datos.inicio,
      ahora,
      'fin',
      datos.duracionMin,
    );

    try {
      const reserva = await this.reservas.crear({
        canchaId: datos.canchaId,
        inicio: bloque.inicio,
        fin: bloque.fin,
        esPico: bloque.esPico,
        estado: EstadoReserva.CONFIRMADA,
        socioId: null,
        nombre: datos.nombre,
        email: datos.email,
        telefono: datos.telefono,
      });

      return {
        id: reserva.id,
        folio: reserva.folio,
        token: reserva.token,
        canchaId: reserva.canchaId,
        inicio: reserva.inicio,
        fin: reserva.fin,
        esPico: reserva.esPico,
      };
    } catch (error) {
      if (error instanceof BloqueTomado) {
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
    ahora: Date,
    tomableHasta: TomableHasta,
    duracionMin: DuracionMin,
  ): Promise<{ inicio: Date; fin: Date; esPico: boolean }> {
    const bloques = await this.disponibilidad.de(canchaId, fecha, duracionMin);
    const bloque = bloques.find((b) => b.inicio.getTime() === inicio.getTime());

    if (!bloque) {
      throw new NotFoundException(
        'Esa hora no está en el horario de la cancha.',
      );
    }

    rechazarSiYaPaso(bloque, ahora, tomableHasta);

    if (bloque.bloqueado) {
      throw new ConflictException({
        motivo: 'BLOQUE_NO_DISPONIBLE',
        message: `Esa hora no está disponible: ${bloque.motivoBloqueo ?? 'la cancha está cerrada'}.`,
      });
    }

    return { inicio: bloque.inicio, fin: bloque.fin, esPico: bloque.esPico };
  }

  /**
   * Si le falta pagar la cuota de incorporación (T42).
   *
   * **La regla no depende de que la fila exista**, y esa es la parte que importa: las
   * cuotas se emiten cuando alguien las mira, así que un socio recién dado de alta
   * todavía no tiene la suya. Preguntando por la fila, ese socio podría reservar
   * hasta que al club se le ocurriera abrir el panel.
   *
   * Se resuelve al revés: **le corresponde** —ingresó después de la puesta en marcha—
   * **y no hay ninguna resuelta**. Pagada la deja pasar; anulada también, porque
   * anular es decir que no le correspondía.
   *
   * Se consulta y no se guarda en la ficha: un booleano en `Socio` sería un dato
   * derivado que hay que mantener en acuerdo con `cuotas`, y el día que se
   * desincronicen gana el equivocado.
   */
  private async debeLaIncorporacion(
    db: ClienteDePrisma,
    socioId: number,
    cobraDesde: Date,
  ): Promise<boolean> {
    // Una sola consulta: la fecha de ingreso y si tiene alguna resuelta vienen juntas.
    // `take: 1` porque la pregunta es si existe, no cuántas.
    const socio = await db.socio.findUniqueOrThrow({
      where: { id: socioId },
      select: {
        fechaIngreso: true,
        cuotas: {
          where: {
            tipo: TipoCuota.INCORPORACION,
            estado: { in: [EstadoCuota.PAGADA, EstadoCuota.ANULADA] },
          },
          select: { id: true },
          take: 1,
        },
      },
    });

    return socio.fechaIngreso >= cobraDesde && socio.cuotas.length === 0;
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
   * Reservas pico activas del socio en la semana del bloque, **lunes a domingo**.
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
   * Reservas del socio, en el mes del bloque, con al menos un invitado externo.
   *
   * **Cuenta reservas y no personas** (A5, decisión del club del 2026-10-08): un dobles
   * con tres invitados gasta un cupo, igual que uno con un invitado.
   *
   * **El mes del bloque y no el de hoy**, igual que el cupo diario y el pico: quien
   * reserva en agosto una hora de septiembre gasta un cupo de septiembre, que es el mes
   * en que va a traer a esa gente.
   *
   * Un invitado es un acompañante con nombre: por eso los acompañantes son una tabla y
   * no una columna de texto (`SPEC-reservas.md` § Modelo de datos).
   */
  private contarReservasConInvitadosDelMes(
    db: ClienteDePrisma,
    socioId: number,
    fecha: string,
    excluyendo?: number,
  ): Promise<number> {
    const { desde, hasta } = mesDelClub(fecha);

    return db.reserva.count({
      where: {
        socioId,
        id: excluyendo ? { not: excluyendo } : undefined,
        estado: { in: ACTIVAS },
        inicio: {
          gte: instanteEnElClub(desde, '00:00'),
          lt: instanteEnElClub(hasta, '00:00'),
        },
        acompanantes: { some: { nombre: { not: null } } },
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

/**
 * Hasta qué borde del bloque se puede tomar. El socio y el visitante, hasta que
 * empieza; el mesón, hasta que termina, porque atiende a quien llega en persona y
 * quiere jugar la hora que está corriendo.
 */
export type TomableHasta = 'inicio' | 'fin';

/**
 * Rechaza un bloque que ya pasó su borde.
 *
 * El catálogo calcula los bloques del día que se le pida, incluidos los que ya
 * pasaron: la grilla los necesita para contar lo ocupado y el socio para reportar
 * una hora no usada. Por eso el corte va al tomar la hora y no en el catálogo, y
 * vive en un solo lugar porque reservar y mover tienen que decir lo mismo.
 *
 * El borde cuenta en contra: a las 16:00 en punto, la de las 16:00 ya empezó.
 */
export function rechazarSiYaPaso(
  bloque: { inicio: Date; fin: Date },
  ahora: Date,
  tomableHasta: TomableHasta = 'inicio',
): void {
  if (bloque[tomableHasta].getTime() > ahora.getTime()) return;

  throw new ConflictException({
    motivo: 'BLOQUE_EN_EL_PASADO',
    message:
      tomableHasta === 'inicio'
        ? 'Esa hora ya pasó. Elige una que todavía no haya empezado.'
        : 'Esa hora ya terminó.',
  });
}

/** La fecha civil del club de un instante, "AAAA-MM-DD". */
export function fechaCivilDelClub(instante: Date): string {
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
