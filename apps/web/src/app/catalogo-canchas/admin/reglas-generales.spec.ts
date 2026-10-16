import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { AdminCanchas, HorasSinTarifa } from './admin-canchas.service';
import { ParteDeLasReglas, ReglasGeneralesPanel } from './reglas-generales';

/**
 * T31. El horario y las tarifas que rigen donde la cancha no dice otra cosa.
 *
 * Lo que hay que probar acá no son los editores —tienen su propio spec— sino que
 * **se les pase el club y no una cancha**: el ámbito sin id es lo que hace que la
 * escritura vaya a las filas con `cancha_id` nulo.
 *
 * Desde T288 son dos pestañas de Canchas, Horario y Tarifas: la misma pantalla con una parte
 * cada una, que le llega de la ruta.
 */
describe('ReglasGeneralesPanel', () => {
  let fixture: ComponentFixture<ReglasGeneralesPanel>;
  let api: {
    general: ReturnType<typeof vi.fn>;
    fijarHorarios: ReturnType<typeof vi.fn>;
    crearFranja: ReturnType<typeof vi.fn>;
    borrarFranja: ReturnType<typeof vi.fn>;
  };
  let alarma: { recargar: ReturnType<typeof vi.fn> };

  const DEL_CLUB = {
    horarios: [
      { id: 1, diaSemana: 1, horaApertura: '08:00', horaCierre: '22:00' },
    ],
    franjas: [
      {
        id: 5,
        canchaId: null,
        techada: null,
        diaSemana: null,
        horaDesde: '08:00',
        horaHasta: '18:00',
        esPico: false,
        montoClp: 12000,
        montoClp90: null,
      },
    ],
  };

  const montar = async (
    parte: ParteDeLasReglas,
    reglas: typeof DEL_CLUB | Error = DEL_CLUB,
  ) => {
    api = {
      general: vi.fn(() =>
        reglas instanceof Error ? Promise.reject(reglas) : Promise.resolve(reglas),
      ),
      fijarHorarios: vi.fn().mockResolvedValue([]),
      crearFranja: vi.fn().mockResolvedValue({}),
      borrarFranja: vi.fn().mockResolvedValue(undefined),
    };
    alarma = { recargar: vi.fn() };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AdminCanchas, useValue: api },
        { provide: HorasSinTarifa, useValue: alarma },
      ],
    });

    fixture = TestBed.createComponent(ReglasGeneralesPanel);
    fixture.componentRef.setInput('parte', parte);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  const apretar = async (etiqueta: string) => {
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    )
      .find((b) => b.textContent?.trim() === etiqueta)
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  it('**la pestaña Horario trae solo el horario del club**', async () => {
    await montar('horario');

    expect(texto()).toContain('El horario de apertura de todo el club');
    expect(texto()).not.toContain('$12.000');
  });

  it('**la pestaña Tarifas trae solo las tarifas del club**', async () => {
    await montar('tarifas');

    expect(texto()).toContain('Las tarifas de todo el club');
    expect(texto()).toContain('$12.000');
    expect(texto()).not.toContain('Guardar horario');
  });

  it('sin tarifas generales no se manda a mirar las generales', async () => {
    // El texto del editor por cancha —"valen las generales del club"— acá sería la
    // pantalla mandándose a sí misma a otro lado. Estas *son* las generales.
    await montar('tarifas', { horarios: [], franjas: [] });

    expect(texto()).not.toContain('valen las generales');
    expect(texto()).toContain('sale en $0');
  });

  it('guarda el horario del club, no el de una cancha', async () => {
    await montar('horario');
    await apretar('Guardar horario');

    // `null` es el club: son las filas con `cancha_id` nulo. Con un id acá, el
    // panel estaría pisando el horario de la cancha número lo-que-sea.
    expect(api.fijarHorarios).toHaveBeenCalledWith(null, expect.any(Array));
  });

  it('la tarifa nueva también es del club', async () => {
    await montar('tarifas');
    await apretar('Agregar tarifa');

    expect(api.crearFranja).toHaveBeenCalledWith(
      expect.objectContaining({ canchaId: null }),
    );
  });

  it('**guardar el horario o una tarifa relee la alarma de arriba**', async () => {
    // Cambiar lo general cambia qué horas quedan sin tarifa en cada cancha, y esa
    // alarma va en la pantalla de Canchas, arriba de las pestañas (T288).
    await montar('horario');
    await apretar('Guardar horario');
    expect(alarma.recargar).toHaveBeenCalledTimes(1);

    await montar('tarifas');
    await apretar('Agregar tarifa');
    expect(alarma.recargar).toHaveBeenCalledTimes(1);
  });

  // `value()` de un resource lanza en estado de error aunque tenga `defaultValue`.
  it('si lo general no carga, lo dice', async () => {
    await montar('horario', new Error('la API no respondió'));
    expect(texto()).toContain('No se pudo cargar el horario del club');

    await montar('tarifas', new Error('la API no respondió'));
    expect(texto()).toContain('No se pudieron cargar las tarifas del club');
  });
});
