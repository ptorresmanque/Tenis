import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { CatalogoDeLaTienda, CategoriaProducto } from './catalogo.service';
import { CategoriasPanel } from './categorias';

/**
 * T157. Las categorías de la tienda en el panel: agregar, corregir y ordenar, y marcar
 * cuáles usan la tabla de tallas. No se borran: en cuanto haya productos tienen cosas
 * colgando (`SPEC-tienda.md` § Catálogo).
 */
describe('CategoriasPanel', () => {
  const ZAPATILLAS: CategoriaProducto = {
    id: 1,
    nombre: 'Zapatillas',
    orden: 1,
    usaTablaDeTallas: true,
  };
  const RAQUETAS: CategoriaProducto = {
    id: 2,
    nombre: 'Raquetas',
    orden: 2,
    usaTablaDeTallas: false,
  };

  const montar = async (lista: CategoriaProducto[] = [ZAPATILLAS, RAQUETAS]) => {
    const api = {
      listarCategorias: vi.fn().mockResolvedValue(lista),
      crearCategoria: vi.fn().mockResolvedValue(RAQUETAS),
      editarCategoria: vi.fn().mockResolvedValue(RAQUETAS),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: CatalogoDeLaTienda, useValue: api }],
    });
    const fixture = TestBed.createComponent(CategoriasPanel);
    await fixture.whenStable();
    fixture.detectChanges();
    const elemento = fixture.nativeElement as HTMLElement;

    const estable = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };

    const boton = (texto: string, dentro: ParentNode = elemento) =>
      Array.from(dentro.querySelectorAll('button')).find((b) =>
        b.textContent?.replace(/\s+/g, ' ').includes(texto),
      )!;

    const campo = (etiqueta: string, dentro: ParentNode = elemento) =>
      Array.from(dentro.querySelectorAll('label'))
        .find((l) => l.textContent?.includes(etiqueta))
        ?.querySelector<HTMLInputElement>('input');

    const escribir = async (control: HTMLInputElement, valor: string) => {
      control.value = valor;
      control.dispatchEvent(new Event('input'));
      await estable();
    };

    const marcar = async (casilla: HTMLInputElement) => {
      casilla.click();
      await estable();
    };

    const filas = () => Array.from(elemento.querySelectorAll<HTMLElement>('ol > li'));

    return { api, elemento, estable, boton, campo, escribir, marcar, filas };
  };

  it('lista las categorías en su orden, y dice cuáles usan la tabla de tallas', async () => {
    const { filas } = await montar();

    expect(filas().map((f) => f.querySelector('h3')?.textContent?.trim())).toEqual([
      'Zapatillas',
      'Raquetas',
    ]);
    expect(filas()[0].textContent).toContain('Tabla de tallas');
    expect(filas()[1].textContent).not.toContain('Tabla de tallas');
  });

  it('sin categorías, dice que hacen falta para cargar productos', async () => {
    const { elemento } = await montar([]);

    expect(elemento.textContent).toContain('Todavía no hay categorías');
  });

  describe('agregar', () => {
    it('manda el nombre sin espacios y la casilla de la tabla, y vacía el formulario', async () => {
      const { api, boton, campo, escribir, marcar, estable } = await montar();

      await escribir(campo('Nombre')!, '  Bolsos  ');
      await marcar(campo('tallas de zapatilla')!);
      boton('Agregar la categoría').click();
      await estable();

      expect(api.crearCategoria).toHaveBeenCalledWith('Bolsos', true);
      expect(campo('Nombre')!.value).toBe('');
      expect(campo('tallas de zapatilla')!.checked).toBe(false);
    });

    it('sin nombre no manda nada, y dice qué falta', async () => {
      const { api, boton, estable, elemento } = await montar();

      boton('Agregar la categoría').click();
      await estable();

      expect(api.crearCategoria).not.toHaveBeenCalled();
      expect(elemento.textContent).toContain('Escribe el nombre de la categoría');
    });

    it('si el nombre ya existe, muestra lo que dice el servidor', async () => {
      const { api, boton, campo, escribir, estable, elemento } = await montar();
      api.crearCategoria.mockRejectedValue({
        status: 409,
        error: { message: 'Ya hay una categoría con ese nombre.' },
      });

      await escribir(campo('Nombre')!, 'ropa');
      boton('Agregar la categoría').click();
      await estable();

      expect(elemento.textContent).toContain('Ya hay una categoría con ese nombre.');
    });

    it('el nombre no deja pasar de 80 caracteres, el ancho de la columna', async () => {
      const { campo } = await montar();

      expect(campo('Nombre')!.maxLength).toBe(80);
    });
  });

  describe('corregir', () => {
    it('Editar abre la categoría en su fila con lo guardado, y Guardar manda el cambio', async () => {
      const { api, boton, campo, escribir, marcar, estable, filas } = await montar();

      boton('Editar', filas()[1]).click();
      await estable();

      const fila = filas()[1];
      expect(campo('Nombre', fila)!.value).toBe('Raquetas');
      expect(campo('tallas de zapatilla', fila)!.checked).toBe(false);

      await escribir(campo('Nombre', fila)!, 'Raquetas y paletas');
      await marcar(campo('tallas de zapatilla', fila)!);
      boton('Guardar', fila).click();
      await estable();

      expect(api.editarCategoria).toHaveBeenCalledWith(2, {
        nombre: 'Raquetas y paletas',
        usaTablaDeTallas: true,
      });
    });

    it('Cancelar cierra la fila sin mandar nada', async () => {
      const { api, boton, estable, filas } = await montar();

      boton('Editar', filas()[0]).click();
      await estable();
      boton('Cancelar', filas()[0]).click();
      await estable();

      expect(api.editarCategoria).not.toHaveBeenCalled();
      expect(boton('Editar', filas()[0])).toBeDefined();
    });
  });

  describe('ordenar', () => {
    const cambiarOrden = async (
      elemento: HTMLElement,
      estable: () => Promise<void>,
      id: number,
      valor: string,
    ) => {
      const orden = elemento.querySelector<HTMLInputElement>(`#orden-categoria-${id}`)!;
      orden.value = valor;
      orden.dispatchEvent(new Event('change'));
      await estable();
    };

    it('cambiar el número manda el orden nuevo', async () => {
      const { api, elemento, estable } = await montar();

      await cambiarOrden(elemento, estable, 2, '0');

      expect(api.editarCategoria).toHaveBeenCalledWith(2, { orden: 0 });
    });

    it('un orden que no es un entero entre 0 y 1000 no se manda', async () => {
      const { api, elemento, estable } = await montar();

      await cambiarOrden(elemento, estable, 2, '1001');

      expect(api.editarCategoria).not.toHaveBeenCalled();
      expect(elemento.textContent).toContain('entre 0 y 1000');
    });
  });
});
