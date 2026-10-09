import { Injectable, NotFoundException } from '@nestjs/common';

import { comoFechaCivil } from '../comun/tiempo';
import {
  EstadoInscripcionTorneo,
  EstadoPagoInscripcion,
  EstadoTorneo,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { nombreDeRonda } from './cuadro';
import { InscripcionesAbandonadas } from './inscripciones-abandonadas.service';

/** Un torneo del calendario, como lo ve quien todavía no es del club. */
export interface TorneoPublico {
  id: number;
  nombre: string;
  superficie: string | null;
  fechaInicio: string;
  fechaFin: string;
  cierreInscripcion: string;
  estado: EstadoTorneo;
  /** Qué categorías corre, con cuánto lugar queda en cada una. */
  categorias: CategoriaPublica[];
}

/** Un cuadro visto desde la calle: cuánto lugar queda, sin decir de quién. */
export interface CategoriaPublica {
  id: number;
  /** El nivel del jugador. Es lo que el formulario manda al inscribirse. */
  categoriaJuegoId: number;
  categoria: string;
  /** Cuánto vale ganarlo: "Club 250". Del cuadro y no del torneo desde T70. */
  valor: string;
  /**
   * Cuánto cuesta inscribirse en **esta** categoría. 0 = gratis.
   *
   * Va en el calendario y no solo en el formulario: es la pregunta que sigue a
   * "¿quedan cupos?", y el monto cuelga del cuadro —Honor puede costar el doble que la
   * 5ª en el mismo torneo—, así que un precio del torneo no diría nada.
   */
  montoClp: number;
  cupo: number;
  cuposLibres: number;
  armado: boolean;
}

/** Un partido publicado: nombres, marcador y, si ya lo programó el club, cuándo y dónde. */
export interface PartidoPublico {
  ronda: number;
  ronda_nombre: string;
  posicion: number;
  jugadorA: string | null;
  jugadorB: string | null;
  ganador: string | null;
  marcador: string | null;
  walkover: boolean;
  /** La programación de T67 (T134). Nulos mientras el club no lo programe. */
  inicio: string | null;
  fin: string | null;
  cancha: string | null;
}

/**
 * Un inscrito de la lista pública (T134): su nombre y si ya pagó.
 *
 * **El estado del pago se publica por decisión del club** (sexta parte, decisión 4), y la
 * política de privacidad lo dice. `null` en una categoría gratis: ahí no hay nada que pagar.
 */
export interface InscritoPublico {
  nombre: string;
  pago: 'PAGADO' | 'PENDIENTE' | null;
}

export interface CuadroPublico {
  id: number;
  torneoId: number;
  nombre: string;
  categoria: string;
  estado: EstadoTorneo;
  inscritos: InscritoPublico[];
  partidos: PartidoPublico[];
}

/**
 * Lo que se ve de los torneos sin cuenta.
 *
 * El perfil pide publicar el calendario, y es de las pocas cosas que un tercero mira
 * antes de asociarse: un club con torneos es un club con vida. El cuadro es lo otro
 * —está colgado en el mural y esta pantalla es el mismo mural, accesible desde el
 * teléfono de quien está en la cancha de al lado.
 *
 * **De las personas sale el nombre y nada más.** El teléfono de un jugador es dato
 * suyo: el club lo tiene para llamarlo, no para publicarlo. Por eso este servicio arma
 * sus propias formas en vez de reusar las del panel, donde el teléfono sí va.
 */
@Injectable()
export class TorneosPublicos {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abandonadas: InscripcionesAbandonadas,
  ) {}

  /**
   * El calendario del año.
   *
   * Sin los cancelados: un torneo que no se va a jugar no es calendario, es ruido en
   * la pantalla que alguien mira para decidir si se asocia.
   */
  async calendario(anio: number): Promise<TorneoPublico[]> {
    const delAnio = {
      gte: new Date(Date.UTC(anio, 0, 1)),
      lt: new Date(Date.UTC(anio + 1, 0, 1)),
    };

    // **"Quedan 3 cupos" tiene que ser verdad.** Los lugares de quienes eligieron
    // Webpay y cerraron la ventana de pago se sueltan acá, acotado al mismo año que se
    // está consultando: ver `InscripcionesAbandonadas`.
    await this.abandonadas.liberar({ torneo: { fechaInicio: delAnio } });

    const torneos = await this.prisma.torneo.findMany({
      where: {
        estado: { not: EstadoTorneo.CANCELADO },
        fechaInicio: delAnio,
      },
      orderBy: [{ fechaInicio: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        nombre: true,
        superficie: true,
        fechaInicio: true,
        fechaFin: true,
        cierreInscripcion: true,
        estado: true,
        cuadros: {
          orderBy: { categoriaJuego: { orden: 'asc' } },
          select: {
            id: true,
            cupo: true,
            semillaSorteo: true,
            categoriaJuegoId: true,
            montoInscripcionClp: true,
            categoriaJuego: { select: { nombre: true } },
            // **Cuánto vale ganar este cuadro** (T70). Cuelga del cuadro y no del
            // torneo: en el mismo fin de semana, ganar Honor puede valer el doble que
            // ganar la 5ª.
            categoria: { select: { nombre: true } },
            // Solo el número: cuántos lugares quedan, no quiénes están.
            _count: {
              select: {
                inscripciones: {
                  where: { estado: EstadoInscripcionTorneo.INSCRITA },
                },
              },
            },
          },
        },
      },
    });

    return torneos.map((torneo) => ({
      id: torneo.id,
      nombre: torneo.nombre,
      superficie: torneo.superficie,
      // Fechas civiles y no instantes, por lo mismo que en el panel: un torneo empieza
      // un día, y mandarlas con hora invita a que la pantalla muestre el día anterior.
      fechaInicio: comoFechaCivil(torneo.fechaInicio),
      fechaFin: comoFechaCivil(torneo.fechaFin),
      cierreInscripcion: comoFechaCivil(torneo.cierreInscripcion),
      estado: torneo.estado,
      categorias: torneo.cuadros.map((cuadro) => ({
        id: cuadro.id,
        categoriaJuegoId: cuadro.categoriaJuegoId,
        categoria: cuadro.categoriaJuego.nombre,
        valor: cuadro.categoria.nombre,
        montoClp: cuadro.montoInscripcionClp,
        cupo: cuadro.cupo,
        cuposLibres: Math.max(cuadro.cupo - cuadro._count.inscripciones, 0),
        // Sin columna que lo diga: el cuadro está armado cuando se guardó su semilla,
        // que es lo mismo que decir que sus partidos existen.
        armado: cuadro.semillaSorteo !== null,
      })),
    }));
  }

  /**
   * El cuadro de un torneo, con los resultados que ya se cargaron.
   *
   * Se publica desde que está armado. Mientras la inscripción sigue abierta hay lista
   * de inscritos y todavía no hay cuadro, que es exactamente lo que la gente quiere
   * saber en ese momento: quiénes se anotaron.
   *
   * **El `id` es el de la categoría del torneo, no el del torneo.** Un torneo tiene
   * tres cuadros y "el cuadro del torneo" dejó de significar algo.
   */
  async cuadro(id: number): Promise<CuadroPublico> {
    // La lista de inscritos es lo que la gente mira para saber quién juega. El que no
    // pagó no juega.
    await this.abandonadas.liberar({ torneoCategoriaId: id });

    const cuadro = await this.prisma.torneoCategoria.findFirst({
      where: { id, torneo: { estado: { not: EstadoTorneo.CANCELADO } } },
      select: {
        id: true,
        torneoId: true,
        categoriaJuego: { select: { nombre: true } },
        torneo: { select: { nombre: true, estado: true } },
        // **En el orden en que se inscribieron** (T134), no en el de la siembra: es la
        // lista de quién se anotó, y antes de armar el cuadro no hay siembra.
        inscripciones: {
          where: { estado: EstadoInscripcionTorneo.INSCRITA },
          orderBy: [{ inscritaEn: 'asc' }, { id: 'asc' }],
          select: {
            estadoPago: true,
            jugador: { select: { nombre: true, apellido: true } },
          },
        },
        partidos: {
          orderBy: [{ ronda: 'asc' }, { posicion: 'asc' }],
          select: {
            ronda: true,
            posicion: true,
            marcador: true,
            walkover: true,
            jugadorA: { select: { nombre: true, apellido: true } },
            jugadorB: { select: { nombre: true, apellido: true } },
            ganador: { select: { nombre: true, apellido: true } },
            programadoInicio: true,
            programadoFin: true,
            bloqueo: { select: { cancha: { select: { nombre: true } } } },
          },
        },
      },
    });

    if (!cuadro)
      throw new NotFoundException('No hay un cuadro con ese número.');

    const rondas = cuadro.partidos.reduce(
      (mayor, partido) => Math.max(mayor, partido.ronda),
      0,
    );

    return {
      id: cuadro.id,
      torneoId: cuadro.torneoId,
      nombre: cuadro.torneo.nombre,
      categoria: cuadro.categoriaJuego.nombre,
      estado: cuadro.torneo.estado,
      // Sin cast: un inscrito **siempre** tiene jugador —la relación es obligatoria—,
      // y el `as string[]` tapaba que se estaba usando el lector de los opcionales.
      inscritos: cuadro.inscripciones.map((fila) => ({
        nombre: `${fila.jugador.nombre} ${fila.jugador.apellido}`,
        pago: PAGO_PUBLICO[fila.estadoPago],
      })),
      partidos: cuadro.partidos.map((partido) => ({
        ronda: partido.ronda,
        ronda_nombre: nombreDeRonda(partido.ronda, rondas),
        posicion: partido.posicion,
        jugadorA: nombre(partido.jugadorA),
        jugadorB: nombre(partido.jugadorB),
        ganador: nombre(partido.ganador),
        marcador: partido.marcador,
        walkover: partido.walkover,
        inicio: partido.programadoInicio?.toISOString() ?? null,
        fin: partido.programadoFin?.toISOString() ?? null,
        cancha: partido.bloqueo?.cancha.nombre ?? null,
      })),
    };
  }
}

/**
 * El pago, como lo lee quien mira la lista. Un rechazado no aparece: rechazar lo deja
 * `RETIRADA`, y la lista es de los `INSCRITA`.
 */
const PAGO_PUBLICO: Record<EstadoPagoInscripcion, InscritoPublico['pago']> = {
  [EstadoPagoInscripcion.EXENTA]: null,
  [EstadoPagoInscripcion.PENDIENTE]: 'PENDIENTE',
  [EstadoPagoInscripcion.PAGADA]: 'PAGADO',
  [EstadoPagoInscripcion.RECHAZADA]: 'PENDIENTE',
};

function nombre(
  jugador: { nombre: string; apellido: string } | null,
): string | null {
  return jugador ? `${jugador.nombre} ${jugador.apellido}` : null;
}
