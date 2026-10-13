import { ConflictException } from '@nestjs/common';

import {
  comoFechaCivil,
  hoyEnElClub,
  instanteEnElClub,
  ZONA_DEL_CLUB,
} from '../comun/tiempo';
import { ENCIENDEN_LA_LUZ } from '../catalogo-canchas/admin.dto';
import { EstadoReserva, Prisma } from '../generated/prisma/client';

/**
 * El tope de canchas con luz encendida (T203, `SPEC-reservas.md` § Tope de canchas con
 * luz).
 *
 * La instalación eléctrica del club se corta cuando hay más de dos canchas iluminadas a
 * la vez, y se corta para todas. Desde `topeCanchasConLuzDesde` y hasta el cierre, ninguna
 * escritura puede dejar más canchas con luz ocupadas que `topeCanchasConLuz`: ni una
 * reserva, ni una clase, ni un partido. No hay "forzar", tampoco para el admin.
 *
 * Es un archivo y no un servicio porque lo llaman caminos que ya tienen su transacción en
 * la mano —crear, mover, la vuelta de una diferencia y el cierre de una cancha— y el
 * conteo tiene que correr adentro de esa transacción, no en una propia.
 */

/** Algo que tiene una cancha ocupada en un rango: una reserva activa o un bloqueo. */
export interface Ocupacion {
  canchaId: number;
  nombre: string;
  inicio: Date;
  fin: Date;
}

export interface CanchaOcupada {
  canchaId: number;
  nombre: string;
}

/** El instante con más canchas con luz ocupadas, y cuáles son. */
export interface PeorInstante {
  instante: Date;
  canchas: CanchaOcupada[];
}

/** Lo que se va a escribir: una cancha en un rango. */
export interface OcupacionNueva {
  canchaId: number;
  inicio: Date;
  fin: Date;
}

export interface OpcionesDelTope {
  /** La reserva que se mueve: su hora de antes no se cuenta contra la nueva. */
  ignorarReservaId?: number;
  /** El bloqueo que se reemplaza al mover una clase o un partido. */
  ignorarBloqueoId?: number;
}

