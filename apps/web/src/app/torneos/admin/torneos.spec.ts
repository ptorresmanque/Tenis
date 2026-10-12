import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Tours } from '../../tours/tours.service';
import { CategoriaTorneo, Torneo, Torneos } from '../torneos.service';
import { TorneosPanel } from './torneos';

/**
 * T49. Los torneos y sus categorías.
 *
 * Lo que este archivo cuida: que **una categoría desactivada no se ofrezca** para un
 * torneo nuevo —es una que el club dejó de usar— y que el error de las fechas llegue
 * con las palabras del servidor, que es quien las compara entre sí.
 */
describe('TorneosPanel', () => {
  const CLUB_250: CategoriaTorneo = {
    id: 1,
    nombre: 'Club 250',
    puntosCampeon: 250,
    activa: true,
  };

  const VIEJA: CategoriaTorneo = {
    id: 2,
    nombre: 'Copa antigua',
    puntosCampeon: 100,
    activa: false,
  };

  const TORNEO: Torneo = {
    id: 5,
    nombre: 'Copa de verano',
    superficie: 'ARCILLA',
    fechaInicio: '2026-12-01',
    fechaFin: '2026-12-07',
    cierreInscripcion: '2026-11-25',
    cuadros: [
      {
        id: 7,
        categoria: '4ª',
        cupo: 16,
        categoriaId: 3,
        valor: 'Club 250',
        puntosCampeon: 250,
      },
    ],
    estado: 'INSCRIPCION',
    pagosPorRevisar: 0,
    enEspera: 0,
    tours: [],
  };

  let fixture: ComponentFixture<TorneosPanel>;
  let api: {
    torneos: ReturnType<typeof vi.fn>;
    categorias: ReturnType<typeof vi.fn>;
    crearTorneo: ReturnType<typeof vi.fn>;
    crearCategoria: ReturnType<typeof vi.fn>;
    editarCategoria: ReturnType<typeof vi.fn>;
  };

  const montar = async (
    torneos: Torneo[] | Error,
    categorias: CategoriaTorneo[] | Error,
    tours: { id: number; nombre: string; temporadas: number }[] = [
      { id: 1, nombre: 'Tour FEDAL', temporadas: 1 },
    ],
  ) => {
    api = {
      torneos: vi.fn(() =>
        torneos instanceof Error ? Promise.reject(torneos) : Promise.resolve(torneos),
      ),
      categorias: vi.fn(() =>
        categorias instanceof Error ? Promise.reject(categorias) : Promise.resolve(categorias),
      ),
      crearTorneo: vi.fn().mockResolvedValue(TORNEO),
      crearCategoria: vi.fn().mockResolvedValue(CLUB_250),
      editarCategoria: vi.fn().mockResolvedValue(CLUB_250),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Torneos, useValue: api },
        {
          provide: Tours,
          useValue: {
            listar: vi.fn().mockResolvedValue(tours),
            ficha: vi.fn().mockResolvedValue({
              id: 1,
              nombre: 'Tour FEDAL',
              descripcion: '',
              imagen: null,
              fotos: [],
              temporadas: [
                {
                  id: 12,
                  nombre: '2027',
                  fechaInicio: '2027-03-01',
                  fechaFin: '2027-12-15',
                  niveles: [
                    {
                      id: 5,
                      nombre: '500',
                      tabla: {
                        campeon: 500,
                        finalista: 300,
                        semifinal: 180,
                        cuartos: 90,
                        octavos: 0,
                        dieciseisavos: 0,
                        treintaidosavos: 0,
                      },
                      torneos: 0,
                      torneosTerminados: 0,
                    },
                  ],
                },
              ],
            }),
          },
        },
      ],
    });

    fixture = TestBed.createComponent(TorneosPanel);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const texto = () => elemento().textContent ?? '';

  const escribir = async (campo: string, valor: string) => {
    // `:is(...)`: el `name` también queda en el `app-campo-fecha` que envuelve al campo.
    const entrada = elemento().querySelector(
      `:is(input, select, textarea)[name="${campo}"]`,
    ) as HTMLInputElement;
    entrada.value = valor;
    entrada.dispatchEvent(new Event('input'));
    entrada.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const apretar = async (etiqueta: string) => {
    Array.from(elemento().querySelectorAll('button'))
      .find((b) => b.textContent?.trim().startsWith(etiqueta))
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await montar([TORNEO], [CLUB_250, VIEJA]);
  });

  it('muestra el torneo con su categoría y sus fechas en palabras', () => {
    expect(texto()).toContain('Copa de verano');
    expect(texto()).toContain('Club 250');
    expect(texto()).toContain('diciembre');
  });

  it('dice cuántos puntos se lleva el campeón, que es de lo que vive el ranking', () => {
    expect(texto()).toContain('250 puntos');
  });

  it('la categoría desactivada sigue en la lista, para poder reactivarla', async () => {
    expect(texto()).toContain('Copa antigua');

    await apretar('Reactivar');

    expect(api.editarCategoria).toHaveBeenCalledWith(2, { activa: true });
  });

  /**
   * El formulario nace cerrado: crear un torneo es lo raro, mirarlos es lo diario.
   * Antes ocupaba media pantalla debajo de la lista, siempre.
   */
  const abrirElFormulario = () => apretar('Crear torneo');

  /** El tour y su nivel (T197): sin ellos el formulario no deja crear. */
  const elegirTour = async () => {
    await escribir('tourId', '1');
    await escribir('nivelId', '5');
  };

  const botonDeCrear = () =>
    elemento().querySelector<HTMLButtonElement>('form button[type="submit"]')!;

  it('crear un torneo manda las tres fechas juntas, y su tour con el nivel', async () => {
    await abrirElFormulario();
    await escribir('nombre', 'Copa de invierno');
    await escribir('fechaInicio', '2026-07-01');
    await escribir('fechaFin', '2026-07-05');
    await escribir('cierreInscripcion', '2026-06-25');
    await elegirTour();

    await apretar('Crear torneo');

    expect(api.crearTorneo).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: 'Copa de invierno',
        fechaInicio: '2026-07-01',
        fechaFin: '2026-07-05',
        cierreInscripcion: '2026-06-25',
        tours: [{ tourId: 1, nivelId: 5 }],
      }),
    );
  });

  it('**sin tour y nivel el formulario no deja crear** (D10)', async () => {
    await abrirElFormulario();
    await escribir('nombre', 'Copa de invierno');

    expect(botonDeCrear().disabled).toBe(true);

    await escribir('tourId', '1');
    expect(botonDeCrear().disabled).toBe(true);

    await escribir('nivelId', '5');
    expect(botonDeCrear().disabled).toBe(false);
  });

  it('el nivel se lee con su temporada: «2027 · 500»', async () => {
    await abrirElFormulario();
    await escribir('tourId', '1');

    const opciones = Array.from(
      elemento().querySelectorAll('select[name="nivelId"] option'),
    ).map((o) => o.textContent?.trim());
    expect(opciones).toContain('2027 · 500');
  });

  it('**sin tours, dice dónde crearlos** en vez de ofrecer una lista vacía', async () => {
    await montar([TORNEO], [CLUB_250], []);
    await abrirElFormulario();

    expect(texto()).toContain('Todavía no hay tours');
    expect(
      elemento().querySelector('form a[href="/administracion/tours"]'),
    ).not.toBeNull();
  });

  it('**si las fechas no cierran, lo dice el servidor y se muestra tal cual**', async () => {
    // La comparación entre las tres fechas vive en el servidor: es la misma regla
    // para el panel y para cualquier otra cosa que cree torneos.
    api.crearTorneo.mockRejectedValue({
      error: { message: 'El torneo no puede terminar antes de empezar.' },
    });
    await abrirElFormulario();
    await elegirTour();

    await apretar('Crear torneo');

    expect(texto()).toContain('no puede terminar antes de empezar');
  });

  it('**el torneo nace sin valor: lo pone cada cuadro** (T70)', async () => {
    // Ganar Honor puede valer el doble que ganar la 5ª el mismo fin de semana, así
    // que el formulario del torneo ya no elige categoría: la elige cada cuadro.
    await abrirElFormulario();

    expect(elemento().querySelector('select[name="categoriaId"]')).toBeNull();
  });

  it('agregar una categoría manda su nombre y sus puntos', async () => {
    await escribir('nombreCategoria', 'Máster de fin de año');
    await escribir('puntosCampeon', '1000');

    await apretar('Agregar categoría');

    expect(api.crearCategoria).toHaveBeenCalledWith({
      nombre: 'Máster de fin de año',
      puntosCampeon: 1000,
    });
  });

  it('sin torneos lo dice, en vez de quedar en blanco', async () => {
    await montar([], [CLUB_250]);

    expect(texto()).toContain('Todavía no hay torneos');
  });

  // `value()` de un resource lanza en estado de error aunque tenga `defaultValue`.
  it('si la API no responde, lo dice en vez de reventar', async () => {
    await montar(new Error('la API no respondió'), new Error('la API no respondió'));

    expect(texto()).toContain('No se pudieron cargar los torneos');
    expect(texto()).toContain('No se pudieron cargar las categorías');
  });
});
