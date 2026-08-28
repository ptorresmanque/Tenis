import { Controller, ForbiddenException, Get } from '@nestjs/common';

import { EstadoSocio } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SoloSocio, Yo } from '../guards';
// `import type`: con isolatedModules y emitDecoratorMetadata, un tipo que aparece
// en una firma decorada no puede entrar como import normal.
import type { UsuarioActual } from '../usuario-actual';

export interface SocioDelDirectorio {
  numeroSocio: string;
  nombre: string;
}

/**
 * Con quién puede jugar un socio: la lista de los demás socios activos.
 *
 * **Solo número y nombre.** Ni correo ni teléfono: esto es para elegir de una lista
 * al reservar, no una libreta de contactos del club.
 *
 * `@SoloSocio()` y no `@Autenticado()`: quien no tiene ficha no puede declarar
 * acompañantes, y sin ficha esto sería un padrón abierto a cualquiera que se registre.
 */
@Controller('socios')
export class DirectorioController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @SoloSocio()
  async listar(@Yo() yo: UsuarioActual): Promise<SocioDelDirectorio[]> {
    if (yo.socioId === null) {
      // `@SoloSocio()` ya lo garantiza. Se comprueba igual porque el alternativa
      // era un `?? 0` que, si el guard cambiara, devolvería el padrón entero sin
      // que nada se queje: mejor caerse que filtrar en silencio.
      throw new ForbiddenException('Esto es solo para socios del club.');
    }

    const socios = await this.prisma.socio.findMany({
      // Uno no se acompaña a sí mismo: dejarse en la lista es ofrecer un error que
      // el servicio rechaza después, cuando ya se eligió.
      where: { estado: EstadoSocio.ACTIVO, id: { not: yo.socioId } },
      select: {
        numeroSocio: true,
        usuario: { select: { nombre: true, apellido: true } },
      },
      orderBy: [
        { usuario: { apellido: 'asc' } },
        { usuario: { nombre: 'asc' } },
      ],
    });

    return socios.map((socio) => ({
      numeroSocio: socio.numeroSocio,
      nombre: `${socio.usuario.nombre} ${socio.usuario.apellido}`.trim(),
    }));
  }
}
