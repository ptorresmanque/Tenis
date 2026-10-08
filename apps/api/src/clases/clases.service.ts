import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DisponibilidadService } from '../catalogo-canchas/disponibilidad.service';
import type { DatosBloqueo } from '../catalogo-canchas/admin.dto';
import { instanteEnElClub } from '../comun/tiempo';
import { EstadoClase, MotivoBloqueo } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CierreDeCanchaService,
  type ReservaAfectada,
} from '../reservas/cierre-de-cancha.service';
import type {
  ClaseNueva,
  Decisiones,
  Movimiento,
  SerieNueva,
} from './clases.dto';
import { clasesDeLaSerie, type FechaDeLaSerie, repartirFechas } from './series';

/** Una clase de la agenda, como la mira quien atiende el mesón. */
export interface ClaseDelDia {
  id: number;
  cancha: string;
  profesor: string;
  inicio: Date;
  fin: Date;
  nivel: string;
  /// La agenda muestra las realizadas del día: son las que ya pasaron, no las que
  /// no existen. Lo que cambia es qué se puede hacer con ellas.
  estado: EstadoClase;
  cupoMaximo: number;
  notas: string | null;
}

/** Lo que deja una serie agendada (T114): sus clases, las fechas saltadas y lo cancelado. */
export interface SerieAgendada {
  id: number;
  clases: { id: number; fecha: string }[];
  saltadas: string[];
  canceladas: ReservaAfectada[];
}

export interface ClaseAgendada {
  id: number;
  bloqueoId: number;
  canceladas: ReservaAfectada[];
}

/**
 * Agendar una clase, que es cerrar la cancha con nombre y apellido.
 *
 * Hoy el club agenda cerrando la cancha a mano con un bloqueo de motivo `CLASE`. Eso
 * alcanza para que nadie reserve encima, pero el sistema no sabe que ahí hay una
 * clase: no sabe de quién, ni con cuántos alumnos, ni si alguien faltó.
 *
 * **La `Clase` y su `Bloqueo` se crean en la misma transacción.** Si falla la
 * segunda, no queda una clase con la cancha abierta —que es la clase a la que alguien
 * reserva encima— ni un bloqueo huérfano que nadie sabe por qué está ahí, que es
 * exactamente lo que pasa hoy cuando alguien bloquea y se olvida de anotar el motivo.
 *
 * Lo que estuviera reservado debajo lo resuelve la cascada de `reservas` (T36): se
 * cancela, se devuelve lo pagado y se avisa. **Una sola regla y no dos**: la clase no
 * es más blanda que la mantención, porque dos comportamientos para el mismo acto son
 * dos que alguien tiene que recordar cuál es cuál. Lo que protege al socio es que el
 * admin vea a quién va a afectar **antes** de confirmar.
 */
@Injectable()
export class Clases {
  constructor(
    private readonly prisma: PrismaService,
    private readonly disponibilidad: DisponibilidadService,
    private readonly cierres: CierreDeCanchaService,
  ) {}

  /** A quién le quitaría la hora, sin escribir nada. El paso previo a confirmar. */
  async afectadas(datos: ClaseNueva): Promise<ReservaAfectada[]> {
    await this.exigirRangoUsable(datos.canchaId, datos.fecha, datos);

    return this.cierres.afectadas(this.comoBloqueo(datos, datos.canchaId));
  }

  /**
   * Lo que una serie generaría, fecha por fecha, sin escribir nada (T113).
   *
   * Un choque es un dato de su fecha y no un error de la serie: el admin decide fecha por
   * fecha si la salta o cancela lo que haya (decisión 9, T114).
   *
   * ponytail: dos o tres consultas por fecha. Con el tope de 6 meses son unas 50 fechas para
   * una serie de dos días a la semana, y hasta 180 si es diaria; si eso se nota, juntar las
   * reservas y los bloqueos de todo el rango en una consulta.
   */
  async simularSerie(serie: SerieNueva): Promise<FechaDeLaSerie[]> {
    await this.elProfesor(serie.profesorId);

    const fechas: FechaDeLaSerie[] = [];

    for (const clase of clasesDeLaSerie(serie)) {
      const choque = await this.choqueDelRango(
        clase.canchaId,
        clase.fecha,
        clase,
      );
      // Fuera del horario no hay bloqueo posible, y por eso tampoco reservas que cancelar.
      const afectadas =
        choque instanceof NotFoundException
          ? []
          : await this.cierres.afectadas(
              this.comoBloqueo(clase, clase.canchaId),
            );

      fechas.push({
        fecha: clase.fecha,
        inicio: clase.inicio,
        fin: clase.fin,
        choque: choque?.message ?? null,
        afectadas,
      });
    }

    return fechas;
  }

