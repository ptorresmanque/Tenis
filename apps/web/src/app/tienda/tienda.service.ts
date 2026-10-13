import { HttpClient, HttpErrorResponse, httpResource } from '@angular/common/http';
import { computed, inject, Service } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';

import { Club } from '../club/club.service';
import type { RedireccionAPasarela } from '../core/pagos/ir-a-pagar';
import type { LineaDelCarrito } from './carrito';

interface Nombrado {
  id: number;
  nombre: string;
}

export type OrdenDelCatalogo = 'novedad' | 'precio-asc' | 'precio-desc';

/** Lo que el comprador filtra en `/tienda`. Nulo es "sin ese filtro". */
export interface FiltroDelCatalogo {
  categoriaId: number | null;
  marcaId: number | null;
  talla: string | null;
  precioMin: number | null;
  precioMax: number | null;
  orden: OrdenDelCatalogo;
}

/**
 * Espejo de `FiltrosDelCatalogo` en la API (T161): lo que hay, sacado de lo que se ve, y el
 * texto del arriendo de raquetas (T172), vacío si el club no lo escribió.
 */
export interface FiltrosDelCatalogo {
  arriendoRaquetas: string;
  categorias: Nombrado[];
  marcas: Nombrado[];
  tallas: string[];
  precioMin: number | null;
  precioMax: number | null;
}

/** Espejo de `ProductoDelCatalogo` en la API. */
export interface ProductoDelCatalogo {
  id: number;
  nombre: string;
  categoria: Nombrado;
  marca: Nombrado | null;
  precioClp: number;
  /** Solo para el socio activo y al día con sesión. Lo calcula la API. */
  precioSocioClp: number | null;
  foto: string | null;
  /** Sin stock y sin encargo. */
  agotado: boolean;
  /** Sin stock, pero se vende por encargo (T170). */
  porEncargo: boolean;
}

/** Espejo de `FichaPublica` en la API. */
export interface FichaPublica {
  id: number;
  nombre: string;
  descripcion: string;
  categoria: Nombrado;
  marca: Nombrado | null;
  precioClp: number;
  precioSocioClp: number | null;
  /** Lo que no queda se vende igual, y llega en `diasEncargo` días (T170). */
  aceptaEncargo: boolean;
  diasEncargo: number | null;
  variantes: VariantePublica[];
  /** La tabla de la marca, si la categoría la usa. */
  tallas: { tallaCl: string; tallaUs: string; tallaEu: string }[];
  fotos: { id: number; miniatura: string; imagen: string }[];
}

export interface VariantePublica {
  id: number;
  etiqueta: string;
  /** "CL 40 · US 8 · EU 41", o la etiqueta sola. */
  talla: string;
  /** Nunca menos de cero. */
  disponible: number;
}

export type EstadoPedido =
  | 'PENDIENTE_PAGO'
  | 'PAGADO'
  | 'LISTO_PARA_RETIRO'
  | 'DESPACHADO'
  | 'ENTREGADO'
  | 'CANCELADO'
  | 'EXPIRADO';

export type EntregaPedido = 'RETIRO' | 'DESPACHO' | 'EN_MESON';

/** Lo que manda la pantalla de pago (T166). **Sin precios**: los pone la API. */
export interface DatosDelPedido {
  lineas: LineaDelCarrito[];
  nombre: string;
  email: string;
  /** `56` y los 9 dígitos. */
  telefono: string;
  entrega: 'RETIRO' | 'DESPACHO';
  despacho: { region: string; comuna: string; direccion: string; referencia: string } | null;
  factura: { rut: string; razonSocial: string; giro: string; direccion: string } | null;
}

/** Espejo de `PedidoPublico` en la API (T166): lo que ve quien tiene el enlace. */
export interface PedidoPublico {
  id: number;
  token: string;
  estado: EstadoPedido;
  entrega: EntregaPedido;
  nombre: string;
  email: string;
  region: string | null;
  comuna: string | null;
  direccion: string | null;
  referencia: string | null;
  numeroSeguimiento: string | null;
  totalClp: number;
  descuentoSocioClp: number;
  documento: 'VOUCHER' | 'BOLETA' | 'FACTURA';
  facturaRazonSocial: string | null;
  creadoEn: string;
  pagadoEn: string | null;
  listoEn: string | null;
  despachadoEn: string | null;
  entregadoEn: string | null;
  lineas: {
    descripcion: string;
    cantidad: number;
    precioUnitarioClp: number;
    descuentoUnitarioClp: number;
    esEncargo: boolean;
  }[];
}

