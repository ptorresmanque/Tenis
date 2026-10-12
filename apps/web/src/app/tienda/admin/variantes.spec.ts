import { ComponentRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { ProductosDeLaTienda, VarianteDelProducto } from './productos.service';
import { VariantesDelProducto } from './variantes';

/**
 * T159. Las variantes de un producto: agregarlas con su código de barras y su stock
 * inicial, y corregirlas. **El stock no se edita acá**: va por una entrada o un ajuste
 * (T160), y el servidor rechaza un stock en la variante (T158).
 */
describe('VariantesDelProducto', () => {
  const GRIP_2: VarianteDelProducto = {
    id: 11,
    etiqueta: 'Grip 2',
    codigoBarras: '7891234567890',
    stock: 3,
    activa: true,
  };

  const montar = async (variantes: VarianteDelProducto[] = [GRIP_2]) => {
    const api = {
      agregarVariante: vi.fn().mockResolvedValue(GRIP_2),
      editarVariante: vi.fn().mockResolvedValue(GRIP_2),
      movimientos: vi.fn().mockResolvedValue({
        variante: { id: 11, etiqueta: 'Grip 2', stock: 3, producto: 'Babolat Pure Drive' },
        movimientos: [],
      }),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: ProductosDeLaTienda, useValue: api }],
    });
    const fixture = TestBed.createComponent(VariantesDelProducto);
    const ref = fixture.componentRef as ComponentRef<VariantesDelProducto>;
    ref.setInput('productoId', 4);
    ref.setInput('variantes', variantes);
    const cambiaron = vi.fn();
    fixture.componentInstance.cambiaron.subscribe(cambiaron);
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

    const filas = () => Array.from(elemento.querySelectorAll<HTMLElement>('tbody tr'));

    return { api, cambiaron, elemento, estable, boton, campo, escribir, filas };
  };

  it('lista las variantes con su código, su stock y si están activas', async () => {
    const { filas } = await montar();

    expect(filas()[0].textContent).toContain('Grip 2');
    expect(filas()[0].textContent).toContain('7891234567890');
    expect(filas()[0].textContent).toContain('3');
  });

  it('**Movimientos abre el historial de stock de esa variante** (T160)', async () => {
    const { api, boton, elemento, estable, filas } = await montar();

    expect(elemento.querySelector('app-movimientos-de-la-variante')).toBeNull();
    boton('Movimientos', filas()[0]).click();
    await estable();

    expect(elemento.querySelector('app-movimientos-de-la-variante')).not.toBeNull();
    expect(api.movimientos).toHaveBeenCalledWith(11);
  });

  describe('agregar', () => {
    it('manda la etiqueta, el código y el stock inicial, y avisa que cambiaron', async () => {
      const { api, cambiaron, boton, campo, escribir, estable } = await montar();

      await escribir(campo('Etiqueta')!, '  Grip 3 ');
      await escribir(campo('Código de barras')!, '7891234567891');
      await escribir(campo('Stock inicial')!, '4');
      boton('Agregar la variante').click();
      await estable();

      expect(api.agregarVariante).toHaveBeenCalledWith(4, {
        etiqueta: 'Grip 3',
        codigoBarras: '7891234567891',
        stock: 4,
      });
      expect(cambiaron).toHaveBeenCalled();
      expect(campo('Etiqueta')!.value).toBe('');
    });

    it('**el Enter del lector deja el código y pasa al stock, sin agregar la variante**', async () => {
      const { api, campo, escribir, estable } = await montar();

      await escribir(campo('Etiqueta')!, 'Grip 3');
      const codigo = campo('Código de barras')!;
      await escribir(codigo, '7891234567891');
      const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true });
      codigo.dispatchEvent(enter);
      await estable();

      expect(enter.defaultPrevented).toBe(true);
      expect(api.agregarVariante).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(campo('Stock inicial'));
    });

    it('sin código ni stock, manda nulo y cero', async () => {
      const { api, boton, campo, escribir, estable } = await montar();

      await escribir(campo('Etiqueta')!, 'Grip 4');
      boton('Agregar la variante').click();
      await estable();

      expect(api.agregarVariante).toHaveBeenCalledWith(4, {
        etiqueta: 'Grip 4',
        codigoBarras: null,
        stock: 0,
      });
    });

    it('si el código ya es de otra variante, muestra lo que dice el servidor', async () => {
      const { api, boton, campo, escribir, estable, elemento } = await montar();
      api.agregarVariante.mockRejectedValue({
        status: 409,
        error: { message: 'Ese código de barras ya es de otra variante.' },
      });

      await escribir(campo('Etiqueta')!, 'Grip 3');
      boton('Agregar la variante').click();
      await estable();

      expect(elemento.textContent).toContain('Ese código de barras ya es de otra variante.');
    });
  });

  describe('corregir', () => {
    it('Editar abre la fila con lo guardado, sin un campo de stock', async () => {
      const { boton, campo, estable, filas } = await montar();

      boton('Editar', filas()[0]).click();
      await estable();

      expect(campo('Etiqueta', filas()[0])!.value).toBe('Grip 2');
      expect(campo('Código de barras', filas()[0])!.value).toBe('7891234567890');
      expect(campo('Stock', filas()[0])).toBeUndefined();
    });

    it('Guardar manda la etiqueta, el código y si está activa', async () => {
      const { api, cambiaron, boton, campo, escribir, estable, filas } = await montar();

      boton('Editar', filas()[0]).click();
      await estable();
      await escribir(campo('Código de barras', filas()[0])!, '');
      campo('Activa', filas()[0])!.click();
      await estable();
      boton('Guardar', filas()[0]).click();
      await estable();

      expect(api.editarVariante).toHaveBeenCalledWith(11, {
        etiqueta: 'Grip 2',
        codigoBarras: null,
        activa: false,
      });
      expect(cambiaron).toHaveBeenCalled();
    });
  });
});
