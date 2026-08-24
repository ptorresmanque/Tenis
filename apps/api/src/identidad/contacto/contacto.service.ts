import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { EstadoSolicitud, TipoSolicitud } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { InvitacionesService } from '../socios/invitaciones.service';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly invitaciones: InvitacionesService,
  ) {}

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

  /**
   * Convierte la solicitud en una invitación de socio: el circuito completo.
   *
   * Interesado → invitación → cuenta → socio. **El enlace entre las dos filas es lo
   * que permite contar la conversión**; sin él, "llegaron treinta interesados" y
   * "entraron cuatro socios" son dos números que nadie puede juntar.
   *
   * Reusa `InvitacionesService` y no crea la invitación acá: esa operación ya sabe
   * asociar en el acto a quien tenga cuenta, y duplicarla dejaría dos altas de socio
   * que se comportan distinto.
   */
  async invitar(
    id: number,
    numeroSocio: string | undefined,
    adminUsuarioId: number,
  ) {
    const solicitud = await this.laSolicitud(id);

    if (solicitud.tipo !== TipoSolicitud.SOCIO) {
      throw new ConflictException(
        'Esa solicitud no es de alguien que quiera asociarse. Invitar como socio a ' +
          'quien preguntó por otra cosa lo mete en el padrón sin haberlo pedido.',
      );
    }

    if (solicitud.invitacionId !== null) {
      throw new ConflictException('Esa solicitud ya tiene su invitación.');
    }

    const invitacion = await this.invitaciones.invitar({
      email: solicitud.email,
      numeroSocio,
    });

    await this.prisma.solicitudContacto.update({
      where: { id },
      data: {
        invitacionId: invitacion.id,
        estado: EstadoSolicitud.ATENDIDA,
        atendidaEn: new Date(),
        atendidaPor: adminUsuarioId,
      },
    });

    return invitacion;
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
