import { Controller, Get } from '@nestjs/common';

import { EstadoReporte, EstadoSolicitud } from '../generated/prisma/client';
import { SoloAdmin } from '../identidad/guards';
import { PrismaService } from '../prisma/prisma.service';

/** Lo que espera al admin, para los badges del panel (T287, SPEC-panel.md A10). */
export interface Pendientes {
  /** Horas con algún reporte de no uso sin resolver: cada hora cuenta una vez. */
  horasPorRevisar: number;
  /** Consultas del formulario de contacto que siguen en «Nueva». */
  consultasSinAtender: number;
}

/**
 * Cuánto espera al admin. Lo lee el badge de «Por revisar» en Horas no usadas y, desde T301, el
 * menú. Es un conteo y no las listas: el panel lo pide en cada navegación, y las listas ya
 * tienen sus pantallas.
 *
 * **Una hora con dos reportes es una hora por revisar**: el admin resuelve la hora, no cada
 * aviso (como agrupa `ReportesService.pendientes`).
 */
@Controller('admin/pendientes')
@SoloAdmin()
export class PendientesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async pendientes(): Promise<Pendientes> {
    const [horas, consultasSinAtender] = await Promise.all([
      this.prisma.reporteNoUso.groupBy({
        by: ['reservaId'],
        where: { estado: EstadoReporte.PENDIENTE },
      }),
      this.prisma.solicitudContacto.count({
        where: { estado: EstadoSolicitud.NUEVA },
      }),
    ]);

    return { horasPorRevisar: horas.length, consultasSinAtender };
  }
}
