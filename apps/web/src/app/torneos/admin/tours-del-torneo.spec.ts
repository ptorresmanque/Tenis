import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';

import { elegir as elegirOpcion, textosDe } from '../../testing/elegir';
import { FichaDeTour, Tours } from '../../tours/tours.service';
import { Torneo, Torneos, TourDelTorneo } from '../torneos.service';
import { ToursDelTorneo } from './tours-del-torneo';

/**
 * T197. Para qué tours suma un torneo, en la pestaña Ajustes de su ficha.
 *
 * Lo que este archivo cuida: que **la última asociación no tenga botón de quitar** (el
 * servidor la rechaza, y un botón que siempre falla es peor que no tenerlo), que el
 * nivel del único tour se pueda cambiar, y que en un torneo terminado se avise que
 * tocar esto cambia el ranking.
 */
describe('ToursDelTorneo', () => {
  const FEDAL: TourDelTorneo = {
    tourId: 1,
    tour: 'Tour FEDAL',
    temporadaId: 12,
    temporada: '2027',
    nivelId: 5,
    nivel: '500',
  };

  const SENIOR: TourDelTorneo = {
    tourId: 2,
    tour: 'Tour Senior',
    temporadaId: 22,
    temporada: '2027',
    nivelId: 7,
    nivel: '250',
  };

  const tabla = {
    campeon: 500,
    finalista: 300,
    semifinal: 180,
    cuartos: 90,
    octavos: 0,
    dieciseisavos: 0,
    treintaidosavos: 0,
  };

  /** La ficha de un tour con una temporada y sus niveles, como la da el panel. */
  const ficha = (id: number, temporadaId: number, niveles: [number, string][]): FichaDeTour => ({
    id,
    nombre: id === 1 ? 'Tour FEDAL' : 'Tour Senior',
    descripcion: '',
    imagen: null,
    fotos: [],
    temporadas: [
      {
        id: temporadaId,
        nombre: '2027',
        fechaInicio: '2027-03-01',
        fechaFin: '2027-12-15',
        niveles: niveles.map(([nivelId, nombre]) => ({
          id: nivelId,
          nombre,
          tabla,
          torneos: 0,
          torneosTerminados: 0,
        })),
      },
    ],
  });

  let fixture: ComponentFixture<ToursDelTorneo>;
  let api: {
    agregarTour: ReturnType<typeof vi.fn>;
    cambiarNivelDelTour: ReturnType<typeof vi.fn>;
    quitarTour: ReturnType<typeof vi.fn>;
  };
  let cambiaron: Mock<() => void>;

  const montar = async (torneo: Pick<Torneo, 'id' | 'estado' | 'tours'>) => {
    api = {
      agregarTour: vi.fn().mockResolvedValue({}),
      cambiarNivelDelTour: vi.fn().mockResolvedValue({}),
      quitarTour: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Torneos, useValue: api },
        {
          provide: Tours,
          useValue: {
            listar: vi.fn().mockResolvedValue([
              { id: 1, nombre: 'Tour FEDAL', temporadas: 1 },
              { id: 2, nombre: 'Tour Senior', temporadas: 1 },
            ]),
            ficha: vi.fn((id: number) =>
              Promise.resolve(
                id === 1
                  ? ficha(1, 12, [
                      [5, '500'],
                      [6, '250'],
                    ])
                  : ficha(2, 22, [[7, '250']]),
              ),
            ),
          },
        },
      ],
    });

    fixture = TestBed.createComponent(ToursDelTorneo);
    fixture.componentRef.setInput('torneo', torneo);
    cambiaron = vi.fn<() => void>();
    fixture.componentInstance.cambiaron.subscribe(cambiaron);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const texto = () => (elemento().textContent ?? '').replace(/\s+/g, ' ');

  const elegir = async (campo: 'tourId' | 'nivelId', valor: string) => {
    await elegirOpcion(fixture, `mat-select[name="${campo}"]`, valor);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const boton = (etiqueta: string) =>
    Array.from(elemento().querySelectorAll('button')).find((b) =>
      b.textContent?.trim().startsWith(etiqueta),
    );

  const apretar = async (etiqueta: string) => {
    boton(etiqueta)?.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await montar({ id: 5, estado: 'INSCRIPCION', tours: [FEDAL] });
  });

  it('dice para qué tours suma, con su temporada y su nivel', () => {
    expect(texto()).toContain('Tour FEDAL');
    expect(texto()).toContain('2027 · 500');
  });

  it('**la última no tiene botón de quitar**: el servidor la rechazaría', () => {
    expect(boton('Quitar')).toBeUndefined();
  });

  it('**agrega un segundo tour** con el nivel elegido, y avisa que cambió', async () => {
    await elegir('tourId', '2');
    await elegir('nivelId', '7');

    await apretar('Agregar el tour');

    expect(api.agregarTour).toHaveBeenCalledWith(5, { tourId: 2, nivelId: 7 });
    expect(cambiaron).toHaveBeenCalled();
  });

  it('los niveles se leen con su temporada: «2027 · 250»', async () => {
    await elegir('tourId', '1');

    const opciones = textosDe(fixture, 'mat-select[name="nivelId"]');
    expect(opciones).toContain('2027 · 500');
    expect(opciones).toContain('2027 · 250');
  });

  it('**sin nivel elegido no deja guardar**', async () => {
    await elegir('tourId', '2');

    expect(boton('Agregar el tour')?.disabled).toBe(true);
  });

  it('**elegir un tour que ya suma cambia su nivel**, también el del único', async () => {
    await elegir('tourId', '1');
    await elegir('nivelId', '6');

    await apretar('Cambiar el nivel');

    expect(api.cambiarNivelDelTour).toHaveBeenCalledWith(5, 1, 6);
    expect(api.agregarTour).not.toHaveBeenCalled();
  });

  it('**con dos, cada uno se puede quitar**', async () => {
    await montar({ id: 5, estado: 'INSCRIPCION', tours: [FEDAL, SENIOR] });

    const quitar = elemento().querySelector<HTMLButtonElement>(
      'button[aria-label="Quitar Tour FEDAL"]',
    )!;
    quitar.click();
    await fixture.whenStable();

    expect(api.quitarTour).toHaveBeenCalledWith(5, 1);
    expect(cambiaron).toHaveBeenCalled();
  });

  it('**en un torneo terminado avisa que cambia el ranking**', async () => {
    await montar({ id: 5, estado: 'FINALIZADO', tours: [FEDAL] });

    expect(texto()).toContain('cambia el ranking');
  });

  it('**si los niveles del tour no cargan, lo dice** en vez de dejar la lista muda', async () => {
    (TestBed.inject(Tours).ficha as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('caída'),
    );

    await elegir('tourId', '2');

    expect(texto()).toContain('No se pudieron cargar los niveles');
  });

  it('el error del servidor se muestra tal cual', async () => {
    api.agregarTour.mockRejectedValue({
      error: { message: 'El torneo ya suma para ese tour.' },
    });
    await elegir('tourId', '2');
    await elegir('nivelId', '7');

    await apretar('Agregar el tour');

    expect(texto()).toContain('El torneo ya suma para ese tour.');
    expect(cambiaron).not.toHaveBeenCalled();
  });
});
