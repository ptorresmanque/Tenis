import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PagoPendiente, Torneos } from '../torneos.service';
import { PagosPendientes } from './pagos-pendientes';

/**
 * T66. La bandeja de pagos de inscripción.
 *
 * Lo que este archivo cuida: que **rechazar no se pueda apretar sin motivo** —es lo que
 * el club le va a decir por teléfono a alguien a quien acaba de dejar fuera del
 * torneo— y que la pantalla diga que rechazar libera el cupo, porque no es evidente.
 */
describe('PagosPendientes', () => {
  const CON_COMPROBANTE: PagoPendiente = {
    id: 11,
    jugador: 'Rodrigo Soto',
    telefono: '56987654321',
    torneoId: 5,
    torneo: 'Copa de verano',
    categoria: '4ª',
    montoClp: 15000,
    tieneComprobante: true,
    inscritaEn: '2026-11-01T12:00:00.000Z',
  };

  let fixture: ComponentFixture<PagosPendientes>;
  let api: {
    pagosPendientes: ReturnType<typeof vi.fn>;
    aprobarPago: ReturnType<typeof vi.fn>;
    rechazarPago: ReturnType<typeof vi.fn>;
  };

  const montar = async (pagos: PagoPendiente[]) => {
    api = {
      pagosPendientes: vi.fn().mockResolvedValue(pagos),
      aprobarPago: vi.fn().mockResolvedValue({ id: 11 }),
      rechazarPago: vi.fn().mockResolvedValue({ id: 11 }),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: Torneos, useValue: api }],
    });

    fixture = TestBed.createComponent(PagosPendientes);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const texto = () => elemento().textContent ?? '';

  const apretar = async (etiqueta: string) => {
    Array.from(elemento().querySelectorAll('button'))
      .find((b) => b.textContent?.trim().startsWith(etiqueta))
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await montar([CON_COMPROBANTE]);
  });

  it('muestra a quién llamar si el comprobante no cuadra', () => {
    expect(texto()).toContain('56987654321');
  });

  it('**dice que rechazar libera el cupo**, que no es evidente', () => {
    expect(texto()).toContain('libera su cupo');
  });

  it('el comprobante se abre desde el servidor, detrás del guard de admin', () => {
    const enlace = elemento().querySelector<HTMLAnchorElement>('a[target="_blank"]');

    expect(enlace?.getAttribute('href')).toBe(
      '/api/admin/inscripciones/11/comprobante',
    );
  });

  it('quien todavía no subió nada se distingue del que sí', async () => {
    await montar([{ ...CON_COMPROBANTE, tieneComprobante: false }]);

    expect(texto()).toContain('Sin comprobante todavía');
  });

  it('confirmar el pago lo manda al servidor', async () => {
    await apretar('Confirmar');

    expect(api.aprobarPago).toHaveBeenCalledWith(11);
  });

  it('**rechazar sin motivo no llega al servidor**', async () => {
    await apretar('Rechazar');

    expect(api.rechazarPago).not.toHaveBeenCalled();
    expect(texto()).toContain('Escribe por qué');
  });

  it('rechazar con motivo lo manda tal cual', async () => {
    const campo = elemento().querySelector<HTMLInputElement>(
      'input[name="motivo-11"]',
    )!;
    campo.value = 'El monto no cuadra';
    campo.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    await apretar('Rechazar');

    expect(api.rechazarPago).toHaveBeenCalledWith(11, 'El monto no cuadra');
  });

  it('sin nada pendiente lo dice, en vez de quedar en blanco', async () => {
    await montar([]);

    expect(texto()).toContain('No hay nada esperando');
  });

  it('**recarga aunque el servidor rechace**: dos admins miran la misma bandeja', async () => {
    api.aprobarPago.mockRejectedValueOnce(new Error('ya la resolvieron'));
    const consultasPrevias = api.pagosPendientes.mock.calls.length;

    await apretar('Confirmar');

    expect(api.pagosPendientes.mock.calls.length).toBeGreaterThan(
      consultasPrevias,
    );
  });

  it('**el aviso sale junto a su fila**, no al pie de la lista', async () => {
    // Con ocho pendientes, un aviso al final de la página queda fuera de pantalla y el
    // admin cree que su clic no hizo nada.
    await montar([CON_COMPROBANTE, { ...CON_COMPROBANTE, id: 12, jugador: 'Ana Paz' }]);

    Array.from(elemento().querySelectorAll('li'))[1]
      .querySelectorAll('button')[1]
      .click();
    await fixture.whenStable();
    fixture.detectChanges();

    const filas = Array.from(elemento().querySelectorAll('li'));
    expect(filas[1].textContent).toContain('Escribe por qué');
    expect(filas[0].textContent).not.toContain('Escribe por qué');
  });
});
