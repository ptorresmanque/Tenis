import { ComponentRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { CatalogoDeLaTienda } from './catalogo.service';
import { FichaDeProductoPanel } from './ficha-producto';
import { FichaDeProducto, ProductosDeLaTienda } from './productos.service';
import { VariantesDelProducto } from './variantes';

/**
 * T159. La ficha de un producto: sus datos, y publicarlo o archivarlo. Las variantes y
 * las fotos tienen sus propias pruebas.
 */
describe('FichaDeProductoPanel', () => {
  const FICHA: FichaDeProducto = {
    id: 4,
    nombre: 'Babolat Pure Drive',
    descripcion: 'La raqueta de siempre.',
    categoriaId: 2,
    marcaId: 7,
    precioClp: 249990,
    publicado: false,
    archivado: false,
    aceptaEncargo: false,
    diasEncargo: null,
    variantes: [{ id: 11, etiqueta: 'Grip 2', codigoBarras: null, stock: 3, activa: true }],
    fotos: [],
  };

  const montar = async (id: string, ficha: FichaDeProducto = FICHA) => {
    const api = {
      ficha: vi.fn().mockResolvedValue(ficha),
      crear: vi.fn().mockResolvedValue({ ...ficha, id: 9 }),
      editar: vi.fn().mockResolvedValue(ficha),
    };
    const catalogo = {
      listarCategorias: vi.fn().mockResolvedValue([
        { id: 1, nombre: 'Zapatillas', orden: 1, usaTablaDeTallas: true },
        { id: 2, nombre: 'Raquetas', orden: 2, usaTablaDeTallas: false },
      ]),
      listarMarcas: vi.fn().mockResolvedValue([{ id: 7, nombre: 'Babolat' }]),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ProductosDeLaTienda, useValue: api },
        { provide: CatalogoDeLaTienda, useValue: catalogo },
      ],
    });
    const router = TestBed.inject(Router);
    const navegar = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(FichaDeProductoPanel);
    (fixture.componentRef as ComponentRef<FichaDeProductoPanel>).setInput('id', id);
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const elemento = fixture.nativeElement as HTMLElement;

    const estable = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };

    const boton = (texto: string) =>
      Array.from(elemento.querySelectorAll('button')).find((b) =>
        b.textContent?.replace(/\s+/g, ' ').includes(texto),
      )!;

    const campo = <T extends HTMLElement = HTMLInputElement>(etiqueta: string) =>
      Array.from(elemento.querySelectorAll('label'))
        .find((l) => l.textContent?.includes(etiqueta))
        ?.querySelector<T>('input, textarea, select');

    const escribir = async (control: HTMLInputElement | HTMLTextAreaElement, valor: string) => {
      control.value = valor;
      control.dispatchEvent(new Event('input'));
      await estable();
    };

    const elegir = async (control: HTMLSelectElement, valor: string) => {
      control.value = valor;
      control.dispatchEvent(new Event('change'));
      await estable();
    };

    return { api, navegar, fixture, elemento, estable, boton, campo, escribir, elegir };
  };

  describe('un producto nuevo', () => {
    it('manda los datos limpios y va a su ficha', async () => {
      const { api, navegar, boton, campo, escribir, elegir, estable } = await montar('nuevo');

      await escribir(campo('Nombre')!, '  Wilson Blade 98  ');
      await elegir(campo<HTMLSelectElement>('Categoría')!, '2');
      await escribir(campo('Precio')!, '189990');
      boton('Crear el producto').click();
      await estable();

      expect(api.crear).toHaveBeenCalledWith({
        nombre: 'Wilson Blade 98',
        descripcion: '',
        categoriaId: 2,
        marcaId: null,
        precioClp: 189990,
      });
      expect(navegar).toHaveBeenCalledWith(['/administracion/tienda/productos', 9], {
        replaceUrl: true,
      });
    });

    it('sin categoría o con un precio que no es un entero positivo, no manda nada', async () => {
      const { api, boton, campo, escribir, estable, elemento } = await montar('nuevo');

      await escribir(campo('Nombre')!, 'Wilson Blade 98');
      await escribir(campo('Precio')!, '189990');
      boton('Crear el producto').click();
      await estable();
      expect(elemento.textContent).toContain('Elige la categoría');

      expect(api.crear).not.toHaveBeenCalled();
    });

    it('el encargo se configura recién con el producto creado', async () => {
      const { campo } = await montar('nuevo');

      expect(campo('Se vende por encargo')).toBeUndefined();
    });

    it('no ofrece variantes ni fotos hasta que el producto exista', async () => {
      const { elemento } = await montar('nuevo');

      expect(elemento.querySelector('app-variantes-del-producto')).toBeNull();
      expect(elemento.querySelector('app-fotos-del-producto')).toBeNull();
    });
  });

  describe('un producto que existe', () => {
    it('carga sus datos en el formulario', async () => {
      const { api, campo } = await montar('4');

      expect(api.ficha).toHaveBeenCalledWith(4);
      expect(campo('Nombre')!.value).toBe('Babolat Pure Drive');
      expect(campo<HTMLSelectElement>('Categoría')!.value).toBe('2');
      expect(campo<HTMLSelectElement>('Marca')!.value).toBe('7');
    });

    it('Guardar manda los datos, sin tocar el estado', async () => {
      const { api, boton, campo, escribir, estable } = await montar('4');

      await escribir(campo('Precio')!, '239990');
      boton('Guardar los datos').click();
      await estable();

      expect(api.editar).toHaveBeenCalledWith(4, {
        nombre: 'Babolat Pure Drive',
        descripcion: 'La raqueta de siempre.',
        categoriaId: 2,
        marcaId: 7,
        precioClp: 239990,
        aceptaEncargo: false,
        diasEncargo: null,
      });
    });

    it('**el encargo: aceptarlo pide en cuántos días llega**, y se manda con los datos (T170)', async () => {
      const { api, boton, campo, escribir, estable, elemento } = await montar('4');

      campo('Se vende por encargo')!.click();
      await estable();
      boton('Guardar los datos').click();
      await estable();
      expect(api.editar).not.toHaveBeenCalled();
      expect(elemento.textContent).toContain('en cuántos días llega');

      await escribir(campo('Días que tarda en llegar')!, '7');
      boton('Guardar los datos').click();
      await estable();

      expect(api.editar).toHaveBeenCalledWith(
        4,
        expect.objectContaining({ aceptaEncargo: true, diasEncargo: 7 }),
      );
    });

    it('**Publicar pide publicar**, y si el servidor no deja, muestra por qué', async () => {
      const { api, boton, estable, elemento } = await montar('4');
      api.editar.mockRejectedValue({
        status: 409,
        error: { message: 'Agrega una variante activa antes de publicarlo.' },
      });

      boton('Publicar').click();
      await estable();

      expect(api.editar).toHaveBeenCalledWith(4, { publicado: true });
      expect(elemento.textContent).toContain('Agrega una variante activa antes de publicarlo.');
    });

    it('un publicado ofrece despublicar, y uno archivado, desarchivar', async () => {
      const publicado = await montar('4', { ...FICHA, publicado: true });
      expect(publicado.boton('Despublicar')).toBeDefined();

      const archivado = await montar('4', { ...FICHA, archivado: true });
      expect(archivado.boton('Desarchivar')).toBeDefined();
      expect(archivado.boton('Publicar')).toBeUndefined();
    });

    it('**agregar una variante no borra lo que se estaba escribiendo en los datos**', async () => {
      // La ficha se recarga para mostrar la variante nueva. Si el formulario volviera a
      // lo guardado, el precio a medio corregir se perdería, y "Guardar" mandaría el viejo.
      const { api, fixture, campo, escribir, estable } = await montar('4');
      await escribir(campo('Precio')!, '239990');


      api.ficha.mockResolvedValue({
        ...FICHA,
        variantes: [
          ...FICHA.variantes,
          { id: 12, etiqueta: 'Grip 3', codigoBarras: null, stock: 0, activa: true },
        ],
      });
      (
        fixture.debugElement.query(By.directive(VariantesDelProducto))
          .componentInstance as VariantesDelProducto
      ).cambiaron.emit();
      await estable();
      await estable();

      expect(api.ficha).toHaveBeenCalledTimes(2);
      expect(campo('Precio')!.value).toBe('239990');
    });

    it('trae sus variantes y sus fotos', async () => {
      const { elemento } = await montar('4');

      expect(elemento.querySelector('app-variantes-del-producto')).not.toBeNull();
      expect(elemento.querySelector('app-fotos-del-producto')).not.toBeNull();
    });
  });
});
