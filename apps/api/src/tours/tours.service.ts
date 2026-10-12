import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { borrarImagen } from '../comun/imagenes';
import { comoFechaCivil, hoyEnElClub } from '../comun/tiempo';
import { EstadoTorneo } from '../generated/prisma/client';
import { esViolacionDeUnicidad } from '../prisma/errores';
import { PrismaService } from '../prisma/prisma.service';
import {
  direccionesDeImagen,
  type FotoDeTour,
  type ImagenDeTour,
  publicarFoto,
} from './imagenes-del-tour.service';
import type { TablaDePuntos } from './tabla';
import type { NivelNuevo, TemporadaNueva, TourNuevo } from './tours.dto';
import { temporadaVigente } from './vigente';

/** Una temporada como la ve el panel. Las fechas, civiles: "2027-03-01". */
export interface TemporadaDelPanel {
  id: number;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
}

/** Un nivel como lo ve el panel (T189), con en cuántos torneos se usa. */
export interface NivelDelPanel {
  id: number;
  nombre: string;
  tabla: TablaDePuntos;
  /** En cuántos torneos se usa: con alguno, no se puede borrar. */
  torneos: number;
  /** Cuántos de esos ya terminaron: cambiar la tabla cambia su ranking (T192 lo avisa). */
  torneosTerminados: number;
}

/** Un tour en `/tours` (T194). */
export interface TourEnLista {
  id: number;
  nombre: string;
  /** El comienzo de la descripción, en una línea. */
  extracto: string;
  imagen: ImagenDeTour | null;
  temporadaVigente: TemporadaDelPanel | null;
}

/** Un tour en `/tours/:id` (T194): sin lo del panel, con la temporada vigente. */
export type TourPublico = Omit<FichaDeTour, 'temporadas'> & {
  temporadaVigenteId: number | null;
  temporadas: (TemporadaDelPanel & {
    niveles: Pick<NivelDelPanel, 'id' | 'nombre' | 'tabla'>[];
  })[];
};

/** La ficha de un tour en el panel: sus temporadas con sus niveles, y sus imágenes (T190). */
export interface FichaDeTour {
  id: number;
  nombre: string;
  descripcion: string;
  /** La representativa, o nula si todavía no se sube. */
  imagen: ImagenDeTour | null;
  temporadas: (TemporadaDelPanel & { niveles: NivelDelPanel[] })[];
  /** La galería, de la más nueva a la más vieja, como en los torneos. */
  fotos: FotoDeTour[];
}

const TEMPORADA = {
  id: true,
  nombre: true,
  fechaInicio: true,
  fechaFin: true,
} as const;

/** Las siete columnas de la tabla. */
const COLUMNAS = {
  puntosCampeon: true,
  puntosFinalista: true,
  puntosSemifinal: true,
  puntosCuartos: true,
  puntosOctavos: true,
  puntosDieciseisavos: true,
  puntosTreintaidosavos: true,
} as const;

/**
 * Un nivel con lo que el panel necesita contar. El estado de cada torneo y no dos
 * `_count`: Prisma no deja contar dos veces la misma relación, y son un puñado de filas.
 */
const NIVEL = {
  id: true,
  nombre: true,
  ...COLUMNAS,
  torneos: { select: { torneo: { select: { estado: true } } } },
} as const;

/** Del que más vale al que menos: es como se lee una escala. */
const ORDEN_DE_NIVELES = [
  { puntosCampeon: 'desc' as const },
  { nombre: 'asc' as const },
];

/**
 * Los tours y sus temporadas, para el panel (T188). `SPEC-tours.md`.
 *
 * **Nada con torneos se borra.** La base lo impide con los `Restrict` de `torneo_tour`; el
 * servicio cuenta antes para que el 409 diga cuántos, que es lo que el admin necesita
 * para saber qué mover primero.
 */
@Injectable()
export class Tours {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * La lista del panel, por nombre. Un club tiene un puñado.
   *
   * Con cuántas temporadas tiene cada uno, ya contado: el `_count` de Prisma no sale tal
   * cual, para que el panel no dependa de cómo arma sus consultas el ORM.
   */
  async listar(): Promise<
    { id: number; nombre: string; temporadas: number }[]
  > {
    const tours = await this.prisma.tour.findMany({
      orderBy: { nombre: 'asc' },
      select: {
        id: true,
        nombre: true,
        _count: { select: { temporadas: true } },
      },
    });

    return tours.map(({ _count, ...tour }) => ({
      ...tour,
      temporadas: _count.temporadas,
    }));
  }