  /**
   * Agenda la serie con las decisiones del admin (T114).
   *
   * **Se vuelve a simular al confirmar**, contra la base de ahora y no contra lo que el
   * admin miró: si apareció una reserva en una fecha sin decisión, `repartirFechas` rechaza
   * la serie entera antes de escribir nada. Después, cada fecha pasa por `agendar`, la misma
   * cascada de una clase suelta: cancela, devuelve y avisa.
   *
   * Las saltadas no se guardan aparte: son las fechas de la regla que no tienen clase.
   *
   * Entre la revisión y cada cierre queda una ventana de milisegundos, la misma que tiene la
   * clase suelta entre su simulación y su confirmación: una reserva tomada justo ahí la
   * cancela la cascada, que vuelve a consultar dentro de su transacción.
   *
   * ponytail: no es atómica entre fechas. Cada una cierra en su transacción porque las
   * devoluciones salen a la pasarela, que no entra en una transacción de la base. Si una
   * fecha falla a mitad de camino —un pago que empezó en ese momento, un cierre nuevo—, las
   * anteriores quedan agendadas y atadas a la serie, y el error lo dice.
   */
  async agendarSerie(
    serie: SerieNueva,
    decisiones: Decisiones,
  ): Promise<SerieAgendada> {
    const fechas = await this.simularSerie(serie);
    const { agendar, saltadas } = repartirFechas(fechas, decisiones);

    const { id } = await this.prisma.serieDeClases.create({
      data: {
        profesorId: serie.profesorId,
        canchaId: serie.canchaId,
        diasSemana: serie.diasSemana.join(','),
        horaDesde: serie.horaDesde,
        horaHasta: serie.horaHasta,
        desde: new Date(`${serie.desde}T00:00:00.000Z`),
        hasta: new Date(`${serie.hasta}T00:00:00.000Z`),
        cupoMaximo: serie.cupoMaximo,
        nivel: serie.nivel,
        notas: serie.notas,
      },
      select: { id: true },
    });

    const clases: SerieAgendada['clases'] = [];
    const canceladas: ReservaAfectada[] = [];

    for (const clase of clasesDeLaSerie(serie)) {
      if (!agendar.includes(clase.fecha)) continue;

      const agendada = await this.agendar(clase, id);
      clases.push({ id: agendada.id, fecha: clase.fecha });
      canceladas.push(...agendada.canceladas);
    }

    return { id, clases, saltadas, canceladas };
  }

  /** @param serieId La serie que la agenda, si viene de una (T114). */
  async agendar(
    datos: ClaseNueva,
    serieId: number | null = null,
  ): Promise<ClaseAgendada> {
    const profesor = await this.elProfesor(datos.profesorId);
    await this.exigirRangoUsable(datos.canchaId, datos.fecha, datos);

    let claseId = 0;

    const { bloqueoId, canceladas } = await this.cierres.cerrar(
      this.comoBloqueo(datos, datos.canchaId, profesor.nombreVisible),
      async (tx, bloqueo) => {
        const clase = await tx.clase.create({
          data: {
            profesorId: datos.profesorId,
            canchaId: datos.canchaId,
            inicio: datos.inicio,
            fin: datos.fin,
            cupoMaximo: datos.cupoMaximo,
            nivel: datos.nivel,
            notas: datos.notas,
            bloqueoId: bloqueo,
            serieId,
          },
          select: { id: true },
        });

        claseId = clase.id;
      },
    );

    return { id: claseId, bloqueoId, canceladas };
  }

