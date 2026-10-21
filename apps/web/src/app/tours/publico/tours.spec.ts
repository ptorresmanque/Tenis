import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { TourPublicoEnLista, Tours } from '../tours.service';
import { ToursPublicos } from './tours';

/**
 * T195. `/tours`, sin cuenta: una tarjeta por tour con su imagen, su nombre, la temporada
 * que se está jugando y el comienzo de su descripción.
 */
describe('ToursPublicos', () => {
  const TOURS: TourPublicoEnLista[] = [
    {
      id: 1,
      nombre: 'Tour FEDAL',
      extracto: 'La liga del club, con cuatro torneos por temporada.',
      imagen: { miniatura: '/api/tours/1/miniatura', web: '/api/tours/1/imagen' },
      temporadaVigente: {
        id: 12,
        nombre: '2027',
        fechaInicio: '2027-03-01',
        fechaFin: '2027-12-15',
      },
    },
    {
      id: 2,
      nombre: 'Tour Senior',
      extracto: '',
      imagen: null,
      temporadaVigente: null,
    },
  ];

  const montar = async (
    publicos: () => Promise<TourPublicoEnLista[]> = () => Promise.resolve(TOURS),
  ) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Tours, useValue: { publicos: vi.fn(publicos) } }],
    });
    const fixture = TestBed.createComponent(ToursPublicos);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  const tarjeta = (elemento: HTMLElement, nombre: string) =>
    Array.from(elemento.querySelectorAll('li')).find((li) =>
      li.querySelector('h2')?.textContent?.includes(nombre),
    )!;

  it('el titular es «Tours», y cada tour enlaza a su página', async () => {
    const elemento = await montar();

    expect(elemento.querySelector('h1')?.textContent).toContain('Tours');
    expect(tarjeta(elemento, 'Tour FEDAL').querySelector('a')?.getAttribute('href')).toBe(
      '/tours/1',
    );
  });

  it('la bajada invita a jugar la temporada (P17)', async () => {
    const elemento = await montar();

    expect(elemento.textContent.replace(/\s+/g, ' ')).toContain(
      'Juega la temporada completa: cada torneo suma puntos en las ligas del club y te sube en el ranking.',
    );
  });

  it('**el enlace se llama como el tour**, no como toda la tarjeta', async () => {
    const elemento = await montar();
    const enlace = tarjeta(elemento, 'Tour FEDAL').querySelector('a')!;

    expect(enlace.textContent?.trim()).toBe('Tour FEDAL');
    expect(enlace.querySelector('img')).toBeNull();
  });

  it('**con imagen, la muestra**; sin ella, el nombre sobre el campo, sin un hueco vacío', async () => {
    const elemento = await montar();

    const conImagen = tarjeta(elemento, 'Tour FEDAL').querySelector('img');
    expect(conImagen?.getAttribute('src')).toBe('/api/tours/1/imagen');
    expect(conImagen?.alt).toBe('Imagen de Tour FEDAL');
    expect(tarjeta(elemento, 'Tour Senior').querySelector('img')).toBeNull();
  });

  it('dice qué temporada se está jugando, con sus fechas en palabras', async () => {
    const elemento = await montar();
    const fedal = tarjeta(elemento, 'Tour FEDAL');

    expect(fedal.textContent).toContain('Temporada 2027');
    expect(fedal.textContent).toContain('1 de marzo de 2027');
    expect(fedal.textContent).not.toContain('lunes');
    expect(fedal.textContent).toContain('La liga del club');
    // Sin temporada no se inventa una línea.
    expect(tarjeta(elemento, 'Tour Senior').textContent).not.toContain('Temporada');
  });

  it('sin tours, lo dice', async () => {
    const elemento = await montar(() => Promise.resolve([]));

    expect(elemento.textContent).toContain('Todavía no hay tours');
  });

  it('si la lista no carga, lo dice', async () => {
    const elemento = await montar(() => Promise.reject(new Error('caída')));

    expect(elemento.textContent).toContain('No se pudieron cargar los tours');
  });
});
