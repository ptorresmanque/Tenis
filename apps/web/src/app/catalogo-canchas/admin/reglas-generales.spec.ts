import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminCanchas } from './admin-canchas.service';
import { ReglasGeneralesPanel } from './reglas-generales';

/**
 * T31. El horario y las tarifas que rigen donde la cancha no dice otra cosa.
 *
 * Lo que hay que probar acá no son los editores —tienen su propio spec— sino que
 * **se les pase el club y no una cancha**: el ámbito sin id es lo que hace que la
 * escritura vaya a las filas con `cancha_id` nulo.
 */
describe('ReglasGeneralesPanel', () => {
  let fixture: ComponentFixture<ReglasGeneralesPanel>;
  let api: {
    general: ReturnType<typeof vi.fn>;
    fijarHorarios: ReturnType<typeof vi.fn>;
    crearFranja: ReturnType<typeof vi.fn>;
    borrarFranja: ReturnType<typeof vi.fn>;
  };

  const DEL_CLUB = {
    horarios: [
      { id: 1, diaSemana: 1, horaApertura: '08:00', horaCierre: '22:00' },
    ],
    franjas: [
      {
        id: 5,
        canchaId: null,
        diaSemana: null,
        horaDesde: '08:00',
        horaHasta: '18:00',
        esPico: false,
        montoClp: 12000,
      },
    ],
  };

  const montar = async (reglas: typeof DEL_CLUB | Error = DEL_CLUB) => {
    api = {
      general: vi.fn(() =>
        reglas instanceof Error ? Promise.reject(reglas) : Promise.resolve(reglas),
      ),
      fijarHorarios: vi.fn().mockResolvedValue([]),
      crearFranja: vi.fn().mockResolvedValue({}),
      borrarFranja: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: AdminCanchas, useValue: api }],
    });

    fixture = TestBed.createComponent(ReglasGeneralesPanel);
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

  beforeEach(async () => {
    await montar();
  });

  it('muestra lo que hoy rige en el club', () => {
    expect(texto()).toContain('Horario y tarifas generales');
    expect(texto()).toContain('$12.000');
  });

  it('sin tarifas generales no se manda a mirar las generales', async () => {
    // El texto del editor por cancha —"valen las generales del club"— acá sería la
    // pantalla mandándose a sí misma a otro lado. Estas *son* las generales.
    await montar({ horarios: [], franjas: [] });

    expect(texto()).not.toContain('valen las generales');
    expect(texto()).toContain('sale en $0');
  });

  it('guarda el horario del club, no el de una cancha', async () => {
    await apretar('Guardar horario');

    // `null` es el club: son las filas con `cancha_id` nulo. Con un id acá, el
    // panel estaría pisando el horario de la cancha número lo-que-sea.
    expect(api.fijarHorarios).toHaveBeenCalledWith(null, expect.any(Array));
  });

  it('la tarifa nueva también es del club', async () => {
    await apretar('Agregar tarifa');

    expect(api.crearFranja).toHaveBeenCalledWith(
      expect.objectContaining({ canchaId: null }),
    );
  });

  it('avisa hacia afuera al cambiar algo', async () => {
    // Cambiar lo general cambia qué horas quedan sin tarifa en cada cancha, y esa
    // advertencia la calcula el panel de arriba.
    const avisado = vi.fn();
    fixture.componentRef.instance.cambiado.subscribe(avisado);

    await apretar('Guardar horario');

    expect(avisado).toHaveBeenCalled();
  });

  // `value()` de un resource lanza en estado de error aunque tenga `defaultValue`.
  it('si lo general no carga, lo dice', async () => {
    await montar(new Error('la API no respondió'));

    expect(texto()).toContain('No se pudieron cargar el horario y las tarifas generales');
  });
});
