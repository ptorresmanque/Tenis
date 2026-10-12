import { ComponentRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { FotosDelProducto } from './fotos-producto';
import { FotoDelProducto, ProductosDeLaTienda } from './productos.service';

/**
 * T159. Las fotos de un producto: se suben de a varias, se reordenan —la primera es la
 * portada del catálogo— y se quitan.
 */
describe('FotosDelProducto', () => {
  const foto = (id: number, orden: number): FotoDelProducto => ({
    id,
    orden,
    miniatura: `/api/tienda/fotos/${id}/miniatura`,
    imagen: `/api/tienda/fotos/${id}/imagen`,
  });
  const A = foto(1, 0);
  const B = foto(2, 1);
  const C = foto(3, 2);

  const montar = async (fotos: FotoDelProducto[] = [A, B, C]) => {
    const api = {
      subirFoto: vi.fn().mockResolvedValue(A),
      ordenarFotos: vi.fn().mockResolvedValue(fotos),
      quitarFoto: vi.fn().mockResolvedValue({ id: 1 }),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: ProductosDeLaTienda, useValue: api }],
    });
    const fixture = TestBed.createComponent(FotosDelProducto);
    const ref = fixture.componentRef as ComponentRef<FotosDelProducto>;
    ref.setInput('productoId', 4);
    ref.setInput('nombre', 'Babolat Pure Drive');
    ref.setInput('fotos', fotos);
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
      );

    const tarjetas = () => Array.from(elemento.querySelectorAll<HTMLElement>('ol > li'));

    return { api, cambiaron, elemento, estable, boton, tarjetas };
  };

  it('muestra las miniaturas en su orden, y la primera dice que es la portada', async () => {
    const { tarjetas } = await montar();

    expect(tarjetas().map((t) => t.querySelector('img')?.getAttribute('src'))).toEqual([
      A.miniatura,
      B.miniatura,
      C.miniatura,
    ]);
    expect(tarjetas()[0].textContent).toContain('Portada');
    expect(tarjetas()[0].querySelector('img')?.getAttribute('alt')).toContain(
      'Babolat Pure Drive',
    );
  });

  it('**se suben de a varias**, una tras otra, y al final avisa que cambiaron', async () => {
    const { api, cambiaron, elemento, estable } = await montar();
    const archivos = [
      new File(['a'], 'uno.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'dos.jpg', { type: 'image/jpeg' }),
    ];
    const entrada = elemento.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(entrada.multiple).toBe(true);

    Object.defineProperty(entrada, 'files', { value: archivos });
    entrada.dispatchEvent(new Event('change'));
    await estable();

    expect(api.subirFoto.mock.calls).toEqual([
      [4, archivos[0]],
      [4, archivos[1]],
    ]);
    expect(cambiaron).toHaveBeenCalled();
  });

  it('si una no sube, dice cuál y por qué, y sigue con las demás', async () => {
    const { api, elemento, estable } = await montar();
    api.subirFoto
      .mockRejectedValueOnce({ status: 400, error: { message: 'No es una imagen.' } })
      .mockResolvedValueOnce(B);
    const archivos = [
      new File(['x'], 'planilla.pdf', { type: 'application/pdf' }),
      new File(['b'], 'dos.jpg', { type: 'image/jpeg' }),
    ];
    const entrada = elemento.querySelector<HTMLInputElement>('input[type="file"]')!;

    Object.defineProperty(entrada, 'files', { value: archivos });
    entrada.dispatchEvent(new Event('change'));
    await estable();

    expect(api.subirFoto).toHaveBeenCalledTimes(2);
    expect(elemento.textContent).toContain('planilla.pdf: No es una imagen.');
  });

  it('mover una antes manda el orden entero nuevo', async () => {
    const { api, boton, estable, tarjetas } = await montar();

    boton('Antes', tarjetas()[2])!.click();
    await estable();

    expect(api.ordenarFotos).toHaveBeenCalledWith(4, [1, 3, 2]);
  });

  it('la primera no se mueve antes, ni la última después', async () => {
    const { boton, tarjetas } = await montar();

    expect(boton('Antes', tarjetas()[0])).toBeUndefined();
    expect(boton('Después', tarjetas()[2])).toBeUndefined();
  });

  it('Quitar la quita, y avisa que cambiaron', async () => {
    const { api, cambiaron, boton, estable, tarjetas } = await montar();

    boton('Quitar', tarjetas()[1])!.click();
    await estable();

    expect(api.quitarFoto).toHaveBeenCalledWith(4, 2);
    expect(cambiaron).toHaveBeenCalled();
  });

  it('sin fotos, dice que el catálogo lo mostrará sin imagen', async () => {
    const { elemento } = await montar([]);

    expect(elemento.textContent).toContain('Todavía no tiene fotos');
  });
});
