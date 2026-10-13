import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';

import { Auth, UsuarioActual } from '../core/auth/auth';
import { TourPublico, TourPublicoEnLista, Tours } from '../tours/tours.service';
import { Ranking, TablaDeTorneos } from './ranking.service';
import { RankingDeTorneos } from './torneos';

/**
 * T54, rehecha en T200. `/ranking`: la tabla de un tour, una temporada y una categoría de
 * juego, elegidos arriba con tres selectores (`SPEC-ranking.md` § La pantalla).
 *
 * Lo que este archivo cuida: **los valores por omisión** —el primer tour, su temporada
 * vigente y la categoría más alta con filas— y que **cada selector vaya en la dirección**,
 * para que el enlace copiado abra la misma tabla.
 */
describe('RankingDeTorneos', () => {
  const TOURS: TourPublicoEnLista[] = [
    {
      id: 1,
      nombre: 'Tour FEDAL',
      extracto: '',
      imagen: null,
      temporadaVigente: {
        id: 12,
        nombre: '2027',
        fechaInicio: '2027-03-01',
        fechaFin: '2027-12-15',
      },
    },
    { id: 2, nombre: 'Tour Senior', extracto: '', imagen: null, temporadaVigente: null },
  ];

  const temporada = (id: number, nombre: string) => ({
    id,
    nombre,
    fechaInicio: `${nombre}-03-01`,
    fechaFin: `${nombre}-12-15`,
    niveles: [],
  });

  const FICHAS: Record<number, TourPublico> = {
    1: {
      id: 1,
      nombre: 'Tour FEDAL',
      descripcion: '',
      imagen: null,
      temporadaVigenteId: 12,
      temporadas: [temporada(13, '2028'), temporada(12, '2027'), temporada(11, '2026')],
      fotos: [],
    },
    3: {
      id: 3,
      nombre: 'Tour Juvenil',
      descripcion: '',
      imagen: null,
      temporadaVigenteId: null,
      temporadas: [],
      fotos: [],
    },
    2: {
      id: 2,
      nombre: 'Tour Senior',
      descripcion: '',
      imagen: null,
      temporadaVigenteId: null,
      temporadas: [temporada(21, '2027')],
      fotos: [],
    },
  };

  const TABLA: TablaDeTorneos = {
    temporada: { id: 12, nombre: '2027', fechaInicio: '2027-03-01', fechaFin: '2027-12-15' },
    categorias: [
      { id: 60, nombre: 'Honor' },
      { id: 20, nombre: '4ª' },
    ],
    categoriaJuegoId: 60,
    torneos: [],
    posiciones: [{ puesto: 1, jugadorId: 1, nombre: 'Ana Uno', puntos: 500, torneos: 1 }],
  };

  /** Un socio cualquiera; `null` es quien mira desde la calle. */
  const SOCIA: UsuarioActual = {
    id: 9,
    nombre: 'Ana Uno',
    apellido: '',
    telefono: null,
    email: 'ana@ejemplo.cl',
    esAdmin: false,
    socioId: 3,
    socioActivo: true,
    socioAlDia: true,
    profesorId: null,
  };

  let fixture: ComponentFixture<RankingDeTorneos>;
  let torneos: ReturnType<typeof vi.fn>;
  let navegar: MockInstance<Router['navigate']>;

  const montar = async (
    opciones: {
      direccion?: { tour?: string; temporada?: string; categoria?: string };
      tours?: TourPublicoEnLista[];
      quien?: UsuarioActual | null;
    } = {},
  ) => {
    torneos = vi.fn().mockResolvedValue(TABLA);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: Ranking,
          useValue: {
            torneos,
            interno: vi.fn().mockResolvedValue({
              partidos: 0,
              ultimoPartido: null,
              inactivosDesde: '2026-02-25',
              posiciones: [],
            }),
          },
        },
        {
          provide: Tours,
          useValue: {
            publicos: vi.fn().mockResolvedValue(opciones.tours ?? TOURS),
            publico: vi.fn((id: number) =>
              FICHAS[id] ? Promise.resolve(FICHAS[id]) : Promise.reject(new Error('caída')),
            ),
          },
        },
        { provide: Auth, useValue: { usuario: signal(opciones.quien ?? null).asReadonly() } },
      ],
    });
    navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(RankingDeTorneos);
    for (const [clave, valor] of Object.entries(opciones.direccion ?? {})) {
      fixture.componentRef.setInput(clave, valor);
    }
    for (let i = 0; i < 3; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const texto = () => elemento().textContent ?? '';
  const selector = (nombre: string) =>
    elemento().querySelector<HTMLSelectElement>(`select[name="${nombre}"]`)!;

  const elegir = async (nombre: string, valor: string) => {
    selector(nombre).value = valor;
    selector(nombre).dispatchEvent(new Event('change'));
    await fixture.whenStable();
  };

  /** Lo que se pidió poner en la dirección la última vez. */
  const direccionPedida = () => navegar.mock.lastCall?.[1];

  beforeEach(async () => {
    await montar();
  });

  it('**sin parámetros abre el primer tour y su temporada vigente**, y deja la categoría a la tabla', () => {
    expect(torneos).toHaveBeenCalledWith(12, null);
    expect(selector('tour').value).toBe('1');
    expect(selector('temporada').value).toBe('12');
    // La categoría por omisión la decide el servidor: la más alta con filas.
    expect(selector('categoria').value).toBe('60');
  });

  it('**con parámetros abre esa tabla**, con los selectores en su lugar', async () => {
    await montar({ direccion: { tour: '1', temporada: '11', categoria: '20' } });

    expect(torneos).toHaveBeenLastCalledWith(11, 20);
    expect(selector('tour').value).toBe('1');
    expect(selector('temporada').value).toBe('11');
  });

  it('un tour sin temporada vigente abre la más nueva', async () => {
    await montar({ direccion: { tour: '2' } });

    expect(torneos).toHaveBeenLastCalledWith(21, null);
  });

  it('una temporada que no es de ese tour se ignora: abre la vigente', async () => {
    await montar({ direccion: { tour: '1', temporada: '21' } });

    expect(torneos).toHaveBeenLastCalledWith(12, null);
  });

  it('**cambiar el tour lo pone en la dirección** y suelta temporada y categoría', async () => {
    await elegir('tour', '2');

    expect(direccionPedida()).toMatchObject({
      queryParams: { tour: 2, temporada: null, categoria: null },
      queryParamsHandling: 'merge',
    });
  });

  it('cambiar la temporada la pone en la dirección, con su tour, y suelta la categoría', async () => {
    await elegir('temporada', '11');

    expect(direccionPedida()).toMatchObject({
      queryParams: { tour: 1, temporada: 11, categoria: null },
      queryParamsHandling: 'merge',
    });
  });

  it('**cambiar la categoría pone los tres en la dirección**: el enlace no depende de la vigente', async () => {
    // Con solo `?categoria=`, el enlace de hoy abriría otra temporada cuando cambie la
    // vigente.
    await elegir('categoria', '20');

    expect(direccionPedida()).toMatchObject({
      queryParams: { tour: 1, temporada: 12, categoria: 20 },
      queryParamsHandling: 'merge',
    });
  });

  it('un tour sin temporadas lo dice, sin selector de temporada', async () => {
    await montar({
      tours: [
        ...TOURS,
        { id: 3, nombre: 'Tour Juvenil', extracto: '', imagen: null, temporadaVigente: null },
      ],
      direccion: { tour: '3' },
    });

    expect(texto()).toContain('Este tour todavía no tiene temporadas.');
    expect(elemento().querySelector('select[name="temporada"]')).toBeNull();
    expect(torneos).not.toHaveBeenCalled();
  });

  it('si el tour no carga, lo dice', async () => {
    await montar({
      tours: [
        ...TOURS,
        { id: 9, nombre: 'Tour roto', extracto: '', imagen: null, temporadaVigente: null },
      ],
      direccion: { tour: '9' },
    });

    expect(texto()).toContain('No se pudo cargar el tour');
  });

  it('sin tours lo dice, en vez de quedar en blanco', async () => {
    await montar({ tours: [] });

    expect(texto()).toContain('Todavía no hay tours');
    expect(elemento().querySelector('app-tabla-de-tour')).toBeNull();
  });

  it('**la tabla del club no se le muestra a quien mira desde la calle**', () => {
    expect(texto()).not.toContain('Tabla del club');
  });

  it('**y sí a un socio**', async () => {
    await montar({ quien: SOCIA });

    expect(texto()).toContain('Tabla del club');
  });
});
