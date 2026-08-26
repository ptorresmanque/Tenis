import {
  BadRequestException,
  Body,
  Controller,
  ConflictException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { SoloAdmin, Yo } from '../guards';
import type { UsuarioActual } from '../usuario-actual';

export interface Administrador {
  id: number;
  nombre: string;
  email: string;
  esAdmin: boolean;
}

/**
 * Quién puede entrar al panel.
 *
 * Hasta ahora el rol se cambiaba escribiendo en la base. Dos reglas sostienen esta
 * pantalla, y las dos existen porque el error que evitan no tiene arreglo desde la
 * propia aplicación:
 *
 * - **nadie se quita el rol a sí mismo**: es el clic con el que alguien se deja
 *   afuera del panel sin querer, y para volver a entrar hace falta la base;
 * - **el club no se queda sin administradores**: quitarle el rol al último deja el
 *   panel cerrado para todos, incluido quien lo hizo.
 */
@Controller('admin/administradores')
@SoloAdmin()
export class AdministradoresController {
  constructor(private readonly prisma: PrismaService) {}

  /** Los que hoy tienen el panel abierto. */
  @Get()
  listar(): Promise<Administrador[]> {
    return this.prisma.usuario.findMany({
      where: { esAdmin: true },
      select: { id: true, nombre: true, email: true, esAdmin: true },
      orderBy: { nombre: 'asc' },
    });
  }

  /**
   * Da o quita el rol.
   *
   * Se busca por correo y no por id: quien lo usa está leyendo una lista de socios,
   * y el id de usuario no aparece en ninguna pantalla.
   */
  @Patch('por-correo')
  async cambiarPorCorreo(
    @Body() cuerpo: unknown,
    @Yo() yo: UsuarioActual,
  ): Promise<Administrador> {
    const datos = (cuerpo ?? {}) as Record<string, unknown>;
    // `String(valor)` no sirve: un `{ "email": {} }` se convierte en
    // "[object Object]", que no está vacío y pasaría el control de abajo.
    const email =
      typeof datos.email === 'string' ? datos.email.trim().toLowerCase() : '';

    if (!email) throw new BadRequestException('Falta el correo.');
    if (typeof datos.esAdmin !== 'boolean') {
      throw new BadRequestException('Falta decir si entra o sale del panel.');
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!usuario) {
      throw new BadRequestException(
        'Nadie tiene ese correo. La persona necesita una cuenta antes de ser ' +
          'administradora.',
      );
    }

    return this.cambiar(usuario.id, datos.esAdmin, yo);
  }

  @Patch(':id')
  async cambiarPorId(
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
    @Yo() yo: UsuarioActual,
  ): Promise<Administrador> {
    const datos = (cuerpo ?? {}) as Record<string, unknown>;

    if (typeof datos.esAdmin !== 'boolean') {
      throw new BadRequestException('Falta decir si entra o sale del panel.');
    }

    return this.cambiar(id, datos.esAdmin, yo);
  }

  private async cambiar(
    id: number,
    esAdmin: boolean,
    yo: UsuarioActual,
  ): Promise<Administrador> {
    if (!esAdmin && id === yo.id) {
      throw new ConflictException(
        'No puedes quitarte a ti el acceso al panel: pídeselo a otro ' +
          'administrador.',
      );
    }

    if (!esAdmin) {
      const cuantos = await this.prisma.usuario.count({
        where: { esAdmin: true },
      });

      if (cuantos <= 1) {
        throw new ConflictException(
          'Es la última persona con acceso al panel. Nombra a otra antes de ' +
            'quitarle el rol.',
        );
      }
    }

    return this.prisma.usuario.update({
      where: { id },
      data: { esAdmin },
      select: { id: true, nombre: true, email: true, esAdmin: true },
    });
  }
}
