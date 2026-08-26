import { Injectable } from '@nestjs/common';

import type { Prisma, Socio } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Los cuatro campos que cambian lo que el socio puede hacer.
 *
 * El límite es deliberado y es la mitad del valor de esta tabla: que alguien haya
 * suspendido a un socio o le haya extendido la cuota son decisiones que el club puede
 * tener que explicar; que le hayan corregido un dígito al teléfono, no. **Un registro
 * de todo es un registro que nadie mira.**
 */
export const CAMPOS_AUDITADOS = [
  'estado',
  'alDiaHasta',
  'numeroSocio',
  'sancionadoHasta',
] as const;

export type CampoAuditado = (typeof CAMPOS_AUDITADOS)[number];

/** La parte de la ficha que se audita, tal como se lee antes y después. */
export type FichaAuditada = Pick<Socio, CampoAuditado>;

/**
 * El `select` de los campos auditados, en un solo lugar.
 *
 * Lo usan los tres puntos que comparan antes y después. Escrito tres veces, el día
 * que se audite un campo nuevo bastaría con olvidar uno para que ese campo cambiara
 * sin dejar rastro y nada fallara.
 */
export const SELECCION_AUDITADA = {
  estado: true,
  alDiaHasta: true,
  numeroSocio: true,
  sancionadoHasta: true,
} as const;

export interface QuienCambia {
  id: number;
  nombre: string;
}

/**
 * Nombre y apellido de quien hace el cambio, congelados en el renglón.
 *
 * `UsuarioActual` solo trae el nombre de pila, y un historial que dice "Rodrigo
 * cambió el estado" no sirve en un club con dos Rodrigos. La consulta extra vale: se
 * edita una ficha de vez en cuando, y el renglón tiene que leerse solo años después.
 */
async function nombreCompleto(
  tx: Prisma.TransactionClient,
  usuarioId: number,
  porDefecto: string,
): Promise<string> {
  const usuario = await tx.usuario.findUnique({
    where: { id: usuarioId },
    select: { nombre: true, apellido: true },
  });

  return usuario ? `${usuario.nombre} ${usuario.apellido}` : porDefecto;
}

/**
 * Cómo se ve un valor en el historial. Vacío es "no tenía".
 *
 * Las fechas van como fecha civil "AAAA-MM-DD" y no como instante: `alDiaHasta` y
 * `sancionadoHasta` son `@db.Date`, y mostrar su medianoche UTC haría leer un día
 * distinto del que el admin escribió.
 */
function comoSeVe(valor: FichaAuditada[CampoAuditado]): string {
  if (valor === null) return '';
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);

  // El tipo lo garantiza: los cuatro campos son fecha, texto o el enum de estado.
  // Tiparlo en vez de `unknown` es lo que hace que `String()` no pueda recibir un
  // objeto y escribir "[object Object]" en el historial.
  return valor;
}

/**
 * El rastro de los cambios del padrón (T37).
 *
 * **Un solo punto por el que pasan todos los caminos que escriben esos campos**: la
 * edición del panel y la sanción por una hora no usada. Dos copias de esta
 * comparación dejarían un camino sin auditar, y sería el que nadie prueba a mano.
 *
 * Se escribe **dentro de la transacción del cambio**, nunca después: una auditoría
 * que se puede omitir olvidando llamarla no es una auditoría.
 */
@Injectable()
export class CambiosDeSocio {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Compara antes y después, y escribe un renglón por cada campo que cambió.
   *
   * Los que no cambiaron no dejan nada: guardar sin tocar nada es lo que hace
   * cualquiera que abre un formulario y aprieta guardar, y un historial lleno de
   * renglones idénticos es un historial que nadie lee.
   */
  async registrar(
    tx: Prisma.TransactionClient,
    socioId: number,
    antes: FichaAuditada,
    despues: FichaAuditada,
    quien: QuienCambia,
    motivo: string | null = null,
  ): Promise<void> {
    const cambiados = CAMPOS_AUDITADOS.filter(
      (campo) => comoSeVe(antes[campo]) !== comoSeVe(despues[campo]),
    );

    if (cambiados.length === 0) return;

    const hechoPorNombre = await nombreCompleto(tx, quien.id, quien.nombre);

    const renglones = cambiados.map((campo) => ({
      socioId,
      campo,
      valorAnterior: comoSeVe(antes[campo]),
      valorNuevo: comoSeVe(despues[campo]),
      hechoPor: quien.id,
      hechoPorNombre,
      motivo,
    }));

    await tx.cambioSocio.createMany({ data: renglones });
  }

  /**
   * El historial de una ficha, del cambio más reciente al más antiguo.
   *
   * Con techo: una ficha de veinte años puede acumular cientos de renglones, y la
   * pantalla los dibuja todos. Los cien más recientes son los que alguien mira; si
   * algún día hace falta ver más atrás, eso es una consulta con rango de fechas y no
   * una lista más larga.
   */
  historial(socioId: number) {
    return this.prisma.cambioSocio.findMany({
      where: { socioId },
      orderBy: { hechoEn: 'desc' },
      take: 100,
      select: {
        id: true,
        campo: true,
        valorAnterior: true,
        valorNuevo: true,
        hechoPorNombre: true,
        hechoEn: true,
        motivo: true,
      },
    });
  }
}
