import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { comoFechaCivil } from '../comun/tiempo';
import {
  EstadoInscripcionTorneo,
  EstadoPagoInscripcion,
  EstadoTorneo,
} from '../generated/prisma/client';
import { esViolacionDeUnicidad } from '../prisma/errores';
import { PrismaService } from '../prisma/prisma.service';
import { InscripcionesAbandonadas } from './inscripciones-abandonadas.service';
import type { CategoriaNueva, TorneoNuevo } from './torneos.dto';

/**
 * Los torneos del club y las categorías con que se puntúan.
 *
 * **La categoría es una tabla y no un enum** porque el club inventa categorías: este
 * año hay un "Máster de fin de año" que el año pasado no existía, y agregar un valor a
 * un enum es una migración. Es la misma razón por la que las franjas horarias son
 * filas.
 */
@Injectable()
export class Torneos {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abandonadas: InscripcionesAbandonadas,
  ) {}

  categorias(soloActivas = false) {
    return this.prisma.categoriaTorneo.findMany({
      where: soloActivas ? { activa: true } : {},
      orderBy: [{ activa: 'desc' }, { puntosCampeon: 'desc' }],
    });
  }

  async crearCategoria(datos: CategoriaNueva) {
    try {
      return await this.prisma.categoriaTorneo.create({ data: datos });
    } catch (falla) {
      // Dos categorías con el mismo nombre son dos filas que el club no puede
      // distinguir en el selector al crear un torneo.
      if (esViolacionDeUnicidad(falla)) {
        throw new ConflictException('Ya hay una categoría con ese nombre.');
      }

      throw falla;
    }
  }

  async editarCategoria(
    id: number,
    cambio: Partial<CategoriaNueva> & { activa?: boolean },
  ) {
    const { count } = await this.prisma.categoriaTorneo.updateMany({
      where: { id },
      data: cambio,
    });

    if (count === 0) {
      throw new NotFoundException('No hay una categoría con ese número.');
    }

    return this.prisma.categoriaTorneo.findUniqueOrThrow({ where: { id } });
  }

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
        // **El cupo y la categoría ya no son del torneo, son de cada cuadro** (T62 y
        // T70): Honor cierra con 8 y la 4ª con 32, y ganar Honor puede valer el doble.
        // La lista los trae para que el panel no tenga que pedir los cuadros de cada
        // torneo por separado.
        cuadros: {
          orderBy: { categoriaJuego: { orden: 'asc' } },
          select: {
            id: true,
            cupo: true,
            categoriaId: true,
            categoriaJuego: { select: { nombre: true } },
            categoria: { select: { nombre: true, puntosCampeon: true } },
          },
        },
        // **El trabajo pendiente, contado por el servidor.** Es lo que permite entrar
        // solo al torneo que tiene algo: sin estos números habría que abrir los tres
        // abiertos para descubrir que dos estaban al día.
        _count: {
          select: {
            inscripciones: {
              where: {
                estadoPago: EstadoPagoInscripcion.PENDIENTE,
                comprobanteRuta: { not: null },
                estado: { not: EstadoInscripcionTorneo.RETIRADA },
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
        categoriaId: cuadro.categoriaId,
        valor: cuadro.categoria.nombre,
        puntosCampeon: cuadro.categoria.puntosCampeon,
      })),
    }));
  }

  crear(datos: TorneoNuevo) {
    return this.prisma.torneo.create({ data: datos });
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
