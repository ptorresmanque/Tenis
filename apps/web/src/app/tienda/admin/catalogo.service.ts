import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Espejo de `CategoriaProducto` en la API (T156), como la ve el panel. */
export interface CategoriaProducto {
  id: number;
  nombre: string;
  /** Menor va más arriba. */
  orden: number;
  /** Sus variantes son tallas de zapatilla, y la tienda las muestra en CL, US y EU. */
  usaTablaDeTallas: boolean;
}

/** Espejo de `Marca` en la API (T156). */
export interface Marca {
  id: number;
  nombre: string;
}

/** Una fila de la tabla de tallas de una marca: la misma talla en tres sistemas. */
export interface FilaDeTallas {
  tallaCl: string;
  tallaUs: string;
  tallaEu: string;
}

/** Las categorías, las marcas y sus tablas de tallas, para el panel de la tienda (T157). */
@Service()
export class CatalogoDeLaTienda {
  private readonly http = inject(HttpClient);

  listarCategorias(): Promise<CategoriaProducto[]> {
    return firstValueFrom(
      this.http.get<CategoriaProducto[]>('/api/admin/tienda/categorias'),
    );
  }

  /** Sin orden: el servidor la deja al final. */
  crearCategoria(nombre: string, usaTablaDeTallas: boolean): Promise<CategoriaProducto> {
    return firstValueFrom(
      this.http.post<CategoriaProducto>('/api/admin/tienda/categorias', {
        nombre,
        usaTablaDeTallas,
      }),
    );
  }

  /** Solo lo que cambia. */
  editarCategoria(
    id: number,
    cambio: Partial<Omit<CategoriaProducto, 'id'>>,
  ): Promise<CategoriaProducto> {
    return firstValueFrom(
      this.http.patch<CategoriaProducto>(`/api/admin/tienda/categorias/${id}`, cambio),
    );
  }

  listarMarcas(): Promise<Marca[]> {
    return firstValueFrom(this.http.get<Marca[]>('/api/admin/tienda/marcas'));
  }

  crearMarca(nombre: string): Promise<Marca> {
    return firstValueFrom(this.http.post<Marca>('/api/admin/tienda/marcas', { nombre }));
  }

  editarMarca(id: number, nombre: string): Promise<Marca> {
    return firstValueFrom(
      this.http.patch<Marca>(`/api/admin/tienda/marcas/${id}`, { nombre }),
    );
  }

  tallas(marcaId: number): Promise<FilaDeTallas[]> {
    return firstValueFrom(
      this.http.get<FilaDeTallas[]>(`/api/admin/tienda/marcas/${marcaId}/tallas`),
    );
  }

  /** La tabla entera: reemplaza a la que había (T156). */
  guardarTallas(marcaId: number, tallas: FilaDeTallas[]): Promise<FilaDeTallas[]> {
    return firstValueFrom(
      this.http.put<FilaDeTallas[]>(`/api/admin/tienda/marcas/${marcaId}/tallas`, {
        tallas,
      }),
    );
  }
}
