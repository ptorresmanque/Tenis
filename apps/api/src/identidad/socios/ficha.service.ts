import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { EstadoSocio, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { UsuarioActual } from '../usuario-actual';
import {
  CambiosDeSocio,
  CAMPOS_AUDITADOS,
  SELECCION_AUDITADA,
} from './cambios.service';

/** Lo que el admin puede cambiar de una ficha. Todo opcional: se toca lo que viaja. */
export interface CambiosDeFicha {
  estado?: EstadoSocio;
  alDiaHasta?: Date;
  numeroSocio?: string;
  sancionadoHasta?: Date | null;
}

/**
 * La ficha de un socio, editada desde el panel.
 *
 * **Hasta T37 esto no existía**: cambiar el estado de un socio o extenderle la cuota
 * exigía escribir en la base, que es literalmente la problemática 2.4 del perfil —el
 * padrón se corregía a mano sin constancia de quién ni cuándo—. El mensaje de
 * `invitar` ya prometía que "su ficha se edita desde la lista de socios"; ahora es
 * verdad.
 *
 * Cada cambio pasa por `CambiosDeSocio` en la misma transacción. Ver `SPEC-identidad.md`
 * § Cambiar la ficha de un socio deja rastro.
 */
@Injectable()
export class FichaDeSocioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cambios: CambiosDeSocio,
  ) {}

  async editar(
    socioId: number,
    cambios: CambiosDeFicha,
    yo: UsuarioActual,
    motivo: string | null,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // **Se lee dentro de la transacción**, no antes. Leyéndolo fuera queda una
        // ventana entre la lectura y la escritura: si otro admin suspende al socio en
        // el medio, este renglón diría que se partió de ACTIVO cuando ya estaba
        // SUSPENDIDO —y si los valores coinciden con los leídos, no deja renglón y el
        // cambio queda sin rastro—. Un historial que miente sobre el punto de partida
        // no sirve para lo único que existe: explicar una decisión.
        const antes = await tx.socio.findUnique({
          where: { id: socioId },
          select: SELECCION_AUDITADA,
        });

        if (!antes)
          throw new NotFoundException('No hay un socio con ese número.');

        const despues = await tx.socio.update({
          where: { id: socioId },
          data: cambios,
          select: {
            id: true,
            ...SELECCION_AUDITADA,
            usuario: { select: { nombre: true, apellido: true, email: true } },
          },
        });

        await this.cambios.registrar(
          tx,
          socioId,
          antes,
          despues,
          {
            id: yo.id,
            nombre: yo.nombre,
          },
          motivo,
        );

        return despues;
      });
    } catch (falla) {
      // El único de `numeroSocio`. Se traduce acá y no se deja escapar como 500: el
      // admin escribió un número que ya es de otra persona y tiene que poder saberlo.
      if (
        falla instanceof Prisma.PrismaClientKnownRequestError &&
        falla.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ese número de socio ya es de otra persona.',
        );
      }

      throw falla;
    }
  }

  historial(socioId: number) {
    return this.cambios.historial(socioId);
  }
}

/**
 * Lee los cambios del cuerpo, y **descarta lo que no es campo de derechos**.
 *
 * Un `telefono` que llegue en el cuerpo no se escribe ni deja renglón: no es de esta
 * ficha —vive en `Usuario`— y aceptarlo acá sería auditar a medias un dato que este
 * módulo decidió no auditar.
 */
export function leerCambiosDeFicha(cuerpo: unknown): {
  cambios: CambiosDeFicha;
  motivo: string | null;
} {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;
  const cambios: CambiosDeFicha = {};

  if (datos.estado !== undefined) {
    const estados = Object.values(EstadoSocio) as string[];

    if (typeof datos.estado !== 'string' || !estados.includes(datos.estado)) {
      throw new BadRequestException(
        `El estado tiene que ser uno de: ${estados.join(', ')}.`,
      );
    }

    cambios.estado = datos.estado as EstadoSocio;
  }

  if (datos.alDiaHasta !== undefined) {
    cambios.alDiaHasta = fechaCivil(
      datos.alDiaHasta,
      'la vigencia de la cuota',
    );
  }

  if (datos.sancionadoHasta !== undefined) {
    cambios.sancionadoHasta =
      datos.sancionadoHasta === null
        ? null
        : fechaCivil(datos.sancionadoHasta, 'la sanción');
  }

  if (datos.numeroSocio !== undefined) {
    const numero =
      typeof datos.numeroSocio === 'string' ? datos.numeroSocio.trim() : '';

    if (numero === '') {
      throw new BadRequestException(
        'El número de socio no puede quedar vacío.',
      );
    }

    cambios.numeroSocio = numero;
  }

  const motivo = typeof datos.motivo === 'string' ? datos.motivo.trim() : '';

  if (Object.keys(cambios).length === 0) {
    throw new BadRequestException(
      `No hay nada que cambiar. Se editan: ${CAMPOS_AUDITADOS.join(', ')}.`,
    );
  }

  return { cambios, motivo: motivo || null };
}

/**
 * "AAAA-MM-DD" a medianoche UTC, que es como se guardan las fechas civiles.
 *
 * Sin hora a propósito: `alDiaHasta` dice hasta qué día, no hasta qué instante, y
 * aceptar un ISO completo dejaría a un socio al día unas horas más o menos según la
 * zona del navegador que lo mandó.
 */
function fechaCivil(valor: unknown, campo: string): Date {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw new BadRequestException(`Escribe ${campo} como AAAA-MM-DD.`);
  }

  const fecha = new Date(`${valor}T00:00:00.000Z`);

  if (Number.isNaN(fecha.getTime())) {
    throw new BadRequestException(`Esa fecha para ${campo} no existe.`);
  }

  return fecha;
}
