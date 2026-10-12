import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { CatalogoDeLaTienda } from './catalogo.service';
import { ProductosPanel } from './productos';
import { ProductoDeLaLista, ProductosDeLaTienda } from './productos.service';

/**
 * T159. La lista de productos del panel: qué hay, en qué estado y qué se está agotando.
 *
 * El filtro de stock mira **la variante más baja** y no el total (`stockMinimo`): +5 y −1
 * suman 4 y esconden la talla que se debe.
 */
describe('ProductosPanel', () => {
  const producto = (datos: Partial<ProductoDeLaLista>): ProductoDeLaLista => ({
    id: 1,
    nombre: 'Babolat Pure Drive',
    categoria: { id: 2, nombre: 'Raquetas' },
    marca: { id: 7, nombre: 'Babolat' },
    precioClp: 249990,
    publicado: true,
    archivado: false,
    stockTotal: 6,
    stockMinimo: 3,
    variantes: 2,
    foto: '/api/tienda/fotos/9/miniatura',
    ...datos,
  });

  const PURE_DRIVE = producto({});
  const ASICS = producto({
    id: 2,
    nombre: 'Asics Gel Resolution',
    categoria: { id: 1, nombre: 'Zapatillas' },
    marca: null,
    publicado: false,
    stockTotal: 4,
    stockMinimo: -1,
    foto: null,
  });
  const TUBO = producto({ id: 3, nombre: 'Tubo Head Tour', stockTotal: 2, stockMinimo: 2 });

  const montar = async (lista = [PURE_DRIVE, ASICS, TUBO]) => {
    const api = { listar: vi.fn().mockResolvedValue(lista) };
    const catalogo = {
      listarCategorias: vi.fn().mockResolvedValue([
        { id: 1, nombre: 'Zapatillas', orden: 1, usaTablaDeTallas: true },
        { id: 2, nombre: 'Raquetas', orden: 2, usaTablaDeTallas: false },
      ]),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ProductosDeLaTienda, useValue: api },
        { provide: CatalogoDeLaTienda, useValue: catalogo },
      ],
    });
    const fixture = TestBed.createComponent(ProductosPanel);
    await fixture.whenStable();
    fixture.detectChanges();
    const elemento = fixture.nativeElement as HTMLElement;

    const estable = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };

    const filas = () => Array.from(elemento.querySelectorAll<HTMLElement>('tbody tr'));
    const nombres = () =>
      filas().map((f) => f.querySelector('th .font-semibold')?.textContent?.trim());

    const elegir = async (opcion: string) => {
      const radio = Array.from(elemento.querySelectorAll('label')).find(
        (l) => l.textContent?.trim() === opcion,
      );
      radio!.querySelector('input')!.click();
      await estable();
    };

    return { api, elemento, estable, filas, nombres, elegir };
  };

  it('lista los productos con su categoría, su precio, su estado y su stock', async () => {
    const { filas, nombres } = await montar();

    expect(nombres()).toEqual(['Babolat Pure Drive', 'Asics Gel Resolution', 'Tubo Head Tour']);
    expect(filas()[0].textContent).toContain('Raquetas · Babolat');
    expect(filas()[0].textContent).toContain('$249.990');
    expect(filas()[0].textContent).toContain('Publicado');
    expect(filas()[1].textContent).toContain('Borrador');
  });

  it('cada producto lleva a su ficha, y hay cómo crear uno nuevo', async () => {
    const { elemento, filas } = await montar();

    expect(filas()[0].querySelector('a')?.getAttribute('href')).toBe(
      '/administracion/tienda/productos/1',
    );
    expect(
      Array.from(elemento.querySelectorAll('a')).some(
        (a) => a.getAttribute('href') === '/administracion/tienda/productos/nuevo',
      ),
    ).toBe(true);
  });

  it('**el filtro de stock negativo mira la variante más baja, no el total**', async () => {
    const { nombres, elegir } = await montar();

    await elegir('Negativo');

    expect(nombres()).toEqual(['Asics Gel Resolution']);
  });

  it('el de stock bajo trae lo que tiene alguna variante en 2 o menos', async () => {
    const { nombres, elegir } = await montar();

    await elegir('Bajo');

    expect(nombres()).toEqual(['Asics Gel Resolution', 'Tubo Head Tour']);
  });

  it('el estado y la categoría se le piden a la API', async () => {
    const { api, elemento, estable, elegir } = await montar();

    await elegir('Archivados');
    expect(api.listar).toHaveBeenLastCalledWith({ estado: 'archivado', categoriaId: null });

    const categoria = elemento.querySelector<HTMLSelectElement>('select')!;
    categoria.value = '1';
    categoria.dispatchEvent(new Event('change'));
    await estable();
    expect(api.listar).toHaveBeenLastCalledWith({ estado: 'archivado', categoriaId: 1 });
  });

  it('sin productos, invita a cargar el primero', async () => {
    const { elemento } = await montar([]);

    expect(elemento.textContent).toContain('Todavía no hay productos');
  });
});