const HORA = new Intl.DateTimeFormat('es-CL', {
  timeZone: ZONA_DEL_CLUB,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** Las reservas activas: las mismas que ocupan el índice por rango. */
const ACTIVAS = [EstadoReserva.PENDIENTE_PAGO, EstadoReserva.CONFIRMADA];

/**
 * La reserva más larga que existe, 1 hora y media (`duracion.ts`). Acota hacia atrás la
 * lectura con candado: sin ese borde, `inicio < hasta` recorre —y bloquea— toda la
 * historia de reservas del club.
 */
const RESERVA_MAS_LARGA_MS = 90 * 60_000;

/** Ya no queda cupo de luz a esa hora. */
export class TopeDeLuz extends Error {
  constructor(
    readonly instante: Date,
    readonly canchas: CanchaOcupada[],
    readonly tope: number,
  ) {
    // Al público no se le nombran canchas ni se le explica la instalación: solo ve este
    // mensaje quien perdió la carrera por la última cancha, porque la grilla ya la
    // muestra ocupada (decisión del club, 2026-10-13).
    super(
      'A esa hora ya están ocupadas todas las canchas con luz que el club puede encender. Elige otra hora.',
    );
    this.name = 'TopeDeLuz';
  }

  /** Para el admin, que tiene que entender por qué una cancha vacía no se puede tomar. */
  get paraElAdmin(): string {
    const nombres = this.canchas.map((c) => c.nombre);
    const lista =
      nombres.length > 1
        ? `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
        : nombres[0];
    const verbo = nombres.length > 1 ? 'ya están ocupadas' : 'ya está ocupada';

    return `A las ${HORA.format(this.instante)} ${verbo} ${lista}, y el tope de canchas con luz es ${this.tope}.`;
  }
}

/** El 409 que recibe quien choca con el tope. El mesón ve qué canchas lo llenan. */
export function conflictoDeLuz(
  error: TopeDeLuz,
  alAdmin: boolean,
): ConflictException {
  return new ConflictException({
    motivo: 'TOPE_DE_LUZ',
    message: alAdmin ? error.paraElAdmin : error.message,
  });
}

/**
 * La parte del rango que cae desde la hora del tope, o `null` si termina antes.
 *
 * La hora es la del reloj del club el día en que empieza el rango: la de 18:30 a 20:00
 * con el tope desde las 19:00 se mide de 19:00 a 20:00.
 */
export function parteLimitada(
  inicio: Date,
  fin: Date,
  desde: string,
): { desde: Date; hasta: Date } | null {
  const hora = instanteEnElClub(comoFechaCivil(hoyEnElClub(inicio)), desde);
  const comienzo = inicio > hora ? inicio : hora;

  return comienzo < fin ? { desde: comienzo, hasta: fin } : null;
}

/**
 * El instante de `[desde, hasta)` con más canchas ocupadas a la vez.
 *
 * La cuenta solo sube cuando algo empieza, así que basta con mirar el comienzo del rango y
 * cada inicio que cae adentro. Se mide en instantes y no en tramos de media hora: un
 * partido termina cuando el admin dice, aunque no sea en punto ni y media. Una cancha
 * cuenta una vez, tenga lo que tenga.
 */
export function peorInstante(
  ocupaciones: Ocupacion[],
  desde: Date,
  hasta: Date,
): PeorInstante | null {
  const candidatos = [
    desde,
    ...ocupaciones.map((o) => o.inicio).filter((t) => t > desde && t < hasta),
  ].sort((x, y) => x.getTime() - y.getTime());

  let peor: PeorInstante | null = null;

  for (const instante of candidatos) {
    const canchas = new Map<number, string>();

    for (const o of ocupaciones) {
      if (o.inicio <= instante && instante < o.fin) {
        canchas.set(o.canchaId, o.nombre);
      }
    }

    if (canchas.size > (peor?.canchas.length ?? 0)) {
      peor = {
        instante,
        canchas: [...canchas].map(([canchaId, nombre]) => ({
          canchaId,
          nombre,
        })),
      };
    }
  }

  return peor;
}

/**
 * Rechaza la escritura si encendería una cancha más que el tope.
 *
 * Va **adentro de la transacción que escribe** y en este orden:
 *
 * 1. **El candado**, `FOR UPDATE` sobre la fila de `configuracion_club`. Serializa entre
 *    sí todas las escrituras sobre canchas con luz: sin él, dos personas que toman a la
 *    vez la 2 y la 3 cuentan las dos una ocupada y quedan tres encendidas, y el índice
 *    por rango no lo ve porque cada cancha tiene su clave. Se toma a cualquier hora:
 *    saber si la escritura cae en el tramo limitado exige leer la configuración, y leerla
 *    sin candado deja la carrera con el admin que la está cambiando.
 * 2. **El conteo, con lectura con candado** (`LOCK IN SHARE MODE`). En `REPEATABLE READ`
 *    una lectura común ve la foto que la transacción sacó en su primera lectura, y la del
 *    socio lee sus cupos antes de llegar acá: contaría sin ver a quien entró recién.
 */
export async function exigirCupoDeLuz(
  db: Prisma.TransactionClient,
  ocupacion: OcupacionNueva,
  opciones: OpcionesDelTope = {},
): Promise<void> {
  const lleno = await topeLleno(db, ocupacion, opciones, true);

  if (lleno) throw lleno;
}

/**
 * Lo mismo, sin candados y sin lanzar: para avisar antes de escribir —antes de mandar a
 * alguien a pagar a Webpay, por ejemplo—, nunca para decidir. Lo que decide es
 * `exigirCupoDeLuz`, dentro de la transacción que escribe.
 */
export function topeLlenoEn(
  db: Prisma.TransactionClient,
  ocupacion: OcupacionNueva,
  opciones: OpcionesDelTope = {},
): Promise<TopeDeLuz | null> {
  return topeLleno(db, ocupacion, opciones, false);
}

async function topeLleno(
  db: Prisma.TransactionClient,
  ocupacion: OcupacionNueva,
  opciones: OpcionesDelTope,
  conCandado: boolean,
): Promise<TopeDeLuz | null> {
  const cancha = await db.cancha.findUnique({
    where: { id: ocupacion.canchaId },
    select: { iluminacion: true },
  });

  // Una cancha sin luz no carga la instalación: ni cuenta ni se le aplica.
  if (!cancha?.iluminacion) return null;

  const tope = await leerTope(db, conCandado);
  if (!tope) return null;

  const parte = parteLimitada(ocupacion.inicio, ocupacion.fin, tope.desde);
  if (!parte) return null;

  const ocupaciones = await ocupacionesConLuz(db, parte, opciones, conCandado);
  const peor = excesoEn(ocupaciones, tope, ocupacion);

  return peor ? new TopeDeLuz(peor.instante, peor.canchas, tope.tope) : null;
}

/**
 * Para la grilla de un día (T207): dice si un inicio de una cancha ya no cabe en el tope.
 *
 * Lee todo lo del día de una vez —cuatro consultas por día y no por bloque— porque la
 * grilla pregunta por cada inicio de cada cancha. Sin candados: muestra, no decide.
 */
export async function lucesDelDia(
  db: Prisma.TransactionClient,
  fecha: string,
  opciones: OpcionesDelTope = {},
): Promise<(ocupacion: OcupacionNueva) => boolean> {
  const tope = await leerTope(db, false);

  if (!tope) return () => false;

  const conLuz = new Set(
    (
      await db.cancha.findMany({
        where: { iluminacion: true },
        select: { id: true },
      })
    ).map((c) => c.id),
  );
  const ocupaciones = await ocupacionesConLuz(
    db,
    {
      desde: instanteEnElClub(fecha, '00:00'),
      hasta: instanteEnElClub(fecha, '24:00'),
    },
    opciones,
    false,
  );

  return (ocupacion) =>
    conLuz.has(ocupacion.canchaId) &&
    excesoEn(ocupaciones, tope, ocupacion) !== null;
}

/** El tope configurado, o `null` si está apagado. */
async function leerTope(
  db: Prisma.TransactionClient,
  conCandado: boolean,
): Promise<{ tope: number; desde: string } | null> {
  const [configuracion] = await db.$queryRaw<
    { tope: number | null; desde: string }[]
  >`SELECT tope_canchas_con_luz AS tope, tope_canchas_con_luz_desde AS desde
      FROM configuracion_club WHERE id = 1
      ${conCandado ? Prisma.sql`FOR UPDATE` : Prisma.empty}`;

  return configuracion && configuracion.tope !== null
    ? { tope: Number(configuracion.tope), desde: configuracion.desde }
    : null;
}

/**
 * El peor instante de la parte limitada del rango, si ya tiene las canchas del tope. La
 * cancha propia no se cuenta: lo que hay en ella es lo que la ocupación reemplaza o choca
 * con el índice por rango, no una cancha más encendida.
 */
function excesoEn(
  ocupaciones: Ocupacion[],
  tope: { tope: number; desde: string },
  { canchaId, inicio, fin }: OcupacionNueva,
): PeorInstante | null {
  const parte = parteLimitada(inicio, fin, tope.desde);

  if (!parte) return null;

  const peor = peorInstante(
    ocupaciones.filter((o) => o.canchaId !== canchaId),
    parte.desde,
    parte.hasta,
  );

  return peor && peor.canchas.length >= tope.tope ? peor : null;
}

/** Lo que ocupa las canchas con luz en el rango. */
async function ocupacionesConLuz(
  db: Prisma.TransactionClient,
  { desde, hasta }: { desde: Date; hasta: Date },
  { ignorarReservaId = 0, ignorarBloqueoId = 0 }: OpcionesDelTope,
  conCandado: boolean,
): Promise<Ocupacion[]> {
  const desdeLaMasLarga = new Date(desde.getTime() - RESERVA_MAS_LARGA_MS);
  const candado = conCandado ? Prisma.sql`LOCK IN SHARE MODE` : Prisma.empty;

  const reservas = await db.$queryRaw<Ocupacion[]>`
    SELECT r.cancha_id AS canchaId, c.nombre AS nombre, r.inicio AS inicio, r.fin AS fin
      FROM reserva r JOIN cancha c ON c.id = r.cancha_id
     WHERE c.iluminacion = TRUE
       AND r.id <> ${ignorarReservaId}
       AND r.estado IN (${Prisma.join(ACTIVAS)})
       AND r.inicio > ${desdeLaMasLarga} AND r.inicio < ${hasta} AND r.fin > ${desde}
     ORDER BY c.orden, c.nombre
     ${candado}`;

  // Los bloqueos no tienen largo máximo —un torneo cierra el día entero— pero la tabla
  // es chica: se recorre sin borde hacia atrás.
  const bloqueos = await db.$queryRaw<Ocupacion[]>`
    SELECT b.cancha_id AS canchaId, c.nombre AS nombre, b.inicio AS inicio, b.fin AS fin
      FROM bloqueo b JOIN cancha c ON c.id = b.cancha_id
     WHERE c.iluminacion = TRUE
       AND b.id <> ${ignorarBloqueoId}
       AND b.motivo IN (${Prisma.join(ENCIENDEN_LA_LUZ)})
       AND b.inicio < ${hasta} AND b.fin > ${desde}
     ORDER BY c.orden, c.nombre
     ${candado}`;

  // El adaptador de MariaDB ya entrega las `DATETIME` como `Date` en UTC.
  return [...reservas, ...bloqueos];
}