  /**
   * Mueve la clase de hora o de cancha, conservando su id y sus inscritos.
   *
   * Mover es agendar de nuevo: la hora nueva pasa por la misma cascada, porque puede
   * tener a alguien debajo igual que la primera vez. El bloqueo viejo se borra
   * **dentro de la misma transacción** que crea el nuevo, o la cancha queda cerrada
   * en dos horas por una clase que solo se da en una.
   */
  async mover(id: number, adonde: Movimiento): Promise<ClaseAgendada> {
    const clase = await this.laClase(id);
    const canchaId = adonde.canchaId ?? clase.canchaId;

    await this.exigirRangoUsable(
      canchaId,
      adonde.fecha,
      adonde,
      // El bloqueo de la propia clase no cuenta como choque: si contara, extender una
      // clase de una hora a dos chocaría consigo misma.
      clase.bloqueoId,
    );

    const viejo = clase.bloqueoId;

    const { bloqueoId, canceladas } = await this.cierres.cerrar(
      this.comoBloqueo(
        { ...adonde, nivel: clase.nivel },
        canchaId,
        clase.profesor.nombreVisible,
      ),
      async (tx, bloqueo) => {
        await tx.clase.update({
          where: { id },
          data: {
            canchaId,
            inicio: adonde.inicio,
            fin: adonde.fin,
            bloqueoId: bloqueo,
          },
        });

        if (viejo !== null) {
          await tx.bloqueo.delete({ where: { id: viejo } });
        }
      },
    );

    return { id, bloqueoId, canceladas };
  }

  /**
   * Cancela la clase y le devuelve la hora a la cancha.
   *
   * **Las reservas que la clase canceló al agendarse no vuelven.** Deshacerlas sería
   * devolverle a alguien una hora que ya reorganizó y, si había pagado, volver a
   * cobrarle. El club llama si quiere ofrecérsela de nuevo.
   *
   * **Qué bloqueo borrar se lee dentro de la transacción**, no antes: entre leerlo y
   * borrarlo cabe un movimiento de la clase, y entonces se borraría un bloqueo que ya
   * no es el suyo —o uno que ya no existe—. Es la misma lección de T37.
   */
  async cancelar(id: number, motivo: string): Promise<{ id: number }> {
    await this.prisma.$transaction(async (tx) => {
      const clase = await tx.clase.findUnique({
        where: { id },
        select: { bloqueoId: true, estado: true },
      });

      if (!clase) {
        throw new NotFoundException('No hay una clase con ese número.');
      }

      if (clase.estado !== EstadoClase.PROGRAMADA) {
        throw new ConflictException('Esa clase ya no está programada.');
      }

      const { count } = await tx.clase.updateMany({
        // El estado va también en el `where`, que es el compare-and-set: dos admins
        // cancelando la misma clase llegan los dos hasta acá.
        where: { id, estado: EstadoClase.PROGRAMADA },
        data: {
          estado: EstadoClase.CANCELADA,
          canceladaEn: new Date(),
          motivoCancelacion: motivo,
          bloqueoId: null,
        },
      });

      if (count === 0) {
        throw new ConflictException('Esa clase ya no está programada.');
      }

      // El bloqueo se va con la clase: si no, la cancha sigue cerrada por una clase
      // que ya no existe y nadie encuentra de dónde salió ese bloqueo.
      if (clase.bloqueoId !== null) {
        await tx.bloqueo.delete({ where: { id: clase.bloqueoId } });
      }
    });

    return { id };
  }

