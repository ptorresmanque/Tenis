import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type EstadoDeProducto = 'borrador' | 'publicado' | 'archivado';

/** Espejo de `ProductoDeLaLista` en la API (T158). */
export interface ProductoDeLaLista {
  id: number;
  nombre: string;
  categoria: { id: number; nombre: string };
  marca: { id: number; nombre: string } | null;
  precioClp: number;
  publicado: boolean;
  archivado: boolean;
  /** La suma de sus variantes activas. Puede ser negativa. */
  stockTotal: number;
  /** El de su variante activa más baja; nulo si no tiene ninguna (T159). */
  stockMinimo: number | null;
  variantes: number;
  /** La miniatura de su primera foto. */
  foto: string | null;
}

export interface VarianteDelProducto {
  id: number;
  etiqueta: string;
  codigoBarras: string | null;
  stock: number;
  activa: boolean;
}

export interface FotoDelProducto {
  id: number;
  /** La primera es la portada del catálogo. */
  orden: number;
  miniatura: string;
  imagen: string;
}

/** Espejo de `FichaDeProducto` en la API (T158). */
export interface FichaDeProducto {
  id: number;
  nombre: string;
  descripcion: string;
  categoriaId: number;
  marcaId: number | null;
  precioClp: number;
  publicado: boolean;
  archivado: boolean;
  aceptaEncargo: boolean;
  diasEncargo: number | null;
  variantes: VarianteDelProducto[];
  fotos: FotoDelProducto[];
}

/** Lo que el admin escribe en los datos de un producto. */
export interface DatosDelProducto {
  nombre: string;
  descripcion: string;
  categoriaId: number;
  marcaId: number | null;
  precioClp: number;
}

/** Una variante nueva: el stock con que nace entra como una entrada, con su autor. */
export interface VarianteNueva {
  etiqueta: string;
  codigoBarras: string | null;
  stock: number;
}

/** Los productos, sus variantes y sus fotos, para el panel de la tienda (T159). */
@Service()
export class ProductosDeLaTienda {
  private readonly http = inject(HttpClient);

  listar(filtro: {
    estado: EstadoDeProducto | null;
    categoriaId: number | null;
  }): Promise<ProductoDeLaLista[]> {
    let params = new HttpParams();
    if (filtro.estado) params = params.set('estado', filtro.estado);
    if (filtro.categoriaId) params = params.set('categoriaId', filtro.categoriaId);

    return firstValueFrom(
      this.http.get<ProductoDeLaLista[]>('/api/admin/tienda/productos', { params }),
    );
  }

  ficha(id: number): Promise<FichaDeProducto> {
    return firstValueFrom(this.http.get<FichaDeProducto>(`/api/admin/tienda/productos/${id}`));
  }

  /** Nace en borrador, sin variantes: se agregan en su ficha. */
  crear(datos: DatosDelProducto): Promise<FichaDeProducto> {
    return firstValueFrom(this.http.post<FichaDeProducto>('/api/admin/tienda/productos', datos));
  }

  /** Solo lo que cambia: los datos, o publicar y archivar. */
  editar(
    id: number,
    cambio: Partial<
      DatosDelProducto & {
        publicado: boolean;
        archivado: boolean;
        aceptaEncargo: boolean;
        diasEncargo: number | null;
      }
    >,
  ): Promise<FichaDeProducto> {
    return firstValueFrom(
      this.http.patch<FichaDeProducto>(`/api/admin/tienda/productos/${id}`, cambio),
    );
  }

  agregarVariante(productoId: number, variante: VarianteNueva): Promise<VarianteDelProducto> {
    return firstValueFrom(
      this.http.post<VarianteDelProducto>(
        `/api/admin/tienda/productos/${productoId}/variantes`,
        variante,
      ),
    );
  }

  /** La etiqueta, el código o si está activa. El stock no: va por una entrada o un ajuste. */
  editarVariante(
    id: number,
    cambio: Partial<Omit<VarianteDelProducto, 'id' | 'stock'>>,
  ): Promise<VarianteDelProducto> {
    return firstValueFrom(
      this.http.patch<VarianteDelProducto>(`/api/admin/tienda/variantes/${id}`, cambio),
    );
  }

  /** Como las de torneos: `FormData` y sin `Content-Type` a mano, que pone el navegador. */
  subirFoto(productoId: number, archivo: File): Promise<FotoDelProducto> {
    const cuerpo = new FormData();
    cuerpo.append('foto', archivo);

    return firstValueFrom(
      this.http.post<FotoDelProducto>(`/api/admin/tienda/productos/${productoId}/fotos`, cuerpo),
    );
  }

  /** La lista entera, en el orden nuevo: la primera es la portada. */
  ordenarFotos(productoId: number, ids: number[]): Promise<FotoDelProducto[]> {
    return firstValueFrom(
      this.http.put<FotoDelProducto[]>(`/api/admin/tienda/productos/${productoId}/fotos/orden`, {
        ids,
      }),
    );
  }

  /** El historial de stock de una variante, del movimiento más nuevo al más viejo. */
  movimientos(varianteId: number): Promise<HistorialDeStock> {
    return firstValueFrom(
      this.http.get<HistorialDeStock>(`/api/admin/tienda/variantes/${varianteId}/movimientos`),
    );
  }

  /** Una entrada o un ajuste. Devuelve el stock que quedó. */
  registrarMovimiento(
    varianteId: number,
    movimiento: MovimientoDelPanel,
  ): Promise<{ stock: number }> {
    return firstValueFrom(
      this.http.post<{ stock: number }>(
        `/api/admin/tienda/variantes/${varianteId}/movimientos`,
        movimiento,
      ),
    );
  }

  quitarFoto(productoId: number, fotoId: number): Promise<{ id: number }> {
    return firstValueFrom(
      this.http.delete<{ id: number }>(`/api/admin/tienda/productos/${productoId}/fotos/${fotoId}`),
    );
  }
}

export type MotivoDeMovimiento = 'ENTRADA' | 'VENTA' | 'AJUSTE' | 'DEVOLUCION' | 'ANULACION';

/** Un movimiento de stock: cuándo, cuánto, por qué y quién (T160). */
export interface MovimientoDeStock {
  id: number;
  cantidad: number;
  motivo: MotivoDeMovimiento;
  nota: string | null;
  creadoEn: string;
  /** Nulo en una compra en línea, que no tiene autor. */
  quien: string | null;
}

export interface HistorialDeStock {
  variante: { id: number; etiqueta: string; stock: number; producto: string };
  movimientos: MovimientoDeStock[];
}

/** Lo que se registra a mano desde el panel: una entrada o un ajuste con su nota. */
export interface MovimientoDelPanel {
  motivo: 'ENTRADA' | 'AJUSTE';
  cantidad: number;
  nota: string | null;
}
