import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { FichaDeTour, FotoDeTour, Tours } from '../tours.service';
import { GaleriaDelTour } from './galeria-del-tour';

/**
 * T193. La pestaña Galería: subir fotos con su pie, corregir el pie y borrarlas. El mismo
 * trato que las fotos de un torneo en el panel, sin el selector de momento.
 */
describe('GaleriaDelTour', () => {
  const foto = (id: number, descripcion: string | null = null): FotoDeTour => ({
    id,
    descripcion,
    miniatura: `/api/tours/fotos/${id}/miniatura`,
    imagen: `/api/tours/fotos/${id}/imagen`,
  });

  const tour = (fotos: FotoDeTour[]): FichaDeTour => ({
    id: 3,
    nombre: 'Tour FEDAL',
    descripcion: '',
    imagen: null,
    temporadas: [],
    fotos,
  });

  const montar = async (
    fotos: FotoDeTour[] = [foto(9, 'La premiación'), foto(8)],
    subir: () => Promise<unknown> = () => Promise.resolve(foto(10)),
  ) => {
    const api = {
      subirFoto: vi.fn(subir),
      corregirPie: vi.fn().mockResolvedValue(foto(9, 'El cuadro de Honor')),
      quitarFoto: vi.fn().mockResolvedValue({ id: 9 }),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: Tours, useValue: api }] });
    const fixture = TestBed.createComponent(GaleriaDelTour);
    fixture.componentRef.setInput('tour', tour(fotos));
    const cambio = vi.fn();
    fixture.componentInstance.cambio.subscribe(cambio);
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, api, cambio, elemento: fixture.nativeElement as HTMLElement };
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

  const escribir = async (
    fixture: { whenStable: () => Promise<unknown> },
    control: HTMLInputElement,
    valor: string,
  ) => {
    control.value = valor;
    control.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };

  /** La fila de una foto, por la dirección de su miniatura. */
  const fila = (elemento: HTMLElement, id: number) =>
    elemento.querySelector<HTMLElement>(`li:has(img[src="/api/tours/fotos/${id}/miniatura"])`)!;

  it('muestra las miniaturas, con su pie o uno que dice de quién es', async () => {
    const { elemento } = await montar();
    const imagenes = elemento.querySelectorAll('img');

    expect(imagenes).toHaveLength(2);
    expect(imagenes[0].alt).toBe('La premiación');
    expect(imagenes[1].alt).toBe('Foto de Tour FEDAL');
  });

  it('**cada pie dice de qué foto es** para el lector de pantalla, no el mismo en todas', async () => {
    const { elemento } = await montar();
    const etiquetas = Array.from(elemento.querySelectorAll('li label')).map((l) =>
      l.textContent?.replace(/\s+/g, ' ').trim(),
    );

    expect(etiquetas).toEqual(['Pie de foto (foto 1 de 2)', 'Pie de foto (foto 2 de 2)']);
  });

  it('sin fotos, lo dice', async () => {
    const { elemento } = await montar([]);

    expect(elemento.textContent).toContain('Todavía no tiene fotos');
  });

  it('**sube la foto elegida con su pie**, y la ficha recarga', async () => {
    const { fixture, api, cambio, elemento } = await montar();
    const formulario = elemento.querySelector<HTMLElement>('form[aria-label="Subir una foto"]')!;
    const entrada = formulario.querySelector<HTMLInputElement>('input[type="file"]')!;
    const archivo = new File(['foto'], 'premiacion.jpg', { type: 'image/jpeg' });
    Object.defineProperty(entrada, 'files', { value: [archivo] });
    entrada.dispatchEvent(new Event('change'));
    await escribir(
      fixture,
      formulario.querySelector<HTMLInputElement>('input[name="pie"]')!,
      '  El podio  ',
    );

    await apretar(fixture, formulario, 'Subir la foto');

    expect(api.subirFoto).toHaveBeenCalledWith(3, archivo, 'El podio');
    expect(cambio).toHaveBeenCalled();
  });

  it('si la API rechaza el archivo, muestra su mensaje y no recarga', async () => {
    const { fixture, cambio, elemento } = await montar(undefined, () =>
      Promise.reject({
        status: 400,
        error: { message: 'Ese archivo no es una imagen que podamos leer.' },
      }),
    );
    const formulario = elemento.querySelector<HTMLElement>('form[aria-label="Subir una foto"]')!;
    const entrada = formulario.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(entrada, 'files', { value: [new File(['x'], 'x.jpg')] });
    entrada.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    await apretar(fixture, formulario, 'Subir la foto');

    expect(elemento.textContent).toContain('Ese archivo no es una imagen');
    expect(cambio).not.toHaveBeenCalled();
  });

  it('**el pie se corrige** desde la fila de su foto', async () => {
    const { fixture, api, elemento } = await montar();
    const suya = fila(elemento, 9);

    await escribir(fixture, suya.querySelector<HTMLInputElement>('input')!, 'El cuadro de Honor');
    await apretar(fixture, suya, 'Guardar el pie');

    expect(api.corregirPie).toHaveBeenCalledWith(9, 'El cuadro de Honor');
  });

  it('**borrar pide confirmación**, y después la borra', async () => {
    const { fixture, api, cambio, elemento } = await montar();
    const suya = fila(elemento, 9);

    await apretar(fixture, suya, 'Borrar');
    expect(api.quitarFoto).not.toHaveBeenCalled();

    await apretar(fixture, fila(elemento, 9), 'Sí, borrar');

    expect(api.quitarFoto).toHaveBeenCalledWith(9);
    expect(cambio).toHaveBeenCalled();
  });
});
