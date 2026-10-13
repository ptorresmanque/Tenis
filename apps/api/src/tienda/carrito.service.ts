import { Injectable } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import type { UsuarioActual } from '../identidad/usuario-actual';
import { PrismaService } from '../prisma/prisma.service';
import type { LineaDelCarrito } from './carrito.dto';
import { disponibles } from './disponible';
import { direccionesDeLaFoto } from './fotos.service';
import { descuentoUnitario, porcentajeDeSocio } from './precio';
import { textoDeTalla } from './tallas';

/**
 * `ok`, se puede comprar; `sin-stock`, pide más de lo que queda; `no-disponible`, ya no
 * se vende: un borrador, algo archivado, una variante inactiva o un id que no existe.
 */
export type EstadoDeLinea = 'ok' | 'sin-stock' | 'no-disponible';

export interface LineaCotizada {
  varianteId: number;
  cantidad: number;
  /** Nulo solo si la variante no existe: de lo archivado se sigue sabiendo qué era. */
  producto: {
    id: number;
    nombre: string;
    marca: string | null;
    foto: string | null;
  } | null;
  /** "CL 40 · US 8 · EU 41", o la etiqueta sola. */
  talla: string | null;
  /** El de siempre, por unidad. Nulo si ya no se vende: no hay a qué precio. */
  precioUnitarioClp: number | null;
  /** El de socio, por unidad, o cero. */
  descuentoUnitarioClp: number;
  /** (precio − descuento) × cantidad. Cero si ya no se vende. */
  subtotalClp: number;
  /** El stock menos lo apartado por pedidos sin pagar, nunca menos de cero (T164). */
  disponible: number;
  /** Pide más de lo que queda y el producto acepta encargo (T170): llega en `diasEncargo`. */
  porEncargo: boolean;
  diasEncargo: number | null;
  estado: EstadoDeLinea;
}

export interface Cotizacion {
  lineas: LineaCotizada[];
  /** Sin descuento. */
  subtotalClp: number;
  descuentoClp: number;
  totalClp: number;
  /** Hay algo y todo se puede comprar como está. */
  sePuedePagar: boolean;
  /** Nada va por encargo: lo que va por encargo se retira en el club (T170). */
  sePuedeDespachar: boolean;
}

/**
 * El carrito cotizado (T163). **Todo sale de la base**: el navegador manda qué y cuánto,
 * y el precio, el descuento y lo disponible se calculan acá cada vez.
 */
@Injectable()
export class CarritoDeLaTienda {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `db` es la transacción del pedido (T164), que cotiza con las variantes ya tomadas
   * con `FOR UPDATE`; el carrito cotiza con el cliente de siempre.
   */
  async cotizar(
    lineas: LineaDelCarrito[],
    yo: UsuarioActual | null,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Cotizacion> {
    const [variantes, porcentaje] = await Promise.all([
      db.variante.findMany({
        where: { id: { in: lineas.map((l) => l.varianteId) } },
        select: {
          id: true,
          etiqueta: true,
          stock: true,
          activa: true,
          producto: {
            select: {
              id: true,
              nombre: true,
              precioClp: true,
              publicado: true,
              archivado: true,
              aceptaEncargo: true,
              diasEncargo: true,
              categoria: { select: { usaTablaDeTallas: true } },
              marca: {
                select: {
                  nombre: true,
                  tallas: {
                    select: { tallaCl: true, tallaUs: true, tallaEu: true },
                  },
                },
              },
              fotos: {
                select: { id: true },
                orderBy: [{ orden: 'asc' }, { id: 'asc' }],
                take: 1,
              },
            },
          },
        },
      }),
      porcentajeDeSocio(db, yo),
    ]);
    const porId = new Map(variantes.map((v) => [v.id, v]));
    const quedan = await disponibles(db, variantes);

    const cotizadas = lineas.map(({ varianteId, cantidad }): LineaCotizada => {
      const variante = porId.get(varianteId);
      if (!variante) {
        return {
          varianteId,
          cantidad,
          producto: null,
          talla: null,
          precioUnitarioClp: null,
          descuentoUnitarioClp: 0,
          subtotalClp: 0,
          disponible: 0,
          porEncargo: false,
          diasEncargo: null,
          estado: 'no-disponible',
        };
      }

      const { producto } = variante;
      const seVende =
        variante.activa && producto.publicado && !producto.archivado;
      const disponible = seVende ? (quedan.get(variante.id) ?? 0) : 0;
      // Lo que falta se vende por encargo si el producto lo acepta: la línea entera llega en
      // los días del encargo, aunque parte esté en el club.
      const falta = cantidad > disponible;
      const porEncargo = seVende && falta && producto.aceptaEncargo;
      const descuento =
        seVende && porcentaje !== null
          ? descuentoUnitario(producto.precioClp, porcentaje)
          : 0;

      return {
        varianteId,
        cantidad,
        producto: {
          id: producto.id,
          nombre: producto.nombre,
          marca: producto.marca?.nombre ?? null,
          foto: producto.fotos[0]
            ? direccionesDeLaFoto(producto.fotos[0].id).miniatura
            : null,
        },
        talla: textoDeTalla(
          variante.etiqueta,
          producto.categoria.usaTablaDeTallas,
          producto.marca?.tallas ?? [],
        ),
        precioUnitarioClp: seVende ? producto.precioClp : null,
        descuentoUnitarioClp: descuento,
        subtotalClp: seVende ? (producto.precioClp - descuento) * cantidad : 0,
        disponible,
        porEncargo,
        diasEncargo: porEncargo ? producto.diasEncargo : null,
        estado: !seVende
          ? 'no-disponible'
          : falta && !porEncargo
            ? 'sin-stock'
            : 'ok',
      };
    });

    const subtotalClp = suma(
      cotizadas.map((l) => (l.precioUnitarioClp ?? 0) * l.cantidad),
    );
    const totalClp = suma(cotizadas.map((l) => l.subtotalClp));

    return {
      lineas: cotizadas,
      subtotalClp,
      descuentoClp: subtotalClp - totalClp,
      totalClp,
      sePuedePagar:
        cotizadas.length > 0 && cotizadas.every((l) => l.estado === 'ok'),
      sePuedeDespachar: !cotizadas.some((l) => l.porEncargo),
    };
  }
}

function suma(montos: number[]): number {
  return montos.reduce((total, monto) => total + monto, 0);
}
