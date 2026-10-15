import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AdminCanchas,
  ConfiguracionDelClub,
} from '../catalogo-canchas/admin/admin-canchas.service';
import { elegidoEn, elegir, opcionesDe } from '../testing/elegir';
import { avisoDeLoHecho } from '../testing/snackbar';
import { InformeDiario } from './informe-diario';

/**
 * T274. La pestaña del informe diario de reservas: si sale y a qué hora (SPEC-revision-qa.md,
 * A9). Guarda al tocar, como los interruptores de Usuarios (T249).
 */
describe('InformeDiario', () => {
  let fixture: ComponentFixture<InformeDiario>;
  let fijarConfiguracion: ReturnType<typeof vi.fn>;

  const montar = async (configuracion: Partial<ConfiguracionDelClub> | Error) => {
    fijarConfiguracion = vi.fn((cambios: Partial<ConfiguracionDelClub>) =>
      Promise.resolve({ informeDiarioActivo: true, informeDiarioHora: 7, ...cambios }),
    );
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AdminCanchas,
          useValue: {
            configuracion: vi.fn(() =>
              configuracion instanceof Error
                ? Promise.reject(configuracion)
                : Promise.resolve(configuracion),
            ),
            fijarConfiguracion,
          },
        },
      ],
    });
    fixture = TestBed.createComponent(InformeDiario);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const interruptor = () =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'mat-slide-toggle button',
    )!;

  beforeEach(async () => {
    await montar({ informeDiarioActivo: true, informeDiarioHora: 7 });
  });

  it('muestra lo que rige: activo, a las 07:00, y a quién le llega', () => {
    expect(interruptor().getAttribute('aria-checked')).toBe('true');
    expect(elegidoEn(fixture, 'mat-select[name="hora"]')).toBe('7');
    expect(texto()).toContain('administradores y gestores');
  });

  it('**apagarlo guarda al tiro y lo confirma**', async () => {
    interruptor().click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fijarConfiguracion).toHaveBeenCalledWith({ informeDiarioActivo: false });
    expect(avisoDeLoHecho()).toContain('ya no sale');
  });

  it('**elegir la hora la guarda y lo confirma**', async () => {
    await elegir(fixture, 'mat-select[name="hora"]', 21);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fijarConfiguracion).toHaveBeenCalledWith({ informeDiarioHora: 21 });
    expect(avisoDeLoHecho()).toContain('21:00');
  });

  it('apagado, cambiar la hora la guarda y lo dice como es', async () => {
    await montar({ informeDiarioActivo: false, informeDiarioHora: 7 });
    fijarConfiguracion.mockResolvedValue({ informeDiarioActivo: false, informeDiarioHora: 9 });

    await elegir(fixture, 'mat-select[name="hora"]', 9);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(avisoDeLoHecho()).toContain('cuando lo actives, saldrá a las 09:00');
  });

  it('ofrece las 24 horas del día, en punto', () => {
    const horas = opcionesDe(fixture, 'mat-select[name="hora"]').map((opcion) => opcion.texto);

    expect(horas).toHaveLength(24);
    expect(horas[0]).toBe('00:00');
    expect(horas[23]).toBe('23:00');
  });

  it('si no carga, lo dice en vez de mostrar un formulario vacío', async () => {
    await montar(new Error('la API no respondió'));

    expect(texto()).toContain('No se pudo cargar');
    expect((fixture.nativeElement as HTMLElement).querySelector('mat-slide-toggle')).toBeNull();
  });
});
