import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { NivelDelPanel, Tours } from '../tours.service';
import { NivelDelTour } from './nivel-del-tour';

/**
 * T192. Un nivel de una temporada, con su tabla de puntos en siete casillas. Sirve
 * también para agregar uno nuevo. Guardar la tabla de uno con torneos terminados avisa
 * antes, porque cambia el ranking de la temporada.
 */
describe('NivelDelTour', () => {
  const NIVEL: NivelDelPanel = {
    id: 8,
    nombre: '500',
    tabla: {
      campeon: 500,
      finalista: 300,
      semifinal: 180,
      cuartos: 90,
      octavos: 45,
      dieciseisavos: 20,
      treintaidosavos: 10,
    },
    torneos: 0,
    torneosTerminados: 0,
  };

  const montar = async (
    nivel: NivelDelPanel | null = NIVEL,
    respuestas: Partial<Record<'crearNivel' | 'editarNivel' | 'borrarNivel', () => Promise<unknown>>> = {},
  ) => {
    const api = {
      crearNivel: vi.fn(respuestas.crearNivel ?? (() => Promise.resolve(NIVEL))),
      editarNivel: vi.fn(respuestas.editarNivel ?? (() => Promise.resolve(NIVEL))),
      borrarNivel: vi.fn(respuestas.borrarNivel ?? (() => Promise.resolve({ id: 8 }))),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: Tours, useValue: api }] });
    const fixture = TestBed.createComponent(NivelDelTour);
    fixture.componentRef.setInput('nivel', nivel);
    fixture.componentRef.setInput('temporadaId', 5);
    fixture.componentRef.setInput('temporada', '2027');
    const cambio = vi.fn();
    fixture.componentInstance.cambio.subscribe(cambio);
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, api, cambio, elemento: fixture.nativeElement as HTMLElement };
  };

  const campo = (elemento: HTMLElement, etiqueta: string) =>
    Array.from(elemento.querySelectorAll('mat-form-field'))
      .find((l) => l.querySelector('mat-label')?.textContent?.trim().startsWith(etiqueta))
      ?.querySelector('input') as HTMLInputElement;

  const escribir = async (
    fixture: { whenStable: () => Promise<unknown> },
    control: HTMLInputElement,
    valor: string,
  ) => {
    control.value = valor;
    control.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };

  const apretar = async (
    fixture: { whenStable: () => Promise<unknown>; detectChanges: () => void },
    elemento: HTMLElement,
    texto: string,
  ) => {
    Array.from(elemento.querySelectorAll('button'))
      .find((b) => b.textContent?.trim().startsWith(texto))!
      .click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  it('muestra el nombre y las siete filas, cada una con su etiqueta', async () => {
    const { elemento } = await montar();

    expect(campo(elemento, 'Nivel').value).toBe('500');
    for (const [etiqueta, valor] of [
      ['Campeón', '500'],
      ['Finalista', '300'],
      ['Semifinal', '180'],
      ['Cuartos', '90'],
      ['Octavos', '45'],
      ['Dieciseisavos', '20'],
      ['Treintaidosavos', '10'],
    ]) {
      expect(campo(elemento, etiqueta).value).toBe(valor);
    }
  });

  it('**guarda el nombre y la tabla entera**, en números, y avisa que cambió', async () => {
    const { fixture, api, cambio, elemento } = await montar();

    await escribir(fixture, campo(elemento, 'Campeón'), '1000');
    await apretar(fixture, elemento, 'Guardar');

    expect(api.editarNivel).toHaveBeenCalledWith(8, {
      nombre: '500',
      tabla: { ...NIVEL.tabla, campeon: 1000 },
    });
    expect(cambio).toHaveBeenCalled();
  });

  it('**con torneos terminados, avisa antes de guardar** y espera la confirmación', async () => {
    const { fixture, api, elemento } = await montar({
      ...NIVEL,
      torneos: 4,
      torneosTerminados: 3,
    });

    await apretar(fixture, elemento, 'Guardar');

    expect(api.editarNivel).not.toHaveBeenCalled();
    expect(elemento.textContent).toContain(
      'Este nivel ya cuenta en 3 torneos terminados: cambiarlo cambia el ranking de la temporada 2027.',
    );

    await apretar(fixture, elemento, 'Sí, guardar');

    expect(api.editarNivel).toHaveBeenCalled();
  });

  it('si la API rechaza la tabla, muestra su mensaje y no avisa nada', async () => {
    const { fixture, cambio, elemento } = await montar(NIVEL, {
      editarNivel: () =>
        Promise.reject({
          status: 400,
          error: { message: 'La semifinal no puede dar más puntos que la final (400 contra 300).' },
        }),
    });

    await apretar(fixture, elemento, 'Guardar');

    expect(elemento.textContent).toContain('La semifinal no puede dar más puntos que la final');
    expect(cambio).not.toHaveBeenCalled();
  });

  it('**un nivel con torneos no ofrece borrar**, y dice en cuántos se usa', async () => {
    const { elemento } = await montar({ ...NIVEL, torneos: 2 });

    expect(elemento.textContent).toContain('Se usa en 2 torneos');
    expect(
      Array.from(elemento.querySelectorAll('button')).some((b) =>
        b.textContent?.includes('Borrar'),
      ),
    ).toBe(false);
  });

  it('uno sin torneos se borra después de confirmar', async () => {
    const { fixture, api, cambio, elemento } = await montar();

    await apretar(fixture, elemento, 'Borrar');
    expect(api.borrarNivel).not.toHaveBeenCalled();

    await apretar(fixture, elemento, 'Sí, borrar');

    expect(api.borrarNivel).toHaveBeenCalledWith(8);
    expect(cambio).toHaveBeenCalled();
  });

  it('**sin nivel, es el formulario para agregar uno** a la temporada', async () => {
    const { fixture, api, cambio, elemento } = await montar(null);

    await escribir(fixture, campo(elemento, 'Nivel'), 'Máster');
    for (const [etiqueta, valor] of [
      ['Campeón', '1000'],
      ['Finalista', '600'],
      ['Semifinal', '360'],
      ['Cuartos', '180'],
      ['Octavos', '90'],
      ['Dieciseisavos', '45'],
      ['Treintaidosavos', '0'],
    ]) {
      await escribir(fixture, campo(elemento, etiqueta), valor);
    }
    await apretar(fixture, elemento, 'Agregar el nivel');

    expect(api.crearNivel).toHaveBeenCalledWith(5, {
      nombre: 'Máster',
      tabla: {
        campeon: 1000,
        finalista: 600,
        semifinal: 360,
        cuartos: 180,
        octavos: 90,
        dieciseisavos: 45,
        treintaidosavos: 0,
      },
    });
    expect(cambio).toHaveBeenCalled();
  });
});