  async ficha(id: number): Promise<FichaDeTour> {
    const tour = await this.prisma.tour.findUnique({
      where: { id },
      select: {
        id: true,
        nombre: true,
        descripcion: true,
        imagenRutaWeb: true,
        fotos: {
          orderBy: [{ creadaEn: 'desc' }, { id: 'desc' }],
          select: { id: true, descripcion: true },
        },
        // La más nueva primero: es la que el admin viene a tocar.
        temporadas: {
          orderBy: [{ fechaInicio: 'desc' }, { id: 'desc' }],
          select: {
            ...TEMPORADA,
            niveles: { orderBy: ORDEN_DE_NIVELES, select: NIVEL },
          },
        },
      },
    });

    if (!tour) throw new NotFoundException('No hay un tour con ese número.');

    const { imagenRutaWeb, fotos, temporadas, ...datos } = tour;

    return {
      ...datos,
      imagen: imagenRutaWeb ? direccionesDeImagen(tour.id) : null,
      temporadas: temporadas.map(({ niveles, ...temporada }) => ({
        ...publicarTemporada(temporada),
        niveles: niveles.map(publicarNivel),
      })),
      fotos: fotos.map(publicarFoto),
    };
  }

  // ── Lo público (T194) ───────────────────────────────────────────────────────

  /**
   * Los tours para `/tours`, sin sesión: el nombre, el comienzo de la descripción, la
   * imagen y la temporada vigente de cada uno.
   *
   * @param hoy El día del club; parámetro para probar la vigente moviendo el reloj.
   */
  async listarPublicos(hoy: Date = hoyEnElClub()): Promise<TourEnLista[]> {
    const tours = await this.prisma.tour.findMany({
      orderBy: { nombre: 'asc' },
      select: {
        id: true,
        nombre: true,
        descripcion: true,
        imagenRutaWeb: true,
        temporadas: { select: TEMPORADA },
      },
    });

    return tours.map((tour) => {
      const idVigente = temporadaVigente(tour.temporadas, hoy);
      const vigente = tour.temporadas.find((t) => t.id === idVigente);

      return {
        id: tour.id,
        nombre: tour.nombre,
        extracto: extracto(tour.descripcion),
        imagen: tour.imagenRutaWeb ? direccionesDeImagen(tour.id) : null,
        temporadaVigente: vigente ? publicarTemporada(vigente) : null,
      };
    });
  }

  /**
   * Un tour para `/tours/:id`, sin sesión: lo mismo que la ficha del panel **menos lo del
   * panel**, en cuántos torneos se usa cada nivel, más cuál es la temporada vigente.
   *
   * Sale de la misma consulta que la ficha y no de una propia: dos formas de leer el mismo
   * tour se separan el día que alguien agrega un campo a una sola.
   */
  async fichaPublica(
    id: number,
    hoy: Date = hoyEnElClub(),
  ): Promise<TourPublico> {
    const { temporadas, ...tour } = await this.ficha(id);

    return {
      ...tour,
      temporadaVigenteId: temporadaVigente(
        temporadas.map((t) => ({
          id: t.id,
          fechaInicio: aFecha(t.fechaInicio),
          fechaFin: aFecha(t.fechaFin),
        })),
        hoy,
      ),
      temporadas: temporadas.map((temporada) => ({
        ...temporada,
        niveles: temporada.niveles.map(({ id, nombre, tabla }) => ({
          id,
          nombre,
          tabla,
        })),
      })),
    };
  }

  async crear(datos: Pick<TourNuevo, 'nombre'>): Promise<FichaDeTour> {
    try {
      const { id } = await this.prisma.tour.create({
        data: { nombre: datos.nombre, descripcion: '' },
        select: { id: true },
      });

      return await this.ficha(id);
    } catch (falla) {
      if (esViolacionDeUnicidad(falla)) throw choqueDeTour();

      throw falla;
    }
  }

  async editar(id: number, cambio: Partial<TourNuevo>): Promise<FichaDeTour> {
    // Que exista primero: el 404 y el 409 necesitan respuestas distintas, como en las
    // categorías de juego.
    await this.ficha(id);

    try {
      await this.prisma.tour.update({ where: { id }, data: cambio });
    } catch (falla) {
      if (esViolacionDeUnicidad(falla)) throw choqueDeTour();

      throw falla;
    }

    return this.ficha(id);
  }

