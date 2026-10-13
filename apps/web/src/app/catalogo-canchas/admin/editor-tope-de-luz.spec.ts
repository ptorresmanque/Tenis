import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminCanchas, ExcesoDeLuz } from './admin-canchas.service';
import { EditorTopeDeLuz } from './editor-tope-de-luz';

/**
 * T208. El tope de canchas con luz en Reglas: encenderlo, cuántas canchas y desde qué
 * hora, y las horas ya tomadas que lo superan, para que el club llame.
 */
describe('EditorTopeDeLuz', () => {
  const EXCESO: ExcesoDeLuz = {
    // Miércoles 14 de octubre de 2026, de 20:00 a 21:00 en el club (UTC-3).
    desde: '2026-10-14T23:00:00.000Z',
    hasta: '2026-10-15T00:00:00.000Z',
    ocupaciones: [
      { cancha: 'Cancha 1', detalle: 'Reserva ABC1234 de Camila Soto' },
      { cancha: 'Cancha 2', detalle: 'Clase — Pedro Rojas' },
      { cancha: 'Cancha 3', detalle: 'Reserva XYZ9876 de Beto Díaz' },
    ],
  };

  let fixture: ComponentFixture<EditorTopeDeLuz>;
  let api: {
    configuracion: ReturnType<typeof vi.fn>;
    fijarConfiguracion: ReturnType<typeof vi.fn>;
    excesosDeLuz: ReturnType<typeof vi.fn>;
  };

  const montar = async (
    tope: number | null = 2,
    excesos: ExcesoDeLuz[] = [],
  ) => {
    api = {
      configuracion: vi.fn().mockResolvedValue({
        topeCanchasConLuz: tope,
        topeCanchasConLuzDesde: '19:00',
      }),
      fijarConfiguracion: vi.fn().mockResolvedValue({}),
      excesosDeLuz: vi.fn().mockResolvedValue(excesos),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: AdminCanchas, useValue: api }],
    });

    fixture = TestBed.createComponent(EditorTopeDeLuz);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const raiz = () => fixture.nativeElement as HTMLElement;
  const texto = () => raiz().textContent?.replace(/\s+/g, ' ') ?? '';
  const casilla = () =>
    raiz().querySelector<HTMLInputElement>('input[name="limitarLuz"]')!;
  const numero = () =>
    raiz().querySelector<HTMLInputElement>('input[name="topeCanchasConLuz"]');

  const guardar = async () => {
    raiz().querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await montar();
  });

  it('muestra el tope que rige: encendido, 2 canchas desde las 19:00', () => {
    expect(casilla().checked).toBe(true);
    expect(numero()?.value).toBe('2');
    expect(
      raiz().querySelector<HTMLInputElement>('#tope-de-luz-desde')?.value,
    ).toBe('19:00');
  });

  it('sin horas por encima del tope, lo dice', () => {
    expect(texto()).toContain('Ninguna hora tomada supera el tope.');
  });

  it('lista las horas tomadas que lo superan, con qué ocupa cada cancha', async () => {
    await montar(2, [EXCESO]);

    expect(texto()).toContain('miércoles, 14 de octubre, de 20:00 a 21:00');
    expect(texto()).toContain('Cancha 1: Reserva ABC1234 de Camila Soto');
    expect(texto()).toContain('Cancha 2: Clase — Pedro Rojas');
  });

  it('apagado, no pide el número y guarda nulo', async () => {
    casilla().click();
    fixture.detectChanges();

    expect(numero()).toBeNull();

    await guardar();

    expect(api.fijarConfiguracion).toHaveBeenCalledWith({
      topeCanchasConLuz: null,
      topeCanchasConLuzDesde: '19:00',
    });
  });

  it('guarda el número elegido y vuelve a pedir la lista', async () => {
    const campo = numero()!;
    campo.value = '3';
    campo.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    await guardar();

    expect(api.fijarConfiguracion).toHaveBeenCalledWith({
      topeCanchasConLuz: 3,
      topeCanchasConLuzDesde: '19:00',
    });
    expect(api.excesosDeLuz).toHaveBeenCalledTimes(2);
  });

  it('un tope vacío no se manda: lo dice antes', async () => {
    const campo = numero()!;
    campo.value = '';
    campo.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    await guardar();

    expect(api.fijarConfiguracion).not.toHaveBeenCalled();
    expect(texto()).toContain('El tope tiene que ser de 1 cancha o más.');
  });
});
