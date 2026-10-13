import {
  BadRequestException,
  Body,
  Controller,
  ConflictException,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';

import { EstadoSocio, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SoloAdmin, Yo } from '../guards';
import type { UsuarioActual } from '../usuario-actual';

export interface UsuarioDeLaLista {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  telefono: string | null;
  creadoEn: Date;
  esAdmin: boolean;
  esGestor: boolean;
  socio: { id: number; numeroSocio: string; estado: EstadoSocio } | null;
  profesor: { id: number; nombreVisible: string; activo: boolean } | null;
}

export interface ListadoDeUsuarios {
  usuarios: UsuarioDeLaLista[];
  total: number;
  pagina: number;
  porPagina: number;
}

const POR_PAGINA = 50;

const FILA = {
  id: true,
  nombre: true,
  apellido: true,
  email: true,
  telefono: true,
  creadoEn: true,
  esAdmin: true,
  esGestor: true,
  socio: { select: { id: true, numeroSocio: true, estado: true } },
  profesor: { select: { id: true, nombreVisible: true, activo: true } },
} satisfies Prisma.UsuarioSelect;

/**
 * Todos los usuarios del club y sus tipos (T216, `SPEC-identidad.md` § Tipos de usuario).
 *
 * Reemplaza a Administradores, que solo daba el admin. Acá se dan el admin y el gestor;
 * socio y profesor son fichas, y se dan desde sus propios módulos (la invitación y
 * `admin/profesores`), que la pantalla llama directo.
 *
 * Las dos reglas que venían de Administradores existen porque el error que evitan no
 * tiene arreglo desde la propia aplicación:
 *
 * - **nadie se quita el admin a sí mismo**: es el clic con el que alguien se deja afuera
 *   del panel sin querer, y para volver a entrar hace falta la base;
 * - **el club no se queda sin admins**: con la regla de arriba, al último solo se llega
 *   por una carrera —dos admins que se lo quitan uno al otro a la vez—, y por eso el
 *   conteo va con candado.
 */
@Controller('admin/usuarios')
@SoloAdmin()
export class UsuariosController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * De a 50, por nombre. Con `q`, **cada palabra** tiene que estar en el nombre, el
   * apellido o el correo: "ana rojas" encuentra a Ana Rojas y no a toda Ana. La
   * intercalación de la base ya ignora mayúsculas y tildes.
   */
  @Get()
  async listar(
    @Query('q') q = '',
    @Query('pagina') pagina = '1',
  ): Promise<ListadoDeUsuarios> {
    const numero = Number(pagina);
    if (!Number.isInteger(numero) || numero < 1) {
      throw new BadRequestException('La página es un número desde 1.');
    }

    const where: Prisma.UsuarioWhereInput = {
      AND: q
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((palabra) => ({
          OR: [
            { nombre: { contains: palabra } },
            { apellido: { contains: palabra } },
            { email: { contains: palabra } },
          ],
        })),
    };

    const [usuarios, total] = await Promise.all([
      this.prisma.usuario.findMany({
        where,
        select: FILA,
        orderBy: [{ nombre: 'asc' }, { apellido: 'asc' }, { id: 'asc' }],
        skip: (numero - 1) * POR_PAGINA,
        take: POR_PAGINA,
      }),
      this.prisma.usuario.count({ where }),
    ]);

    return { usuarios, total, pagina: numero, porPagina: POR_PAGINA };
  }

  /** Enciende o apaga el admin y el gestor. Lo que no venga, no se toca. */
  @Patch(':id')
  async cambiar(
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
    @Yo() yo: UsuarioActual,
  ): Promise<UsuarioDeLaLista> {
    const datos = (cuerpo ?? {}) as Record<string, unknown>;
    const cambio: { esAdmin?: boolean; esGestor?: boolean } = {};

    for (const campo of ['esAdmin', 'esGestor'] as const) {
      if (datos[campo] === undefined) continue;
      if (typeof datos[campo] !== 'boolean') {
        throw new BadRequestException(`${campo} tiene que ser sí o no.`);
      }
      cambio[campo] = datos[campo];
    }

    if (Object.keys(cambio).length === 0) {
      throw new BadRequestException('No hay nada que cambiar.');
    }

    if (cambio.esAdmin === false && id === yo.id) {
      throw new ConflictException(
        'No puedes quitarte a ti el acceso al panel: pídeselo a otro ' +
          'administrador.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const existe = await tx.usuario.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!existe) throw new NotFoundException('No hay un usuario con ese id.');

      if (cambio.esAdmin === false) {
        // Con candado: dos que se quitan el admin uno al otro a la vez cuentan uno
        // después del otro, y el segundo ve que queda uno solo.
        // ponytail: sin índice en `es_admin`, el candado recorre la tabla entera por lo
        // que dura la transacción (milisegundos, y solo al quitar un admin). Si llega a
        // notarse, un índice en `es_admin` lo deja en las filas de los admins.
        const admins = await tx.$queryRaw<{ id: number }[]>`
          SELECT id FROM usuario WHERE es_admin = TRUE FOR UPDATE`;

        if (
          admins.length <= 1 &&
          admins.some((fila) => Number(fila.id) === id)
        ) {
          throw new ConflictException(
            'Es la última persona con acceso al panel. Nombra a otra antes de ' +
              'quitarle el rol.',
          );
        }
      }

      return tx.usuario.update({ where: { id }, data: cambio, select: FILA });
    });
  }
}
