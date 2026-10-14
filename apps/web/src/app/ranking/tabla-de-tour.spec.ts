import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';

import { elegidoEn, elegir as elegirOpcion, textosDe } from '../testing/elegir';
import { Ranking, TablaDeTorneos } from './ranking.service';
import { TablaDeTour } from './tabla-de-tour';

/**
 * T200. La tabla de un tour en una temporada y una categoría de juego. La usan
 * `/ranking` y, en T201, la página del tour.
 *
 * Lo que este archivo cuida: que **la tabla diga qué está contando** —la temporada con
 * sus fechas y los cuadros con su nivel—, que el selector de categoría solo ofrezca las
 * que tienen resultados, y que sin torneos terminados lo diga en vez de quedar en blanco.
 */
describe('TablaDeTour', () => {
  const TABLA: TablaDeTorneos = {
    temporada: {
      id: 12,
      nombre: '2027',
      fechaInicio: '2027-03-01',
      fechaFin: '2027-12-15',
    },
    categorias: [
      { id: 60, nombre: 'Honor' },
      { id: 20, nombre: '4ª' },
    ],
    categoriaJuegoId: 20,
    torneos: [
      {
        id: 5,
        torneoId: 2,
        nombre: 'Copa de verano',
        categoria: '4ª',
        nivel: '500',
        fechaFin: '2027-05-03',
      },
    ],
    posiciones: [
      { puesto: 1, jugadorId: 1, nombre: 'Ana Uno', puntos: 400, torneos: 2 },
      { puesto: 1, jugadorId: 2, nombre: 'Beto Dos', puntos: 400, torneos: 2 },
      { puesto: 3, jugadorId: 3, nombre: 'Cata Tres', puntos: 150, torneos: 1 },
    ],
  };

  let fixture: ComponentFixture<TablaDeTour>;
  let torneos: Mock<Ranking['torneos']>;
  let eligio: Mock<(categoria: number) => void>;

  const montar = async (tabla: TablaDeTorneos | Error = TABLA, categoriaId: number | null = 20) => {
    torneos = vi.fn<Ranking['torneos']>(() =>
      tabla instanceof Error ? Promise.reject(tabla) : Promise.resolve(tabla),
    );

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: Ranking, useValue: { torneos } }],
    });

    fixture = TestBed.createComponent(TablaDeTour);
    fixture.componentRef.setInput('temporadaId', 12);
    fixture.componentRef.setInput('categoriaId', categoriaId);
    eligio = vi.fn<(categoria: number) => void>();
    fixture.componentInstance.categoria.subscribe(eligio);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const texto = () => (elemento().textContent ?? '').replace(/\s+/g, ' ');

  /** Las filas de la tabla, cada una como el texto de sus celdas. */
  const filas = () =>
    Array.from(elemento().querySelectorAll('[data-tabla="torneos"] tbody tr')).map((fila) =>
      Array.from(fila.querySelectorAll('th, td')).map((celda) => celda.textContent?.trim() ?? ''),
    );

  const CATEGORIA = 'mat-select[name="categoria"]';
  const selector = () => elemento().querySelector(CATEGORIA);

  beforeEach(async () => {
    await montar();
  });

  it('pide la temporada y la categoría que recibe', () => {
    expect(torneos).toHaveBeenCalledWith(12, 20);
  });

  it('muestra a cada uno con su puesto, su nombre, sus puntos y sus torneos', () => {
    expect(filas()[0]).toEqual(['1', 'Ana Uno', '400', '2']);
  });

  it('**el empate se muestra como empate: dos en el 1 y el siguiente en el 3**', () => {
    expect(filas().map((fila) => fila[0])).toEqual(['1', '1', '3']);
  });

  it('**el podio se destaca**: del puesto 3 para arriba, con empates incluidos', async () => {
    await montar({
      ...TABLA,
      posiciones: [
        ...TABLA.posiciones,
        { puesto: 4, jugadorId: 4, nombre: 'Dani Cuatro', puntos: 90, torneos: 1 },
      ],
    });
    const enPodio = [...elemento().querySelectorAll('tbody tr')].map((fila) =>
      fila.hasAttribute('data-podio'),
    );

    expect(enPodio).toEqual([true, true, true, false]);
  });

  it('va en una tabla de verdad, con encabezados', () => {
    const encabezados = Array.from(
      elemento().querySelectorAll('[data-tabla="torneos"] thead th[scope="col"]'),
    ).map((th) => th.textContent?.trim());

    expect(encabezados).toEqual(['Puesto', 'Jugador', 'Puntos', 'Torneos']);
  });

  it('**dice qué temporada cuenta, con sus fechas y el año**', () => {
    expect(texto()).toContain('Temporada 2027');
    expect(texto()).toContain('1 de marzo de 2027');
    expect(texto()).toContain('15 de diciembre de 2027');
  });

  it('**cada cuadro se nombra con su categoría y su nivel**', () => {
    expect(texto()).toContain('Copa de verano · 4ª · Nivel 500 · terminó el 3 de mayo de 2027');
  });

  it('**el selector solo ofrece las categorías con resultados**, con la servida elegida', () => {
    expect(textosDe(fixture, CATEGORIA)).toEqual(['Honor', '4ª']);
    expect(elegidoEn(fixture, CATEGORIA)).toBe('20');
  });

  it('elegir otra categoría lo avisa, para que la página la ponga en la dirección', async () => {
    await elegirOpcion(fixture, CATEGORIA, '60');

    expect(eligio).toHaveBeenCalledWith(60);
  });

  it('**sin torneos terminados lo dice**, sin tabla ni selector', async () => {
    await montar({
      ...TABLA,
      categorias: [],
      categoriaJuegoId: null,
      torneos: [],
      posiciones: [],
    });

    expect(texto()).toContain('Esta temporada todavía no tiene torneos terminados.');
    expect(elemento().querySelector('table')).toBeNull();
    expect(selector()).toBeNull();
  });

  it('una categoría sin resultados lo dice, y deja elegir otra', async () => {
    await montar({ ...TABLA, categoriaJuegoId: 40, torneos: [], posiciones: [] }, 40);

    expect(texto()).toContain('Nadie suma puntos en esta categoría todavía.');
    // El selector no puede mostrar «Honor» con la tabla de otra: pide que se elija.
    // Con la lista cerrada, el campo muestra el texto de lo elegido (T248).
    expect(selector()?.textContent?.trim()).toBe('Elige una categoría');
  });

  // `value()` de un resource lanza en estado de error.
  it('si el ranking no carga, lo dice', async () => {
    await montar(new Error('la API no respondió'));

    expect(texto()).toContain('No se pudo cargar el ranking');
  });
});
