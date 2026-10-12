import { HttpClient, HttpErrorResponse, httpResource } from '@angular/common/http';
import { computed, inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Club } from '../club/club.service';

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

/** Espejo de `FiltrosDelCatalogo` en la API (T161): lo que hay, sacado de lo que se ve. */
export interface FiltrosDelCatalogo {
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
  agotado: boolean;
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
  async ficha(id: number): Promise<FichaPublica | null> {
    try {
      return await firstValueFrom(this.http.get<FichaPublica>(`/api/tienda/productos/${id}`));
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 404) return null;
      throw error;
    }
  }
}
