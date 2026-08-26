import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Cuotas, MiCuota } from './cuotas.service';
import { MiCuenta } from './mi-cuenta';

/**
 * T43. Lo que el socio debe, y el botón para pagarlo.
 *
 * Dos cosas que este archivo ataja. Que **el período se lea en castellano**: "2026-08"
 * es un dato de la base, no algo que alguien quiera leer en su estado de cuenta. Y que
 * **la vuelta de la pasarela diga cómo fue**: sin esa señal, quien acaba de pagar no
 * ve nada distinto y aprieta otra vez.
 */
describe('MiCuenta', () => {
  const MENSUAL: MiCuota = {
    id: 1,
    tipo: 'MENSUAL',
    periodo: '2026-08',
    montoClp: 25000,
    descuentoClp: 0,
    estado: 'PENDIENTE',
    pagadaEn: null,
    medio: null,
  };

  let fixture: ComponentFixture<MiCuenta>;
  let api: {
    mias: ReturnType<typeof vi.fn>;
    pagar: ReturnType<typeof vi.fn>;
  };

  const montar = async (
    cuotas: MiCuota[],
    deudaClp: number,
    pago: string | null = null,
  ) => {
    api = {
      mias: vi.fn().mockResolvedValue({ cuotas, deudaClp }),
      pagar: vi.fn().mockResolvedValue({ urlRedireccion: 'https://webpay/x' }),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Cuotas, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: of(convertToParamMap(pago ? { pago } : {})),
          },
        },
      ],
    });

    fixture = TestBed.createComponent(MiCuenta);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const apretar = async (etiqueta: string) => {
    Array.from(elemento().querySelectorAll('button'))
      .find((b) => b.textContent?.includes(etiqueta))
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await montar([MENSUAL], 25000);
  });

  it('**dice cuánto debe, sin hacer sumar a nadie**', () => {
    expect((elemento().textContent ?? '').replace(/\s/g, '')).toContain('$25.000');
    expect(elemento().textContent).toContain('Debes');
  });

  it('**el período se lee en castellano, no como está en la base**', () => {
    expect(elemento().textContent).toContain('agosto de 2026');
    expect(elemento().textContent).not.toContain('2026-08');
  });

  it('la incorporación se nombra por lo que es', async () => {
    await montar([{ ...MENSUAL, tipo: 'INCORPORACION' }], 150000);

    expect(elemento().textContent).toContain('Incorporación al club');
  });

  it('al día, lo dice en vez de mostrar un cero', async () => {
    await montar([{ ...MENSUAL, estado: 'PAGADA' }], 0);

    expect(elemento().textContent).toContain('Estás al día');
    expect(elemento().textContent).not.toContain('Debes');
  });

  it('la pagada no ofrece pagar de nuevo', async () => {
    await montar([{ ...MENSUAL, estado: 'PAGADA' }], 0);

    expect(
      Array.from(elemento().querySelectorAll('button')).some((b) =>
        b.textContent?.includes('Pagar'),
      ),
    ).toBe(false);
  });

  it('pagar pide la redirección al servidor', async () => {
    await apretar('Pagar en línea');

    expect(api.pagar).toHaveBeenCalledWith(1);
  });

  it('si no se puede iniciar el pago, lo dice y deja reintentar', async () => {
    api.pagar.mockRejectedValue({
      error: { message: 'Esa cuota ya está pagada.' },
    });

    await apretar('Pagar en línea');

    expect(elemento().textContent).toContain('ya está pagada');
    // Y el botón vuelve a estar disponible.
    const boton = Array.from(elemento().querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Pagar'),
    ) as HTMLButtonElement;
    expect(boton.disabled).toBe(false);
  });

  it('**volviendo de un pago listo, lo dice**', async () => {
    await montar([{ ...MENSUAL, estado: 'PAGADA' }], 0, 'listo');

    expect(elemento().textContent).toContain('Pago recibido');
  });

  it('volviendo de un rechazo, explica qué hacer', async () => {
    await montar([MENSUAL], 25000, 'rechazado');

    expect(elemento().textContent).toContain('no se completó');
    expect(elemento().textContent).toContain('pagar en el club');
  });

  it('quien anuló en la pasarela no cree que pagó', async () => {
    await montar([MENSUAL], 25000, 'anulado');

    expect(elemento().textContent).toContain('sigue pendiente');
  });

  it('sin cuotas lo dice, en vez de quedar en blanco', async () => {
    await montar([], 0);

    expect(elemento().textContent).toContain('No tienes cuotas');
  });
});
