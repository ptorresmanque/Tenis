import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { elegidoEn, elegir as elegirOpcion } from '../../testing/elegir';
import { Ranking, TablaDeTorneos } from '../../ranking/ranking.service';
import { TorneoPublico } from '../../torneos/torneos.service';
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

  /** Un torneo terminado de la temporada 2027, que suma como 500. */
  const COPA: TorneoPublico = {
    id: 40,
    nombre: 'Copa Aniversario',
    superficie: null,
    fechaInicio: '2027-05-01',
    fechaFin: '2027-05-03',
    cierreInscripcion: '2027-04-25',
    estado: 'FINALIZADO',
    categorias: [],
    tours: [
      {
        tourId: 3,
        tour: 'Tour FEDAL',
        temporadaId: 12,
        temporada: '2027',
        nivelId: 5,
        nivel: '500',
      },
    ],
    afiches: [],
  };

  const RANKING: TablaDeTorneos = {
    temporada: { id: 12, nombre: '2027', fechaInicio: '2027-03-01', fechaFin: '2027-12-15' },
    categorias: [
      { id: 60, nombre: 'Honor' },
      { id: 20, nombre: '4ª' },
    ],
    categoriaJuegoId: 60,
    torneos: [],
    posiciones: [{ puesto: 1, jugadorId: 1, nombre: 'Ana Uno', puntos: 500, torneos: 1 }],
  };

  const montar = async (
    tour: () => Promise<TourPublico> = () => Promise.resolve(TOUR),
    temporada?: string,
    opciones: { categoria?: string; torneos?: TorneoPublico[] | Error } = {},
  ) => {
    const torneosDeLaTemporada = vi.fn(() =>
      opciones.torneos instanceof Error
        ? Promise.reject(opciones.torneos)
        : Promise.resolve(opciones.torneos ?? [COPA]),
    );
    const ranking = vi.fn().mockResolvedValue(RANKING);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Tours, useValue: { publico: vi.fn(tour), torneosDeLaTemporada } },
        { provide: Ranking, useValue: { torneos: ranking } },
      ],
    });
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(TourPublicoPagina);
    fixture.componentRef.setInput('id', '3');
    if (temporada) fixture.componentRef.setInput('temporada', temporada);
    if (opciones.categoria) fixture.componentRef.setInput('categoria', opciones.categoria);
    for (let i = 0; i < 3; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
    return {
      fixture,
      navegar,
      torneosDeLaTemporada,
      ranking,
      elemento: fixture.nativeElement as HTMLElement,
    };
  };

  /**
   * Los encabezados de la tabla de puntos: el primero es el de los resultados. Acotados a
   * su sección, porque desde T201 la página tiene también la tabla del ranking.
   */
  const columnas = (elemento: HTMLElement) =>
    Array.from(elemento.querySelectorAll('[aria-labelledby="como-se-suman"] table thead th')).map(
      (th) => th.textContent?.trim(),
    );

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
    const filas = Array.from(
      elemento.querySelectorAll('[aria-labelledby="como-se-suman"] table tbody tr'),
    );
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
    const { fixture, elemento } = await montar(undefined, '11');

    expect(columnas(elemento)).toEqual(['Resultado', 'Máster']);
    expect(elegidoEn(fixture, 'mat-select')).toBe('11');
  });

  it('cambiar la temporada la pone en la dirección, para que el enlace se pueda compartir', async () => {
    const { fixture, navegar } = await montar();

    await elegirOpcion(fixture, 'mat-select', '11');

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
    expect(elemento.querySelector('mat-select')).toBeNull();
    expect(elemento.querySelector('app-galeria')).toBeNull();
    expect(elemento.querySelector('img')).toBeNull();
  });

  describe('sus torneos y su ranking (T201)', () => {
    it('**lista los torneos de la temporada** con su nivel, sus fechas y su estado, enlazados a /torneos', async () => {
      const { elemento, torneosDeLaTemporada } = await montar();
      const torneos = elemento.querySelector<HTMLElement>(
        '[aria-labelledby="torneos-de-la-temporada"]',
      )!;

      expect(torneosDeLaTemporada).toHaveBeenCalledWith(12);
      expect(torneos.textContent).toContain('Copa Aniversario');
      expect(torneos.textContent).toContain('Nivel 500');
      expect(torneos.textContent).toContain('3 de mayo de 2027');
      expect(torneos.textContent).toContain('Finalizado');
      expect(torneos.querySelector('a')?.getAttribute('href')).toBe('/torneos');
    });

    it('**el ranking es el mismo de /ranking**: la misma tabla, con la temporada elegida', async () => {
      const { elemento, ranking } = await montar();

      expect(elemento.querySelector('app-tabla-de-tour')).not.toBeNull();
      expect(ranking).toHaveBeenCalledWith(12, null);
    });

    it('**cambiar la temporada cambia los torneos y el ranking**', async () => {
      const { torneosDeLaTemporada, ranking } = await montar(undefined, '11');

      expect(torneosDeLaTemporada).toHaveBeenLastCalledWith(11);
      expect(ranking).toHaveBeenLastCalledWith(11, null);
    });

    it('`?categoria=` llega a la tabla, y elegir otra la pone en la dirección con la temporada', async () => {
      const { fixture, ranking, navegar } = await montar(undefined, undefined, {
        categoria: '20',
      });
      expect(ranking).toHaveBeenLastCalledWith(12, 20);

      // La tabla de prueba trae Honor (60) elegida: «otra» es la 4ª. Elegir la que ya está no
      // avisa, como en cualquier lista (T248).
      await elegirOpcion(fixture, `mat-select[name="categoria"]`, '20');
      await fixture.whenStable();

      expect(navegar.mock.lastCall?.[1]).toMatchObject({
        queryParams: { temporada: 12, categoria: 20 },
      });
    });

    it('si los torneos no cargan, lo dice en vez de esconder las secciones en silencio', async () => {
      const { elemento } = await montar(undefined, undefined, { torneos: new Error('caída') });

      expect(elemento.textContent).toContain('No se pudieron cargar los torneos de esta temporada');
      expect(elemento.querySelector('app-tabla-de-tour')).toBeNull();
    });

    it('**una temporada sin torneos no muestra esas dos secciones**', async () => {
      const { elemento } = await montar(undefined, undefined, { torneos: [] });

      expect(elemento.querySelector('[aria-labelledby="torneos-de-la-temporada"]')).toBeNull();
      expect(elemento.querySelector('app-tabla-de-tour')).toBeNull();
      // La tabla de puntos sí: el club la cargó aunque todavía no haya torneos.
      expect(elemento.querySelector('table')).not.toBeNull();
    });
  });

  it('un tour que no existe lo dice, con el enlace a los demás', async () => {
    const { elemento } = await montar(() => Promise.reject({ status: 404 }));

    expect(elemento.textContent).toContain('No encontramos ese tour');
    expect(elemento.querySelector('a[href="/tours"]')).not.toBeNull();
  });

  /**
   * T356 (SPEC-seo.md A1). La ruta solo sabe que es «un tour»: la página, al cargarlo, le pone su
   * nombre a la pestaña y al Open Graph, y su descripción al buscador.
   */
  describe('el título y la descripción del tour (T356)', () => {
    const meta = (selector: string) =>
      document.head.querySelector<HTMLMetaElement>(`meta[${selector}]`)?.content;

    beforeEach(() => {
      document.title = 'Tour — FEDAL Tennis Center';
    });
    afterEach(() => {
      document.head.querySelectorAll('meta[name], meta[property]').forEach((m) => m.remove());
    });

    it('**la pestaña y el Open Graph dicen el nombre del tour**', async () => {
      await montar();

      expect(document.title).toBe('Tour FEDAL — FEDAL Tennis Center');
      expect(meta('property="og:title"')).toBe('Tour FEDAL — FEDAL Tennis Center');
    });

    it('la descripción es la que escribió el club, en un renglón', async () => {
      await montar();

      expect(meta('name="description"')).toBe(
        'La liga del club. Cuatro torneos por temporada, <b>sin excusas</b>.',
      );
    });

    it('una descripción larga se corta en una palabra, con «…», en 160 o menos', async () => {
      const larga = 'Una liga de todo el año para socios y visitantes. '.repeat(5).trim();
      await montar(() => Promise.resolve({ ...TOUR, descripcion: larga }));

      const descripcion = meta('name="description"') ?? '';
      expect(descripcion.length).toBeLessThanOrEqual(160);
      expect(descripcion.endsWith('…')).toBe(true);
      expect(larga.startsWith(descripcion.slice(0, -1))).toBe(true);
      expect(larga.charAt(descripcion.length - 1)).toBe(' ');
    });

    it('sin descripción del club, la arma con el nombre y la temporada', async () => {
      await montar(() => Promise.resolve({ ...TOUR, descripcion: '' }));

      expect(meta('name="description"')).toBe(
        'Tour FEDAL, el tour de FEDAL Tennis Center en Temuco. Temporada 2027: los torneos que ' +
          'suman, la tabla de puntos y el ranking.',
      );
    });

    it('un tour que no existe deja el título de la ruta', async () => {
      await montar(() => Promise.reject(new Error('404')));

      expect(document.title).toBe('Tour — FEDAL Tennis Center');
      expect(meta('name="description"')).toBeUndefined();
    });
  });
});