  /**
   * Borra el tour con sus temporadas y sus niveles, que caen en cascada. **Con torneos,
   * no**: el 409 dice cuántos.
   *
   * Las fotos y la imagen caen con la fila, y sus archivos se borran del disco (T190).
   */
  async borrar(id: number): Promise<{ id: number }> {
    await this.ficha(id);

    const torneos = await this.prisma.torneoTour.count({
      where: { tourId: id },
    });
    if (torneos > 0) {
      throw new ConflictException(
        `Ese tour suma para ${cuantos(torneos)}. Quítaselos antes de borrarlo.`,
      );
    }

    // Las rutas antes de borrar la fila: después ya no hay dónde leerlas, y la galería
    // cae en cascada con el tour.
    const archivos = await this.prisma.tour.findUniqueOrThrow({
      where: { id },
      select: {
        imagenRutaWeb: true,
        imagenRutaMiniatura: true,
        fotos: { select: { rutaWeb: true, rutaMiniatura: true } },
      },
    });

    await this.prisma.tour.delete({ where: { id } });

    // Una fila menos no libera disco.
    for (const ruta of [
      archivos.imagenRutaWeb,
      archivos.imagenRutaMiniatura,
      ...archivos.fotos.flatMap((f) => [f.rutaWeb, f.rutaMiniatura]),
    ]) {
      if (ruta) await borrarImagen(ruta);
    }

    return { id };
  }

  /**
   * Crea la temporada **con una copia de los niveles de la anterior** (D14): la del mismo
   * tour con el inicio más reciente. El club escribe sus niveles una vez y los ajusta
   * temporada a temporada; como son filas nuevas, corregir los de 2028 no toca 2027.
   *
   * En una transacción: una temporada a medio copiar tendría un ranking con niveles que
   * faltan, y nadie se daría cuenta hasta que un torneo no pudiera asociarse.
   */
  async crearTemporada(
    tourId: number,
    datos: TemporadaNueva,
  ): Promise<TemporadaDelPanel> {
    await this.ficha(tourId);

    try {
      const creada = await this.prisma.$transaction(async (tx) => {
        const anterior = await tx.temporadaTour.findFirst({
          where: { tourId },
          orderBy: [{ fechaInicio: 'desc' }, { id: 'desc' }],
          select: { niveles: { select: { nombre: true, ...COLUMNAS } } },
        });

        return tx.temporadaTour.create({
          data: {
            tourId,
            ...datos,
            niveles: { create: anterior?.niveles ?? [] },
          },
          select: TEMPORADA,
        });
      });

      return publicarTemporada(creada);
    } catch (falla) {
      if (esViolacionDeUnicidad(falla)) throw choqueDeTemporada();

      throw falla;
    }
  }

  /**
   * Corrige el nombre o las fechas. **Las fechas no se comparan con las de sus
   * torneos** (D13): la temporada a la que suma un torneo la elige el admin.
   */
  async editarTemporada(
    id: number,
    cambio: Partial<TemporadaNueva>,
  ): Promise<TemporadaDelPanel> {
    await this.exigirTemporada(id);

    try {
      const editada = await this.prisma.temporadaTour.update({
        where: { id },
        data: cambio,
        select: TEMPORADA,
      });

      return publicarTemporada(editada);
    } catch (falla) {
      if (esViolacionDeUnicidad(falla)) throw choqueDeTemporada();

      throw falla;
    }
  }

  /** Borra la temporada con sus niveles. **Con torneos, no**, como el tour. */
  async borrarTemporada(id: number): Promise<{ id: number }> {
    await this.exigirTemporada(id);

    const torneos = await this.prisma.torneoTour.count({
      where: { nivel: { temporadaId: id } },
    });
    if (torneos > 0) {
      throw new ConflictException(
        `Esa temporada tiene ${cuantos(torneos)}. Quítaselos antes de borrarla.`,
      );
    }

    await this.prisma.temporadaTour.delete({ where: { id } });

    return { id };
  }

  async crearNivel(
    temporadaId: number,
    datos: NivelNuevo,
  ): Promise<NivelDelPanel> {
    await this.exigirTemporada(temporadaId);

    try {
      const creado = await this.prisma.nivelTemporada.create({
        data: { temporadaId, nombre: datos.nombre, ...aColumnas(datos.tabla) },
        select: NIVEL,
      });

      return publicarNivel(creado);
    } catch (falla) {
      if (esViolacionDeUnicidad(falla)) throw choqueDeNivel();

      throw falla;
    }
  }

  /**
   * Corrige el nombre o la tabla. **Con torneos terminados también se puede**: es cómo se
   * arregla un error de carga, y el ranking se recalcula solo en la consulta siguiente. El
   * panel avisa antes con `torneosTerminados` (T192).
   */
  async editarNivel(
    id: number,
    cambio: Partial<NivelNuevo>,
  ): Promise<NivelDelPanel> {
    await this.exigirNivel(id);

    try {
      const editado = await this.prisma.nivelTemporada.update({
        where: { id },
        data: {
          nombre: cambio.nombre,
          ...(cambio.tabla && aColumnas(cambio.tabla)),
        },
        select: NIVEL,
      });

      return publicarNivel(editado);
    } catch (falla) {
      if (esViolacionDeUnicidad(falla)) throw choqueDeNivel();

      throw falla;
    }
  }

