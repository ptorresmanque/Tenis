import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { FichaDeTour, NivelDelPanel, TemporadaDelPanel, Tours } from '../tours.service';
import { TemporadasDelTour } from './temporadas-del-tour';

/**
 * T192. La pestaña Temporadas: crear una (que copia los niveles de la anterior), corregir
 * su nombre y sus fechas, y borrarla si no tiene torneos. Cada nivel es un
 * `app-nivel-del-tour`, con su prueba aparte.
 */
describe('TemporadasDelTour', () => {
  const nivel = (id: number, torneos = 0): NivelDelPanel => ({
    id,
    nombre: `${id * 100}`,
    tabla: {
      campeon: 500,
      finalista: 300,
      semifinal: 180,
      cuartos: 90,
      octavos: 45,
      dieciseisavos: 20,
      treintaidosavos: 10,
    },
    torneos,
    torneosTerminados: 0,
  });

  const temporada = (
    id: number,
    nombre: string,
    niveles: NivelDelPanel[] = [],
  ): TemporadaDelPanel => ({
    id,
    nombre,
    fechaInicio: `${nombre}-03-01`,
    fechaFin: `${nombre}-12-15`,
    niveles,
  });

  const tour = (temporadas: TemporadaDelPanel[]): FichaDeTour => ({
    id: 3,
    nombre: 'Tour FEDAL',
    descripcion: '',
    imagen: null,
    temporadas,
    fotos: [],
  });

  const montar = async (
    temporadas: TemporadaDelPanel[] = [
      temporada(12, '2027', [nivel(5), nivel(2)]),
      temporada(11, '2026', [nivel(1, 3)]),
    ],
  ) => {
    const api = {
      crearTemporada: vi.fn().mockResolvedValue({}),
      editarTemporada: vi.fn().mockResolvedValue({}),
      borrarTemporada: vi.fn().mockResolvedValue({}),
      crearNivel: vi.fn(),
      editarNivel: vi.fn(),
      borrarNivel: vi.fn(),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: Tours, useValue: api }] });
    const fixture = TestBed.createComponent(TemporadasDelTour);
    fixture.componentRef.setInput('tour', tour(temporadas));
    const cambio = vi.fn();
    fixture.componentInstance.cambio.subscribe(cambio);
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, api, cambio, elemento: fixture.nativeElement as HTMLElement };
  };

  /** El bloque de una temporada, por su título. */
  const bloque = (elemento: HTMLElement, nombre: string) =>
    Array.from(elemento.querySelectorAll('article')).find((a) =>
      a.querySelector('h3')?.textContent?.includes(nombre),
    )!;

  const escribir = async (
    fixture: { whenStable: () => Promise<unknown>; detectChanges: () => void },
    raiz: HTMLElement,
    nombre: string,
    valor: string,
  ) => {
    // `:is(...)`: el `name` también queda en el `app-campo-fecha` que envuelve al campo.
    const entrada = raiz.querySelector<HTMLInputElement>(`input[name="${nombre}"]`)!;
    entrada.value = valor;
    entrada.dispatchEvent(new Event('input'));
    entrada.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const apretar = async (
    fixture: { whenStable: () => Promise<unknown>; detectChanges: () => void },
    raiz: HTMLElement,
    texto: string,
  ) => {
    Array.from(raiz.querySelectorAll('button'))
      .find((b) => b.textContent?.trim().startsWith(texto))!
      .click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  it('muestra cada temporada con sus fechas en palabras y un nivel por fila, más el de agregar', async () => {
    const { elemento } = await montar();
    const de2027 = bloque(elemento, '2027');

    expect(de2027.textContent).toContain('marzo');
    // Dos niveles y el formulario para agregar otro.
    expect(de2027.querySelectorAll('app-nivel-del-tour')).toHaveLength(3);
  });

  it('sin temporadas, dice cómo empezar y que la primera nace sin niveles', async () => {
    const { elemento } = await montar([]);

    expect(elemento.textContent).toContain('Todavía no tiene temporadas');
  });

  it('**crea una temporada**, avisando que copia los niveles de la más reciente', async () => {
    const { fixture, api, cambio, elemento } = await montar();
    const formulario = elemento.querySelector<HTMLElement>('form[aria-label="Nueva temporada"]')!;

    expect(formulario.textContent).toContain('Copia los niveles de 2027');

    await escribir(fixture, formulario, 'nombre', '2028');
    await escribir(fixture, formulario, 'fechaInicio', '2028-03-01');
    await escribir(fixture, formulario, 'fechaFin', '2028-12-15');
    await apretar(fixture, formulario, 'Crear la temporada');

    expect(api.crearTemporada).toHaveBeenCalledWith(3, {
      nombre: '2028',
      fechaInicio: '2028-03-01',
      fechaFin: '2028-12-15',
    });
    expect(cambio).toHaveBeenCalled();
  });

  it('corrige el nombre y las fechas de una temporada', async () => {
    const { fixture, api, elemento } = await montar();
    const de2027 = bloque(elemento, '2027');

    await apretar(fixture, de2027, 'Editar');
    await escribir(fixture, de2027, 'nombre', 'Apertura 2027');
    await apretar(fixture, de2027, 'Guardar la temporada');

    expect(api.editarTemporada).toHaveBeenCalledWith(12, {
      nombre: 'Apertura 2027',
      fechaInicio: '2027-03-01',
      fechaFin: '2027-12-15',
    });
  });

  it('**una temporada con torneos no ofrece borrar**; una sin torneos, después de confirmar', async () => {
    const { fixture, api, elemento } = await montar();
    const de2026 = bloque(elemento, '2026');
    const de2027 = bloque(elemento, '2027');

    expect(de2026.textContent).toContain('Tiene 3 torneos');
    expect(
      Array.from(de2026.querySelectorAll(':scope > header button')).some((b) =>
        b.textContent?.includes('Borrar'),
      ),
    ).toBe(false);

    await apretar(fixture, de2027, 'Borrar la temporada');
    expect(api.borrarTemporada).not.toHaveBeenCalled();
    await apretar(fixture, de2027, 'Sí, borrar');

    expect(api.borrarTemporada).toHaveBeenCalledWith(12);
  });
});
