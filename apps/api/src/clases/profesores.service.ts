import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { CambioDeFicha, FichaNueva } from './profesores.dto';

/**
 * La ficha completa, **para el panel del admin y solo para ahí**: incluye el teléfono
 * y la tarifa. La página pública de T48 lleva su propio `select`, más corto; reusar
 * este publicaría lo que el club le paga a cada profesor.
 */
const FICHA = {
  id: true,
  nombreVisible: true,
  telefono: true,
  especialidad: true,
  tarifaHoraClp: true,
  activo: true,
} as const;

/**
 * Quiénes dan clases en el club.
 *
 * **Desactivar es el borrar de este módulo.** Un profesor que se fue dio clases que
 * pasaron, y borrarlo se llevaría por delante quién las dio. Se desactiva: deja de
 * aparecer para agendar y su historia queda donde estaba. Por eso no hay `DELETE`.
 */
@Injectable()
export class Profesores {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Las fichas del panel.
   *
   * Con `soloActivos` es la lista para agendar, y el filtro vive en el servidor
   * porque es una regla y no una comodidad de pantalla: quien ya no está no vuelve
   * a la agenda ni aunque alguien mande su id a mano.
   */
  listar(soloActivos = false) {
    return this.prisma.profesor.findMany({
      where: soloActivos ? { activo: true } : {},
      // Los que están dando clases arriba: es la lista que el club usa a diario.
      orderBy: [{ activo: 'desc' }, { nombreVisible: 'asc' }],
      select: FICHA,
    });
  }

  /**
   * Anota un profesor.
   *
   * **Sin cuenta.** El profesor no entra al sistema —`SPEC-clases.md` § Out of
   * scope—, así que pedirle un usuario sería crear credenciales que nadie usa. El
   * campo existe para el que además es socio, y esa fila la enlaza el padrón.
   */
  crear(ficha: FichaNueva) {
    return this.prisma.profesor.create({ data: ficha, select: FICHA });
  }

  /** Cambia lo que venga y deja lo demás. Activar y desactivar entran por acá. */
  async editar(id: number, cambio: CambioDeFicha) {
    const { count } = await this.prisma.profesor.updateMany({
      where: { id },
      data: cambio,
    });

    if (count === 0) {
      throw new NotFoundException('No hay un profesor con ese número.');
    }

    return this.prisma.profesor.findUniqueOrThrow({
      where: { id },
      select: FICHA,
    });
  }
}
