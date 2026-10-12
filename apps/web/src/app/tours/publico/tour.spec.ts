import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { TourPublico, Tours } from '../tours.service';
import { TourPublicoPagina } from './tour';

/**
 * T195. La página pública de un tour: su imagen, su descripción, la tabla de cómo se
 * suman los puntos en la temporada elegida (la vigente por omisión, o la de
 * `?temporada=`) y su galería. Las secciones sin contenido no aparecen.
 */
describe('TourPublicoPagina', () => {
  const tabla = (campeon: number) => ({
    campeon,
    finalista: campeon * 0.6,
    semifinal: campeon * 0.36,
    cuartos: campeon * 0.18,
    octavos: 0,
    dieciseisavos: 0,
    treintaidosavos: 0,
  });

  const TOUR: TourPublico = {
    id: 3,
    nombre: 'Tour FEDAL',
    descripcion: 'La liga del club.\nCuatro torneos por temporada, <b>sin excusas</b>.',
    imagen: { miniatura: '/api/tours/3/miniatura', web: '/api/tours/3/imagen' },
    temporadaVigenteId: 12,
    temporadas: [
      {
        id: 12,
        nombre: '2027',
        fechaInicio: '2027-03-01',
        fechaFin: '2027-12-15',
        niveles: [
          { id: 5, nombre: '500', tabla: tabla(500) },
          { id: 6, nombre: '250', tabla: tabla(250) },
        ],
      },
      {
        id: 11,
        nombre: '2026',
        fechaInicio: '2026-03-01',
        fechaFin: '2026-12-15',
        niveles: [{ id: 1, nombre: 'Máster', tabla: tabla(1000) }],
      },
    ],
    fotos: [
      {
        id: 9,
        descripcion: 'La premiación',
        miniatura: '/api/tours/fotos/9/miniatura',
        imagen: '/api/tours/fotos/9/imagen',
      },
    ],
  };

  const montar = async (
    tour: () => Promise<TourPublico> = () => Promise.resolve(TOUR),
    temporada?: string,
  ) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Tours, useValue: { publico: vi.fn(tour) } }],
    });
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(TourPublicoPagina);
    fixture.componentRef.setInput('id', '3');
    if (temporada) fixture.componentRef.setInput('temporada', temporada);
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, navegar, elemento: fixture.nativeElement as HTMLElement };
  };

  /** Los encabezados de la tabla de puntos: el primero es el de los resultados. */
  const columnas = (elemento: HTMLElement) =>
    Array.from(elemento.querySelectorAll('table thead th')).map((th) => th.textContent?.trim());

  it('el nombre es el titular, sobre su imagen', async () => {
    const { elemento } = await montar();

    expect(elemento.querySelector('h1')?.textContent).toContain('Tour FEDAL');
    expect(elemento.querySelector('img')?.getAttribute('src')).toBe('/api/tours/3/imagen');
  });

  it('la descripción respeta sus saltos de línea y **no interpreta HTML**', async () => {
    const { elemento } = await montar();
    const descripcion = elemento.querySelector<HTMLElement>('[data-descripcion]')!;

    expect(descripcion.textContent).toContain('<b>sin excusas</b>');
    expect(descripcion.querySelector('b')).toBeNull();
    expect(descripcion.className).toContain('whitespace-pre-line');
  });

  it('**por omisión muestra la temporada vigente**: un nivel por columna, una fila por resultado', async () => {
    const { elemento } = await montar();

    expect(columnas(elemento)).toEqual(['Resultado', '500', '250']);
    const filas = Array.from(elemento.querySelectorAll('table tbody tr'));
    expect(filas.map((f) => f.querySelector('th')?.textContent?.trim())).toEqual([
      'Campeón',
      'Finalista',
      'Semifinal',
      'Cuartos',
      'Octavos',
      'Dieciseisavos',
      'Treintaidosavos',
    ]);
    expect(filas[0].textContent).toContain('500');
    expect(filas[0].textContent).toContain('250');
  });

  it('**`?temporada=` abre esa**, con el selector en su lugar', async () => {
    const { elemento } = await montar(undefined, '11');

    expect(columnas(elemento)).toEqual(['Resultado', 'Máster']);
    expect(elemento.querySelector<HTMLSelectElement>('select')?.value).toBe('11');
  });

  it('cambiar la temporada la pone en la dirección, para que el enlace se pueda compartir', async () => {
    const { fixture, navegar, elemento } = await montar();
    const selector = elemento.querySelector<HTMLSelectElement>('select')!;

    selector.value = '11';
    selector.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(navegar).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { temporada: 11 }, replaceUrl: true }),
    );
  });

  it('dice lo que la tabla no dice sola: el bye no cuenta y el cero no aparece', async () => {
    const { elemento } = await montar();

    expect(elemento.textContent).toContain('bye');
  });

  it('la galería pide miniaturas', async () => {
    const { elemento } = await montar();
    const fuentes = Array.from(elemento.querySelectorAll('app-galeria img')).map((i) =>
      i.getAttribute('src'),
    );

    expect(fuentes).toEqual(['/api/tours/fotos/9/miniatura']);
  });

  it('**las secciones sin contenido no aparecen**: sin temporadas ni fotos, solo el tour', async () => {
    const { elemento } = await montar(() =>
      Promise.resolve({
        ...TOUR,
        imagen: null,
        temporadas: [],
        temporadaVigenteId: null,
        fotos: [],
      }),
    );

    expect(elemento.querySelector('h1')?.textContent).toContain('Tour FEDAL');
    expect(elemento.querySelector('table')).toBeNull();
    expect(elemento.querySelector('select')).toBeNull();
    expect(elemento.querySelector('app-galeria')).toBeNull();
    expect(elemento.querySelector('img')).toBeNull();
  });

  it('un tour que no existe lo dice, con el enlace a los demás', async () => {
    const { elemento } = await montar(() => Promise.reject({ status: 404 }));

    expect(elemento.textContent).toContain('No encontramos ese tour');
    expect(elemento.querySelector('a[href="/tours"]')).not.toBeNull();
  });
});
