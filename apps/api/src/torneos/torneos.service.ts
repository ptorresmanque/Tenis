import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { esViolacionDeUnicidad } from '../prisma/errores';
import { PrismaService } from '../prisma/prisma.service';
import type { CategoriaNueva, TorneoNuevo } from './torneos.dto';

/** Una columna `DATE` como la fecha civil que es: "AAAA-MM-DD". */
function comoFechaCivil(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

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
  constructor(private readonly prisma: PrismaService) {}

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

  /** Los torneos, del más próximo al más lejano. */
  async listar() {
    const torneos = await this.prisma.torneo.findMany({
      orderBy: [{ fechaInicio: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        nombre: true,
        superficie: true,
        fechaInicio: true,
        fechaFin: true,
        cierreInscripcion: true,
        cupo: true,
        estado: true,
        categoriaId: true,
        categoria: { select: { nombre: true, puntosCampeon: true } },
      },
    });

    return torneos.map((torneo) => ({
      ...torneo,
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
      categoria: torneo.categoria.nombre,
      puntosCampeon: torneo.categoria.puntosCampeon,
    }));
  }

  async crear(datos: TorneoNuevo) {
    await this.exigirCategoria(datos.categoriaId);

    return this.prisma.torneo.create({ data: datos });
  }

  async editar(id: number, cambio: Partial<TorneoNuevo>) {
    if (cambio.categoriaId !== undefined) {
      await this.exigirCategoria(cambio.categoriaId);
    }

    const { count } = await this.prisma.torneo.updateMany({
      where: { id },
      data: cambio,
    });

    if (count === 0) {
      throw new NotFoundException('No hay un torneo con ese número.');
    }

    return this.prisma.torneo.findUniqueOrThrow({ where: { id } });
  }

  private async exigirCategoria(id: number): Promise<void> {
    const categoria = await this.prisma.categoriaTorneo.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!categoria) {
      throw new NotFoundException('No hay una categoría con ese número.');
    }
  }
}
