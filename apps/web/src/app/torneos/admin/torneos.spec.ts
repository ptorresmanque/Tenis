import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { elegir as elegirOpcion, textosDe } from '../../testing/elegir';
import { Tours } from '../../tours/tours.service';
import { Torneo, Torneos } from '../torneos.service';
import { TorneosPanel } from './torneos';
import { avisoDeLoHecho } from '../../testing/snackbar';
import { textoDelDialogo } from '../../testing/dialogos';

/**
 * T49. Los torneos del panel.
 *
 * Lo que este archivo cuida: que el alta pida su primer tour (T197), que la categoría
 * de torneo ya no esté (T199) y que el error de las fechas llegue con las palabras del
 * servidor, que es quien las compara entre sí.
 *
 * Desde T291 el alta es un diálogo que abre el FAB «Nuevo torneo», y al crear lleva a la ficha.
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
  /** El diálogo de alta, si está abierto: Material lo dibuja fuera del componente. */
  const dialogo = () => document.querySelector<HTMLElement>('mat-dialog-container');
  const donde = () => dialogo() ?? elemento();

  const escribir = async (campo: string, valor: string) => {
    // Las listas son de Material (T248): se abren y se elige.
    if (donde().querySelector(`mat-select[name="${campo}"]`)) {
      return elegirOpcion(fixture, `mat-select[name="${campo}"]`, valor);
    }
    // NgForm conecta el campo un microtask después de crearlo: antes, escribir no llega.
    await Promise.resolve();
    const entrada = donde().querySelector(
      `:is(input, textarea)[name="${campo}"]`,
    ) as HTMLInputElement;
    entrada.value = valor;
    entrada.dispatchEvent(new Event('input'));
    entrada.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const apretar = async (etiqueta: string) => {
    Array.from(donde().querySelectorAll('button'))
      .find((b) => b.textContent?.trim().startsWith(etiqueta))
      ?.click();
    // Dos vueltas: el diálogo responde, y después la lista sigue con lo que esperaba.
    for (let i = 0; i < 2; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
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
   * El formulario no está en la página: crear un torneo es lo raro, mirarlos es lo diario.
   * Antes ocupaba media pantalla debajo de la lista, siempre; desde T291 lo abre el FAB.
   */
  const abrirElFormulario = async () => {
    elemento().querySelector<HTMLButtonElement>('.mat-mdc-fab-base')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  it('**«Nuevo torneo» es el único FAB, y la cabecera ya no tiene acción** (T291)', () => {
    const fabs = elemento().querySelectorAll('.mat-mdc-fab-base');

    expect(fabs.length).toBe(1);
    expect(fabs[0].textContent).toContain('Nuevo torneo');
    expect(fabs[0].classList).toContain('mdc-fab--extended');
    expect(elemento().querySelector('.cabecera-panel')?.querySelectorAll('button, a').length).toBe(
      0,
    );
    // Espacio al final para que el FAB no tape la última tarjeta (A9).
    expect(elemento().classList).toContain('pb-24');
  });

  it('el formulario de alta ya no está en la página: lo abre el FAB, en un diálogo', async () => {
    expect(elemento().querySelector('form')).toBeNull();

    await abrirElFormulario();

    expect(dialogo()?.querySelector('[mat-dialog-title]')?.textContent).toContain(
      'Nuevo torneo',
    );
  });

  /** El tour y su nivel (T197): sin ellos el formulario no deja crear. */
  const elegirTour = async () => {
    await escribir('tourId', '1');
    await escribir('nivelId', '5');
  };

  const botonDeCrear = () =>
    donde().querySelector<HTMLButtonElement>('form button[type="submit"]')!;

  it('crear un torneo manda las tres fechas juntas, y su tour con el nivel; **y lleva a su ficha**', async () => {
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
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
    // Nace sin categorías, y el aviso dice qué falta para inscribir a alguien. Eso se hace en
    // su ficha, que es adonde lleva (T291).
    expect(textoDelDialogo()).toBe('');
    expect(navegar).toHaveBeenCalledWith(['/administracion/torneos', 5]);
    expect(avisoDeLoHecho()).toContain('agrégale las categorías');
  });

  it('mientras crea no se puede cerrar: el torneo quedaría creado sin llevar a su ficha', async () => {
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    let responder!: (torneo: Torneo) => void;
    api.crearTorneo.mockReturnValue(new Promise((listo) => (responder = listo)));
    await abrirElFormulario();
    await elegirTour();
    botonDeCrear().click();
    await fixture.whenStable();

    const cancelar = [...donde().querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Cancelar',
    )!;
    expect(cancelar.disabled).toBe(true);
    // Con un clic en el fondo, que es como se descarta el diálogo sin botón.
    document.querySelector<HTMLElement>('.cdk-overlay-backdrop')!.click();
    await fixture.whenStable();
    expect(dialogo()).not.toBeNull();

    responder(TORNEO);
    // Lo que sigue al cierre espera a que el diálogo termine de irse.
    await vi.waitFor(() => expect(avisoDeLoHecho()).toContain('agrégale las categorías'));
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

    expect(textoDelDialogo()).toContain('Todavía no hay tours');
    expect(
      donde().querySelector('form a[href="/administracion/tours"]'),
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

    // En el diálogo, que sigue abierto con lo escrito.
    expect(textoDelDialogo()).toContain('no puede terminar antes de empezar');
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
