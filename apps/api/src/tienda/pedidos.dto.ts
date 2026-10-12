import { BadRequestException } from '@nestjs/common';

import { leerTelefono } from '../comun/telefono';
import { LineaDelCarrito, leerCarrito } from './carrito.dto';
import { REGIONES } from './regiones';
import { normalizarRut } from './rut';

/** Un pedido como lo manda la pantalla de pago (T164). **Sin precios**: los pone la API. */
export interface PedidoNuevo {
  lineas: LineaDelCarrito[];
  nombre: string;
  email: string;
  /** `56` y los 9 dígitos. */
  telefono: string;
  entrega: 'RETIRO' | 'DESPACHO';
  /** Solo con despacho. */
  despacho: {
    region: string;
    comuna: string;
    direccion: string;
    referencia: string | null;
  } | null;
  /** Solo si pidió factura. */
  factura: {
    rut: string;
    razonSocial: string;
    giro: string;
    direccion: string;
  } | null;
}

/**
 * Lo que se lee del cuerpo. Las líneas pasan por `leerCarrito`, que descarta cualquier
 * precio. **Con retiro, una dirección que venga se descarta**: no se guarda lo que no se
 * va a usar.
 */
export function leerPedido(cuerpo: unknown): PedidoNuevo {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;
  const lineas = leerCarrito(datos);

  if (lineas.length === 0) {
    throw new BadRequestException('El carrito está vacío.');
  }
  if (datos.entrega !== 'RETIRO' && datos.entrega !== 'DESPACHO') {
    throw new BadRequestException(
      'La entrega es retiro en el club o despacho.',
    );
  }

  return {
    lineas,
    nombre: texto(datos.nombre, 'tu nombre', 120),
    email: correo(datos.email),
    telefono: leerTelefono(datos.telefono, { obligatorio: true }),
    entrega: datos.entrega,
    despacho: datos.entrega === 'DESPACHO' ? despacho(datos.despacho) : null,
    factura:
      datos.factura === undefined || datos.factura === null
        ? null
        : factura(datos.factura),
  };
}

function despacho(valor: unknown): NonNullable<PedidoNuevo['despacho']> {
  const datos = (valor ?? {}) as Record<string, unknown>;

  if (!REGIONES.includes(datos.region as (typeof REGIONES)[number])) {
    throw new BadRequestException('Elige la región de la lista.');
  }

  return {
    region: datos.region as string,
    comuna: texto(datos.comuna, 'la comuna', 80),
    direccion: texto(datos.direccion, 'la dirección', 200),
    referencia: texto(datos.referencia, 'la referencia', 200, false) || null,
  };
}

function factura(valor: unknown): NonNullable<PedidoNuevo['factura']> {
  const datos = (valor ?? {}) as Record<string, unknown>;
  const rut = typeof datos.rut === 'string' ? normalizarRut(datos.rut) : null;

  if (rut === null) {
    throw new BadRequestException(
      'El RUT de la factura no es válido: revisa el dígito verificador.',
    );
  }

  return {
    rut,
    razonSocial: texto(datos.razonSocial, 'la razón social', 120),
    giro: texto(datos.giro, 'el giro', 120),
    direccion: texto(datos.direccion, 'la dirección de la factura', 200),
  };
}

/** Se exige texto y no se convierte: `String({})` es "[object Object]", no vacío. */
function texto(
  valor: unknown,
  campo: string,
  largo: number,
  obligatorio = true,
): string {
  const limpio = typeof valor === 'string' ? valor.trim() : '';

  if (obligatorio && !limpio) throw new BadRequestException(`Falta ${campo}.`);
  if (limpio.length > largo) {
    throw new BadRequestException(
      `Acorta ${campo}: tiene más de ${largo} caracteres.`,
    );
  }

  return limpio;
}

/** Flojo a propósito, como el del no-socio: lo que importa es poder escribirle. */
function correo(valor: unknown): string {
  const limpio = texto(valor, 'tu correo', 120);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)) {
    throw new BadRequestException('El correo no parece un correo.');
  }

  return limpio;
}