  /** **Con torneos, no**: se quedarían sin nivel y sin puntos. */
  async borrarNivel(id: number): Promise<{ id: number }> {
    await this.exigirNivel(id);

    const torneos = await this.prisma.torneoTour.count({
      where: { nivelId: id },
    });
    if (torneos > 0) {
      throw new ConflictException(
        `Ese nivel se usa en ${cuantos(torneos)}. Cámbiales el nivel antes de borrarlo.`,
      );
    }

    await this.prisma.nivelTemporada.delete({ where: { id } });

    return { id };
  }

  private async exigirNivel(id: number): Promise<void> {
    const nivel = await this.prisma.nivelTemporada.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!nivel) throw new NotFoundException('No hay un nivel con ese número.');
  }

  private async exigirTemporada(id: number): Promise<void> {
    const temporada = await this.prisma.temporadaTour.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!temporada) {
      throw new NotFoundException('No hay una temporada con ese número.');
    }
  }
}

function publicarTemporada(fila: {
  id: number;
  nombre: string;
  fechaInicio: Date;
  fechaFin: Date;
}): TemporadaDelPanel {
  return {
    ...fila,
    fechaInicio: comoFechaCivil(fila.fechaInicio),
    fechaFin: comoFechaCivil(fila.fechaFin),
  };
}

function publicarNivel(fila: {
  id: number;
  nombre: string;
  puntosCampeon: number;
  puntosFinalista: number;
  puntosSemifinal: number;
  puntosCuartos: number;
  puntosOctavos: number;
  puntosDieciseisavos: number;
  puntosTreintaidosavos: number;
  torneos: { torneo: { estado: EstadoTorneo } }[];
}): NivelDelPanel {
  return {
    id: fila.id,
    nombre: fila.nombre,
    tabla: {
      campeon: fila.puntosCampeon,
      finalista: fila.puntosFinalista,
      semifinal: fila.puntosSemifinal,
      cuartos: fila.puntosCuartos,
      octavos: fila.puntosOctavos,
      dieciseisavos: fila.puntosDieciseisavos,
      treintaidosavos: fila.puntosTreintaidosavos,
    },
    torneos: fila.torneos.length,
    torneosTerminados: fila.torneos.filter(
      ({ torneo }) => torneo.estado === EstadoTorneo.FINALIZADO,
    ).length,
  };
}

function aColumnas(tabla: TablaDePuntos) {
  return {
    puntosCampeon: tabla.campeon,
    puntosFinalista: tabla.finalista,
    puntosSemifinal: tabla.semifinal,
    puntosCuartos: tabla.cuartos,
    puntosOctavos: tabla.octavos,
    puntosDieciseisavos: tabla.dieciseisavos,
    puntosTreintaidosavos: tabla.treintaidosavos,
  };
}

/** De una fecha civil publicada ("2027-03-01") a la medianoche UTC de las columnas `DATE`. */
function aFecha(civil: string): Date {
  return new Date(`${civil}T00:00:00.000Z`);
}

/** Cuánto de la descripción entra en la tarjeta de un tour. */
const LARGO_DEL_EXTRACTO = 160;

/**
 * El comienzo de la descripción, en una línea: cortado en una palabra y con «…» si sigue.
 * La tarjeta de `/tours` no es la página del tour.
 */
function extracto(texto: string): string {
  const plano = texto.replace(/\s+/g, ' ').trim();

  if (plano.length <= LARGO_DEL_EXTRACTO) return plano;

  const corte = plano.slice(0, LARGO_DEL_EXTRACTO);
  const espacio = corte.lastIndexOf(' ');

  return `${(espacio > 0 ? corte.slice(0, espacio) : corte).replace(/[\s,.;:]+$/, '')}…`;
}

/** "1 torneo", "3 torneos". */
function cuantos(torneos: number): string {
  return torneos === 1 ? '1 torneo' : `${torneos} torneos`;
}

/** Funciones y no instancias compartidas: el stack tiene que ser el del `throw`. */
function choqueDeTour(): ConflictException {
  return new ConflictException('Ya hay un tour con ese nombre.');
}

function choqueDeTemporada(): ConflictException {
  return new ConflictException(
    'Ese tour ya tiene una temporada con ese nombre.',
  );
}

function choqueDeNivel(): ConflictException {
  return new ConflictException(
    'Esa temporada ya tiene un nivel con ese nombre.',
  );
}
