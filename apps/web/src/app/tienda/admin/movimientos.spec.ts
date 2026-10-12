import { ComponentRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { MovimientosDeLaVariante } from './movimientos';
import { HistorialDeStock, ProductosDeLaTienda } from './productos.service';

/**
 * T160. El historial de stock de una variante, y registrar una entrada o un ajuste.
 * **Un ajuste sin nota no sale**: seis meses después, un −3 sin explicación no se
 * distingue de un robo.
 */
describe('MovimientosDeLaVariante', () => {
  const HISTORIAL: HistorialDeStock = {
    variante: { id: 11, etiqueta: 'Grip 2', stock: 4, producto: 'Babolat Pure Drive' },
    movimientos: [
      {
        id: 3,
        cantidad: -1,
        motivo: 'VENTA',
        nota: null,
        creadoEn: '2026-10-12T21:00:00.000Z',
        quien: null,
      },
      {
        id: 2,
        cantidad: -2,
        motivo: 'AJUSTE',
        nota: 'Conteo del lunes',
        creadoEn: '2026-10-11T14:00:00.000Z',
        quien: 'Marta Bodega',
      },
      {
        id: 1,
        cantidad: 7,
        motivo: 'ENTRADA',
        nota: null,
        creadoEn: '2026-10-10T13:00:00.000Z',
        quien: 'Marta Bodega',
      },
    ],
  };

  const montar = async () => {
    const api = {
      movimientos: vi.fn().mockResolvedValue(HISTORIAL),
      registrarMovimiento: vi.fn().mockResolvedValue({ stock: 10 }),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: ProductosDeLaTienda, useValue: api }],
    });
    const fixture = TestBed.createComponent(MovimientosDeLaVariante);
    (fixture.componentRef as ComponentRef<MovimientosDeLaVariante>).setInput('varianteId', 11);
    const cambiaron = vi.fn();
    fixture.componentInstance.cambiaron.subscribe(cambiaron);
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
        ?.querySelector<T>('input, textarea');

    const escribir = async (control: HTMLInputElement | HTMLTextAreaElement, valor: string) => {
      control.value = valor;
      control.dispatchEvent(new Event('input'));
      await estable();
    };

    const elegir = async (opcion: string) => {
      const etiqueta = Array.from(elemento.querySelectorAll('label')).find(
        (l) => l.textContent?.trim() === opcion,
      );
      etiqueta!.querySelector('input')!.click();
      await estable();
    };

    const filas = () => Array.from(elemento.querySelectorAll<HTMLElement>('tbody tr'));

    return { api, cambiaron, elemento, estable, boton, campo, escribir, elegir, filas };
  };

  it('**dice cuándo, cuánto, por qué y quién**, del más nuevo al más viejo', async () => {
    const { api, elemento, filas } = await montar();

    expect(api.movimientos).toHaveBeenCalledWith(11);
    expect(elemento.textContent).toContain('Stock actual: 4');
    expect(filas().map((f) => f.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      expect.stringContaining('Venta'),
      expect.stringContaining('Ajuste'),
      expect.stringContaining('Entrada'),
    ]);
    expect(filas()[0].textContent).toContain('−1');
    expect(filas()[0].textContent).toContain('Compra en línea');
    // Hora del club y en 24 horas, como todo el sitio: las 21:00 UTC son las 18:00.
    expect(filas()[0].textContent).toContain('12-10-2026');
    expect(filas()[0].textContent).toContain('18:00');
    expect(filas()[1].textContent).toContain('Marta Bodega');
    expect(filas()[1].textContent).toContain('Conteo del lunes');
    expect(filas()[2].textContent).toContain('+7');
  });

  it('registrar una entrada manda lo que entró, y avisa que cambió el stock', async () => {
    const { api, cambiaron, boton, campo, escribir, estable } = await montar();

    await escribir(campo('Cuánto')!, '12');
    boton('Registrar').click();
    await estable();

    expect(api.registrarMovimiento).toHaveBeenCalledWith(11, {
      motivo: 'ENTRADA',
      cantidad: 12,
      nota: null,
    });
    expect(cambiaron).toHaveBeenCalled();
    expect(api.movimientos).toHaveBeenCalledTimes(2);
  });

  it('una entrada de cero o negativa no se manda', async () => {
    const { api, boton, campo, escribir, estable, elemento } = await montar();

    await escribir(campo('Cuánto')!, '-3');
    boton('Registrar').click();
    await estable();

    expect(api.registrarMovimiento).not.toHaveBeenCalled();
    expect(elemento.textContent).toContain('Lo que entra es un número entero mayor que cero');
  });

  it('**un ajuste sin nota no se manda**, y dice por qué hace falta', async () => {
    const { api, boton, campo, escribir, estable, elegir, elemento } = await montar();

    await elegir('Ajuste');
    await escribir(campo('Cuánto')!, '-2');
    boton('Registrar').click();
    await estable();

    expect(api.registrarMovimiento).not.toHaveBeenCalled();
    expect(elemento.textContent).toContain('Un ajuste lleva una nota');
  });

  it('un ajuste con nota manda la cantidad con su signo', async () => {
    const { api, boton, campo, escribir, estable, elegir } = await montar();

    await elegir('Ajuste');
    await escribir(campo('Cuánto')!, '-2');
    await escribir(campo<HTMLTextAreaElement>('Nota')!, '  Merma  ');
    boton('Registrar').click();
    await estable();

    expect(api.registrarMovimiento).toHaveBeenCalledWith(11, {
      motivo: 'AJUSTE',
      cantidad: -2,
      nota: 'Merma',
    });
  });

  it('si el servidor no deja, muestra por qué', async () => {
    const { api, boton, campo, escribir, estable, elemento } = await montar();
    api.registrarMovimiento.mockRejectedValue({
      status: 400,
      error: { message: 'Lo que entra no puede pasar de 100000.' },
    });

    await escribir(campo('Cuánto')!, '5');
    boton('Registrar').click();
    await estable();

    expect(elemento.textContent).toContain('Lo que entra no puede pasar de 100000.');
  });
});
