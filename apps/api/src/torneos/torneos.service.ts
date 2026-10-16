import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { comoFechaCivil } from '../comun/tiempo';
import {
  EstadoInscripcionTorneo,
  EstadoPagoInscripcion,
  EstadoTorneo,
  MedioPagoInscripcion,
} from '../generated/prisma/client';
import { esViolacionDeUnicidad } from '../prisma/errores';
import { PrismaService } from '../prisma/prisma.service';
import { InscripcionesAbandonadas } from './inscripciones-abandonadas.service';
import { aplanarTours, TOURS_DEL_TORNEO } from './torneos-publicos.service';
import type { TorneoNuevo, TourDelTorneo } from './torneos.dto';

/**
 * Los torneos del club: alta, edición, cancelación, y para qué tours suma cada uno.
 */
@Injectable()
export class Torneos {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abandonadas: InscripcionesAbandonadas,
  ) {}

  /**
   * Cancela un torneo: **una decisión del club, no un cálculo**.
   *
   * `CANCELADO` ya lo respetaba medio módulo —no deja inscribirse, ni armar cuadro, ni
   * cargar resultados, y lo esconde del calendario público— pero nada podía ponerlo:
   * era un estado inalcanzable hasta que alguien buscó el botón en el panel.
   *
   * **No devuelve plata.** Los reembolsos están fuera de alcance por decisión de
   * `SPEC-pagos.md`, así que las inscripciones pagadas se quedan como están y el club
   * las resuelve por su cuenta. La pantalla lo dice antes de cancelar: esconderlo sería
   * dejar que alguien cancele creyendo que el sistema le devuelve el dinero a la gente.
   *
   * **No se borra nada**: ni inscripciones, ni cuadros, ni partidos. Un torneo
   * cancelado por error tiene que poder volver, y eso solo funciona si sigue entero.
   */
  async cancelar(id: number): Promise<{ id: number; estado: EstadoTorneo }> {
    const torneo = await this.prisma.torneo.findUnique({
      where: { id },
      select: { estado: true },
    });

    if (!torneo)
      throw new NotFoundException('No hay un torneo con ese número.');

    // Rehacer la historia: sus partidos ya se jugaron y sus puntos ya están en la
    // tabla del ranking. Si el club quiere borrarlo, es otra conversación.
    if (torneo.estado === EstadoTorneo.FINALIZADO) {
      throw new ConflictException(
        'Ese torneo ya se jugó: no se puede cancelar.',
      );
    }

    await this.prisma.torneo.update({
      where: { id },
      data: { estado: EstadoTorneo.CANCELADO },
    });

    return { id, estado: EstadoTorneo.CANCELADO };
  }

  /**
   * Deshace la cancelación.
   *
   * **Un clic no puede ser definitivo**: cancelar esconde el torneo del calendario
   * público y cierra sus inscripciones, y quien se equivoca de fila en la lista no
   * tiene otra forma de volver.
   *
   * El estado al que vuelve **se recalcula**, no se recuerda: es el mismo criterio que
   * usa `CuadroDelTorneo` al armar o deshacer un cuadro —abierto mientras quede uno sin
   * armar— y guardar el estado anterior sería un dato más que puede quedar mintiendo.
   */
  async reactivar(id: number): Promise<{ id: number; estado: EstadoTorneo }> {
    const torneo = await this.prisma.torneo.findUnique({
      where: { id },
      select: { estado: true },
    });

    if (!torneo)
      throw new NotFoundException('No hay un torneo con ese número.');

    if (torneo.estado !== EstadoTorneo.CANCELADO) {
      throw new ConflictException('Ese torneo no está cancelado.');
    }

    const [cuadros, sinArmar] = await Promise.all([
      this.prisma.torneoCategoria.count({ where: { torneoId: id } }),
      this.prisma.torneoCategoria.count({
        where: { torneoId: id, semillaSorteo: null },
      }),
    ]);

    // **Se cuentan los dos, y el primero importa.** "No le falta ningún cuadro por
    // armar" es cierto también cuando no tiene ninguno, y ese torneo está en
    // inscripción, no armado. `ponerEstadoDelTorneo` no tiene el problema porque solo
    // corre después de armar o deshacer un cuadro, que exige que exista.
    const estado =
      cuadros > 0 && sinArmar === 0
        ? EstadoTorneo.CUADRO_ARMADO
        : EstadoTorneo.INSCRIPCION;

    await this.prisma.torneo.update({ where: { id }, data: { estado } });

    return { id, estado };
  }

  /** Los torneos, del más próximo al más lejano. */
  async listar() {
    // **El índice es la única vista que junta todos los torneos**, así que es donde
    // corre el barrido global: el que eligió Webpay y no pagó no puede aparecer
    // contado como trabajo pendiente. Vivía en la bandeja de pagos, que se fue.
    await this.abandonadas.liberar({});

    const torneos = await this.prisma.torneo.findMany({
      orderBy: [{ fechaInicio: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        nombre: true,
        superficie: true,
        fechaInicio: true,
        fechaFin: true,
        cierreInscripcion: true,
        estado: true,
        // **El cupo no es del torneo, es de cada cuadro** (T62): Honor cierra con 8 y la
        // 4ª con 32. La lista los trae para que el panel no tenga que pedir los cuadros
        // de cada torneo por separado.
        cuadros: {
          orderBy: { categoriaJuego: { orden: 'asc' } },
          select: {
            id: true,
            cupo: true,
            categoriaJuego: { select: { nombre: true } },
          },
        },
        tours: TOURS_DEL_TORNEO,
        // **El trabajo pendiente, contado por el servidor.** Es lo que permite entrar
        // solo al torneo que tiene algo: sin estos números habría que abrir los tres
        // abiertos para descubrir que dos estaban al día.
        //
        // **Trabajo es toda pendiente que no se resuelve sola**, y solo se resuelve
        // sola una: la que eligió Webpay y no pagó, que el barrido suelta a los quince
        // minutos. Las demás esperan que una persona decida — la que trae comprobante
        // y también la que anotó el admin para que pague en el mesón. Contar solo las
        // que traían imagen dejaba el índice diciendo "0 por revisar" con gente
        // debiendo la inscripción.
        _count: {
          select: {
            inscripciones: {
              where: {
                estadoPago: EstadoPagoInscripcion.PENDIENTE,
                estado: { not: EstadoInscripcionTorneo.RETIRADA },
                // **En positivo, con el nulo dicho aparte.** El medio en nulo —la que
                // anotó el admin— se escapa de las dos formas cortas: `NOT (medio =
                // 'WEBPAY' AND ...)` la deja fuera porque en SQL `NULL = 'WEBPAY'` no
                // es falso sino desconocido, y `medio <> 'WEBPAY'` tampoco la trae por
                // lo mismo. Las tres ramas dicen lo que se quiere decir: hay algo que
                // mirar, o hay alguien de quien cobrar.
                //
                // La del medio nulo, solo en el cuadro: **en espera también nace sin
                // medio, y no se le cobra** (T327). Contarla diría "por revisar" donde
                // solo hay gente esperando.
                OR: [
                  { comprobanteRuta: { not: null } },
                  { medioPago: null, estado: EstadoInscripcionTorneo.INSCRITA },
                  { medioPago: { not: MedioPagoInscripcion.WEBPAY } },
                ],
              },
            },
          },
        },
      },
    });

    const enEspera = await this.prisma.inscripcionTorneo.groupBy({
      by: ['torneoId'],
      where: {
        torneoId: { in: torneos.map((torneo) => torneo.id) },
        estado: EstadoInscripcionTorneo.LISTA_ESPERA,
      },
      _count: { _all: true },
    });

    const esperandoPor = new Map(
      enEspera.map((fila) => [fila.torneoId, fila._count._all]),
    );

    return torneos.map(({ _count, ...torneo }) => ({
      ...torneo,
      /** Cuántos comprobantes esperan que una persona los mire. */
      pagosPorRevisar: _count.inscripciones,
      enEspera: esperandoPor.get(torneo.id) ?? 0,
      // **Las tres fechas salen como fecha civil y no como instante.** Son columnas
      // `DATE`: un torneo empieza un día, no a una hora. Mandarlas como
      // "2026-11-10T00:00:00.000Z" invita a que cada consumidor les pegue una hora
      // encima y termine mostrando el día anterior, o nada.
      fechaInicio: comoFechaCivil(torneo.fechaInicio),
      fechaFin: comoFechaCivil(torneo.fechaFin),
      cierreInscripcion: comoFechaCivil(torneo.cierreInscripcion),
      // Aplanado acá y no en la pantalla: el nombre de la categoría se muestra en
      // toda lista de torneos, y dejar el objeto anidado obliga a cada una a saber
      // cómo está guardado.
      cuadros: torneo.cuadros.map((cuadro) => ({
        id: cuadro.id,
        categoria: cuadro.categoriaJuego.nombre,
        cupo: cuadro.cupo,
      })),
      tours: aplanarTours(torneo.tours),
    }));
  }

  /**
   * Crea el torneo **con sus tours en la misma escritura**: si una asociación falla, el
   * torneo no queda. Un torneo sin tour es justo lo que la regla 1 prohíbe (D10).
   */
  async crear({ tours, ...datos }: TorneoNuevo & { tours: TourDelTorneo[] }) {
    await this.comprobarNiveles(tours);

    try {
      return await this.prisma.torneo.create({
        data: { ...datos, tours: { create: tours } },
      });
    } catch (falla) {
      throw this.siYaSuma(falla);
    }
  }

  /** Suma el torneo a otro tour. */
  async agregarTour(torneoId: number, asociacion: TourDelTorneo) {
    await this.exigirTorneo(torneoId);
    await this.comprobarNiveles([asociacion]);

    try {
      return await this.prisma.torneoTour.create({
        data: { torneoId, ...asociacion },
        select: { tourId: true, nivelId: true },
      });
    } catch (falla) {
      throw this.siYaSuma(falla);
    }
  }

  /**
   * Cambia el nivel con que suma a un tour. **También si ya terminó** (regla 5): es
   * como corregir un resultado, y el ranking cambia en la consulta siguiente.
   */
  async cambiarNivel(torneoId: number, tourId: number, nivelId: number) {
    await this.comprobarNiveles([{ tourId, nivelId }]);

    const { count } = await this.prisma.torneoTour.updateMany({
      where: { torneoId, tourId },
      data: { nivelId },
    });

    if (count === 0) {
      throw new NotFoundException('Ese torneo no suma para ese tour.');
    }

    return { tourId, nivelId };
  }

  /**
   * Deja de sumar para un tour. **La última no se quita** (regla 1): primero se
   * agrega otra.
   *
   * ponytail: contar y después borrar deja una carrera si dos admins quitan las dos
   * últimas en el mismo instante. Un club, un panel: si pasa, un candado por torneo.
   */
  async quitarTour(torneoId: number, tourId: number) {
    const tours = await this.prisma.torneoTour.findMany({
      where: { torneoId },
      select: { tourId: true },
    });

    if (!tours.some((fila) => fila.tourId === tourId)) {
      throw new NotFoundException('Ese torneo no suma para ese tour.');
    }

    if (tours.length === 1) {
      throw new ConflictException(
        'Es el único tour del torneo: agrega otro antes de quitarlo.',
      );
    }

    await this.prisma.torneoTour.delete({
      where: { torneoId_tourId: { torneoId, tourId } },
    });
  }

  /**
   * **El nivel tiene que ser de una temporada de ese tour** (regla 3). Es lo que
   * permite guardar `tourId` al lado del nivel sin que los dos puedan contradecirse.
   * Un nivel que no existe cae en lo mismo.
   */
  private async comprobarNiveles(tours: TourDelTorneo[]) {
    const niveles = await this.prisma.nivelTemporada.findMany({
      where: { id: { in: tours.map((fila) => fila.nivelId) } },
      select: { id: true, temporada: { select: { tourId: true } } },
    });
    const tourDe = new Map(
      niveles.map((nivel) => [nivel.id, nivel.temporada.tourId]),
    );

    if (tours.some((fila) => tourDe.get(fila.nivelId) !== fila.tourId)) {
      throw new BadRequestException(
        'Ese nivel no es de ese tour: elige un nivel de una de sus temporadas.',
      );
    }
  }

  private async exigirTorneo(id: number) {
    const torneo = await this.prisma.torneo.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!torneo)
      throw new NotFoundException('No hay un torneo con ese número.');
  }

  /** Una vez por tour (regla 2): lo asegura el único de la base, y acá se explica. */
  private siYaSuma(falla: unknown) {
    return esViolacionDeUnicidad(falla)
      ? new ConflictException('El torneo ya suma para ese tour.')
      : falla;
  }

  async editar(id: number, cambio: Partial<TorneoNuevo>) {
    const { count } = await this.prisma.torneo.updateMany({
      where: { id },
      data: cambio,
    });

    if (count === 0) {
      throw new NotFoundException('No hay un torneo con ese número.');
    }

    return this.prisma.torneo.findUniqueOrThrow({ where: { id } });
  }
}