/** Un pedido en "Mis pedidos". */
export interface PedidoMio {
  id: number;
  token: string;
  estado: EstadoPedido;
  entrega: EntregaPedido;
  totalClp: number;
  creadoEn: string;
  _count: { lineas: number };
}

/**
 * La tienda en línea para el sitio público (T162).
 *
 * **Se ofrece cuando tiene algo que vender**: encendida en este ambiente y con al menos un
 * producto a la venta, que es cuando `GET /api/tienda/filtros` trae alguna categoría
 * (`SPEC-tienda.md` § El interruptor). Lo leen el menú y el bloque informativo de la
 * tienda, así que es un recurso compartido, como el del club.
 */
@Service()
export class Tienda {
  private readonly http = inject(HttpClient);
  private readonly club = inject(Club).datos;

  // Apagada, ni se pregunta: la API respondería 404.
  private readonly recurso = httpResource<FiltrosDelCatalogo>(() =>
    this.club().tiendaHabilitada ? '/api/tienda/filtros' : undefined,
  );

  /** Lo que hay para filtrar, o nulo mientras no se sabe (o si no se pudo saber). */
  readonly filtros = computed(() => (this.recurso.hasValue() ? this.recurso.value() : null));

  readonly abierta = computed(() => (this.filtros()?.categorias.length ?? 0) > 0);

  productos(filtro: FiltroDelCatalogo): Promise<ProductoDelCatalogo[]> {
    // Solo los que vienen: la URL de la API queda tan limpia como la del sitio.
    const params = Object.fromEntries(
      Object.entries(filtro).filter(([, valor]) => valor !== null),
    ) as Record<string, string | number>;

    return firstValueFrom(
      this.http.get<ProductoDelCatalogo[]>('/api/tienda/productos', { params }),
    );
  }

  /**
   * Nula si no está a la venta: la API responde 404 igual para un borrador que para lo que
   * no existe, y para quien mira es lo mismo. Cualquier otra falla sigue siendo falla.
   */
  ficha(id: number): Promise<FichaPublica | null> {
    return nuloSiNoExiste(this.http.get<FichaPublica>(`/api/tienda/productos/${id}`));
  }

  /** Las 16 regiones del despacho, de la API: la misma lista que valida. */
  regiones(): Promise<string[]> {
    return firstValueFrom(this.http.get<string[]>('/api/tienda/regiones'));
  }

  crearPedido(datos: DatosDelPedido): Promise<{ token: string; totalClp: number }> {
    return firstValueFrom(
      this.http.post<{ token: string; totalClp: number }>('/api/tienda/pedidos', datos),
    );
  }

  pagarPedido(token: string): Promise<RedireccionAPasarela & { totalClp: number }> {
    return firstValueFrom(
      this.http.post<RedireccionAPasarela & { totalClp: number }>(
        `/api/tienda/pedidos/${token}/pagar`,
        {},
      ),
    );
  }

  /** Nulo si el enlace no es de ningún pedido. */
  pedido(token: string): Promise<PedidoPublico | null> {
    return nuloSiNoExiste(
      this.http.get<PedidoPublico>(`/api/tienda/pedidos/${encodeURIComponent(token)}`),
    );
  }

  misPedidos(): Promise<PedidoMio[]> {
    return firstValueFrom(this.http.get<PedidoMio[]>('/api/tienda/pedidos/mios'));
  }
}

/** El 404 es una respuesta, no una falla: lo que se buscó no existe. */
async function nuloSiNoExiste<T>(peticion: Observable<T>): Promise<T | null> {
  try {
    return await firstValueFrom(peticion);
  } catch (error) {
    if (error instanceof HttpErrorResponse && error.status === 404) return null;
    throw error;
  }
}