  /**
   * Las clases de un día del club.
   *
   * El día se recorta en hora del club, como en la agenda de reservas: las 22:00 de
   * un lunes en Santiago son las 02:00Z del martes.
   */
  async delDia(fecha: string): Promise<ClaseDelDia[]> {
    const clases = await this.prisma.clase.findMany({
      where: {
        estado: { not: EstadoClase.CANCELADA },
        inicio: {
          gte: instanteEnElClub(fecha, '00:00'),
          lt: instanteEnElClub(fecha, '24:00'),
        },
      },
      orderBy: [{ inicio: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        inicio: true,
        fin: true,
        nivel: true,
        estado: true,
        cupoMaximo: true,
        notas: true,
        cancha: { select: { nombre: true } },
        profesor: { select: { nombreVisible: true } },
      },
    });

    return clases.map((clase) => ({
      id: clase.id,
      cancha: clase.cancha.nombre,
      profesor: clase.profesor.nombreVisible,
      inicio: clase.inicio,
      fin: clase.fin,
      nivel: clase.nivel,
      estado: clase.estado,
      cupoMaximo: clase.cupoMaximo,
      notas: clase.notas,
    }));
  }

  /** El bloqueo que le corresponde a esta clase. Con motivo `CLASE`, no `OTRO`. */
  private comoBloqueo(
    rango: { inicio: Date; fin: Date; nivel: string },
    canchaId: number,
    profesor?: string,
  ): DatosBloqueo {
    return {
      canchaId,
      inicio: rango.inicio,
      fin: rango.fin,
      motivo: MotivoBloqueo.CLASE,
      // La descripción es lo que ve quien mira la grilla y encuentra la cancha
      // cerrada: sin ella, el bloqueo dice "clase" y nada más.
      descripcion: profesor
        ? `Clase ${rango.nivel.toLowerCase()} con ${profesor}`
        : `Clase ${rango.nivel.toLowerCase()}`,
    };
  }

  /**
   * Que la hora exista en la grilla y que no haya otro bloqueo encima.
   *
   * Son dos comprobaciones y no una. La grilla dice **si esa hora existe** —está
   * dentro del horario de apertura y calza con los bloques— y el choque se consulta
   * aparte, porque mover una clase tiene que poder ignorar su propio bloqueo, y el
   * `bloqueado` que trae la grilla no dice de quién es.
   */
  private async exigirRangoUsable(
    canchaId: number,
    fecha: string,
    rango: { inicio: Date; fin: Date },
    exceptoBloqueoId: number | null = null,
  ): Promise<void> {
    const choque = await this.choqueDelRango(
      canchaId,
      fecha,
      rango,
      exceptoBloqueoId,
    );

    if (choque) throw choque;
  }

  /**
   * Lo mismo que `exigirRangoUsable`, pero devuelve el rechazo en vez de lanzarlo: la serie
   * lo muestra junto a su fecha (T113) y sigue con las demás.
   */
  private async choqueDelRango(
    canchaId: number,
    fecha: string,
    rango: { inicio: Date; fin: Date },
    exceptoBloqueoId: number | null = null,
  ): Promise<NotFoundException | ConflictException | null> {
    const bloques = await this.disponibilidad.de(canchaId, fecha);
    const dentro = bloques.filter(
      (bloque) => bloque.inicio >= rango.inicio && bloque.fin <= rango.fin,
    );

    // Tiene que cubrir el rango **exacto**: media hora suelta al principio o al final
    // sería una cancha cerrada en una hora que la grilla sigue ofreciendo.
    if (
      dentro.length === 0 ||
      dentro[0].inicio.getTime() !== rango.inicio.getTime() ||
      dentro[dentro.length - 1].fin.getTime() !== rango.fin.getTime()
    ) {
      return new NotFoundException(
        'Esa hora no está en el horario de la cancha.',
      );
    }

    const choque = await this.prisma.bloqueo.findFirst({
      where: {
        canchaId,
        inicio: { lt: rango.fin },
        fin: { gt: rango.inicio },
        ...(exceptoBloqueoId === null ? {} : { id: { not: exceptoBloqueoId } }),
      },
      select: { motivo: true, descripcion: true },
    });

    return choque
      ? new ConflictException(
          `Esa cancha ya está cerrada en ese rango: ${choque.descripcion ?? choque.motivo.toLowerCase()}.`,
        )
      : null;
  }

  private async elProfesor(id: number): Promise<{ nombreVisible: string }> {
    const profesor = await this.prisma.profesor.findUnique({
      where: { id },
      select: { nombreVisible: true, activo: true },
    });

    if (!profesor) {
      throw new NotFoundException('No hay un profesor con ese número.');
    }

    if (!profesor.activo) {
      // La regla de T45: el desactivado no toma clases nuevas, y las suyas ya
      // agendadas siguen. El filtro de la pantalla es una comodidad; esto es la regla.
      throw new ConflictException(
        `${profesor.nombreVisible} está desactivado: reactívalo antes de darle clases nuevas.`,
      );
    }

    return { nombreVisible: profesor.nombreVisible };
  }

  private async laClase(id: number) {
    const clase = await this.prisma.clase.findUnique({
      where: { id },
      select: {
        id: true,
        canchaId: true,
        bloqueoId: true,
        estado: true,
        nivel: true,
        profesor: { select: { nombreVisible: true } },
      },
    });

    if (!clase) throw new NotFoundException('No hay una clase con ese número.');

    if (clase.estado !== EstadoClase.PROGRAMADA) {
      throw new ConflictException(
        'Esa clase ya no está programada: no se puede mover ni cancelar.',
      );
    }

    return clase;
  }
}
