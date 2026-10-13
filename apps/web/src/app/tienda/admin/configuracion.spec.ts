import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { ConfiguracionDeLaTiendaPanel } from './configuracion';
import { ConfiguracionDeLaTienda, ConfiguracionDeLaTiendaApi } from './configuracion.service';

/**
 * T172. La configuración de la tienda en su pestaña del panel: el descuento de socio, el
 * umbral de stock bajo y el texto del arriendo de raquetas.
 */
describe('ConfiguracionDeLaTiendaPanel', () => {
  const ACTUAL: ConfiguracionDeLaTienda = {
    descuentoSocioPorcentaje: 15,
    umbralStockBajo: 2,
    arriendoRaquetasTexto: '',
  };

  const montar = async (guardar?: () => Promise<ConfiguracionDeLaTienda>) => {
    const api = {
      leer: vi.fn().mockResolvedValue(ACTUAL),
      guardar: vi.fn().mockImplementation(guardar ?? (() => Promise.resolve(ACTUAL))),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: ConfiguracionDeLaTiendaApi, useValue: api }],
    });
    const fixture = TestBed.createComponent(ConfiguracionDeLaTiendaPanel);
    const elemento = fixture.nativeElement as HTMLElement;
    const estable = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    await estable();

    const campo = <T extends HTMLInputElement | HTMLTextAreaElement>(nombre: string) =>
      elemento.querySelector<T>(`[name="${nombre}"]`)!;
    const escribir = async (nombre: string, valor: string) => {
      const control = campo(nombre);
      control.value = valor;
      control.dispatchEvent(new Event('input'));
      await estable();
    };
    const guardarFormulario = async () => {
      elemento.querySelector('form')!.dispatchEvent(new Event('submit'));
      await estable();
    };

    return { elemento, api, campo, escribir, guardarFormulario };
  };

  it('carga lo que hay', async () => {
    const { campo } = await montar();

    expect(campo('descuentoSocioPorcentaje').value).toBe('15');
    expect(campo('umbralStockBajo').value).toBe('2');
    expect(campo('arriendoRaquetasTexto').value).toBe('');
  });

  it('**guarda los tres valores** y dice que quedó', async () => {
    const { api, elemento, escribir, guardarFormulario } = await montar();

    await escribir('descuentoSocioPorcentaje', '20');
    await escribir('umbralStockBajo', '3');
    await escribir('arriendoRaquetasTexto', 'Arrendamos raquetas en el mesón.');
    await guardarFormulario();

    expect(api.guardar).toHaveBeenCalledWith({
      descuentoSocioPorcentaje: 20,
      umbralStockBajo: 3,
      arriendoRaquetasTexto: 'Arrendamos raquetas en el mesón.',
    });
    expect(elemento.textContent).toContain('Guardado');
  });

  it('**un campo vacío no se guarda como cero**: el descuento quedaría en 0% sin aviso', async () => {
    const { api, elemento, escribir, guardarFormulario } = await montar();

    await escribir('descuentoSocioPorcentaje', '');
    await guardarFormulario();

    expect(api.guardar).not.toHaveBeenCalled();
    expect(elemento.textContent).toContain('Escribe el descuento de socio');
  });

  it('si la API no lo acepta, muestra por qué', async () => {
    const { elemento, escribir, guardarFormulario } = await montar(() =>
      Promise.reject(
        new HttpErrorResponse({
          status: 400,
          error: { message: 'El descuento de socio no puede pasar de 50.' },
        }),
      ),
    );

    await escribir('descuentoSocioPorcentaje', '60');
    await guardarFormulario();

    expect(elemento.textContent).toContain('no puede pasar de 50');
  });
});
