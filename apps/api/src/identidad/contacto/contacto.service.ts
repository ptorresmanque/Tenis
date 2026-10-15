import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { EstadoSolicitud, TipoSolicitud } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface SolicitudNueva {
  tipo: TipoSolicitud;
  nombre: string;
  email: string;
  telefono: string;
  mensaje: string | null;
}

/**
 * Quién le escribió al club desde afuera (T38).
 *
 * Cierra la problemática 2.5 del perfil: hasta hoy, quien quería asociarse tenía que
 * conseguir el teléfono de alguien. Los cuatro tipos son los públicos que el perfil
 * describe y van separados porque **van a manos distintas**: el interesado en
 * asociarse lo atiende la administración, el de clases el profesor, y el de empresas
 * la directiva.
 */
@Injectable()
export class ContactoService {
  constructor(private readonly prisma: PrismaService) {}

  recibir(datos: SolicitudNueva) {
    return this.prisma.solicitudContacto.create({ data: datos });
  }

  /** La bandeja del club, de la más nueva a la más vieja. */
  bandeja(filtros: { estado?: EstadoSolicitud; tipo?: TipoSolicitud }) {
    return this.prisma.solicitudContacto.findMany({
      where: { estado: filtros.estado, tipo: filtros.tipo },
      orderBy: { creadaEn: 'desc' },
      // Con techo, como el historial del padrón: la bandeja de un club con sitio
      // público crece sola, y la pantalla dibuja lo que reciba.
      take: 200,
    });
  }

  async resolver(
    id: number,
    estado: EstadoSolicitud,
    nota: string | null,
    adminUsuarioId: number,
  ) {
    if (estado === EstadoSolicitud.NUEVA) {
      // Volver a "nueva" no es una decisión, es deshacer: si el club se equivocó,
      // vuelve a atenderla con otra nota. Permitirlo borraría quién la atendió.
      throw new BadRequestException(
        'Una solicitud no vuelve a estar sin atender.',
      );
    }

    await this.laSolicitud(id);

    return this.prisma.solicitudContacto.update({
      where: { id },
      data: {
        estado,
        nota,
        atendidaEn: new Date(),
        atendidaPor: adminUsuarioId,
      },
    });
  }

  private async laSolicitud(id: number) {
    const solicitud = await this.prisma.solicitudContacto.findUnique({
      where: { id },
    });

    if (!solicitud) {
      throw new NotFoundException('No hay una solicitud con ese número.');
    }

    return solicitud;
  }
}
