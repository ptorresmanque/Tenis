import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { elegir as elegirOpcion, textosDe } from '../../testing/elegir';
import { Tours } from '../../tours/tours.service';
import { Torneo, Torneos } from '../torneos.service';
import { TorneosPanel } from './torneos';

/**
 * T49. Los torneos del panel.
 *
 * Lo que este archivo cuida: que el alta pida su primer tour (T197), que la categoría
 * de torneo ya no esté (T199) y que el error de las fechas llegue con las palabras del
 * servidor, que es quien las compara entre sí.
 */
describe('TorneosPanel', () => {
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
    crearTorneo: ReturnType<typeof vi.fn>;
  };

  const montar = async (
    torneos: Torneo[] | Error,
    tours: { id: number; nombre: string; temporadas: number }[] = [
      { id: 1, nombre: 'Tour FEDAL', temporadas: 1 },
    ],
  ) => {
    api = {
      torneos: vi.fn(() =>
        torneos instanceof Error ? Promise.reject(torneos) : Promise.resolve(torneos),
      ),
      crearTorneo: vi.fn().mockResolvedValue(TORNEO),
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
    // Las listas son de Material (T248): se abren y se elige.
    if (elemento().querySelector(`mat-select[name="${campo}"]`)) {
      return elegirOpcion(fixture, `mat-select[name="${campo}"]`, valor);
    }
    const entrada = elemento().querySelector(
      `:is(input, textarea)[name="${campo}"]`,
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
    await montar([TORNEO]);
  });

  it('muestra el torneo con sus cuadros y sus fechas en palabras', () => {
    expect(texto()).toContain('Copa de verano');
    expect(texto()).toContain('4ª (16)');
    expect(texto()).toContain('diciembre');
  });

  it('**la categoría de torneo ya no está** (T199): ni la sección ni el valor de cada cuadro', () => {
    // Cuánto vale ganar lo dice el nivel con que el torneo entró a cada tour.
    expect(texto()).not.toContain('Agregar categoría');
    expect(texto()).not.toContain('al campeón');
    expect(elemento().querySelector('[name="nombreCategoria"]')).toBeNull();
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

    const opciones = textosDe(fixture, 'mat-select[name="nivelId"]');
    expect(opciones).toContain('2027 · 500');
  });

  it('**sin tours, dice dónde crearlos** en vez de ofrecer una lista vacía', async () => {
    await montar([TORNEO], []);
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


  it('sin torneos lo dice, en vez de quedar en blanco', async () => {
    await montar([]);

    expect(texto()).toContain('Todavía no hay torneos');
  });

  // `value()` de un resource lanza en estado de error aunque tenga `defaultValue`.
  it('si la API no responde, lo dice en vez de reventar', async () => {
    await montar(new Error('la API no respondió'));

    expect(texto()).toContain('No se pudieron cargar los torneos');
  });
});
