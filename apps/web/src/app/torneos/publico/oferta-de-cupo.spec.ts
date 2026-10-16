import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';

import { InscripcionPorLlave, Torneos } from '../torneos.service';
import { OfertaDeCupo } from './oferta-de-cupo';

/**
 * T334 (SPEC-torneos.md § Lista de espera sin cobro, LE4). La página a la que lleva el correo «Se
 * abrió un cupo»: dice hasta cuándo se guarda el cupo y se toma pagando con Webpay, subiendo el
 * comprobante o, si es gratis, con un botón. Vencida o tomada, lo dice y no ofrece pagar.
 */
describe('OfertaDeCupo', () => {
  const OFRECIDA: InscripcionPorLlave = {
    torneoId: 5,
    torneo: 'Copa de verano',
    categoria: '4ª',
    montoClp: 15_000,
    situacion: 'OFRECIDO',
    // Viernes 16 de octubre de 2026 a las 10:30 en Santiago (UTC-3).
    hasta: '2026-10-16T13:30:00.000Z',
  };

  let fixture: ComponentFixture<OfertaDeCupo>;
  let navegar: MockInstance<Router['navigate']>;
  let api: {
    inscripcionPorLlave: ReturnType<typeof vi.fn>;
    pagarInscripcion: ReturnType<typeof vi.fn>;
    subirComprobante: ReturnType<typeof vi.fn>;
    tomarCupo: ReturnType<typeof vi.fn>;
  };

  const montar = async (
    oferta: InscripcionPorLlave | Error,
    pago?: string,
  ) => {
    api = {
      inscripcionPorLlave: vi.fn(() =>
        oferta instanceof Error ? Promise.reject(oferta) : Promise.resolve(oferta),
      ),
      pagarInscripcion: vi.fn().mockResolvedValue({
        montoClp: 15_000,
        urlRedireccion: 'https://webpay/x',
        tokenPasarela: 'e1a2b3',
      }),
      subirComprobante: vi.fn().mockResolvedValue({ id: 1 }),
      tomarCupo: vi.fn().mockResolvedValue({ id: 1 }),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Torneos, useValue: api }],
    });

    navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(OfertaDeCupo);
    fixture.componentRef.setInput('token', 'llave-1');
    if (pago) fixture.componentRef.setInput('pago', pago);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const texto = () => elemento().textContent ?? '';
  const boton = (nombre: string) =>
    Array.from(elemento().querySelectorAll('button')).find((b) =>
      b.textContent?.includes(nombre),
    );

  const apretar = async (nombre: string) => {
    boton(nombre)!.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const alTerminar = (pago: string) =>
    expect(navegar).toHaveBeenCalledWith(['/torneos'], {
      queryParams: { pago },
      replaceUrl: true,
    });

  beforeEach(() => {
    // jsdom no navega, y a Webpay se sale por POST: ver `core/pagos/ir-a-pagar.ts`.
    HTMLFormElement.prototype.submit = vi.fn();
  });

  describe('con el cupo ofrecido', () => {
    beforeEach(() => montar(OFRECIDA));

    it('**dice el torneo, la categoría y hasta cuándo se guarda el cupo**, en el reloj del club', () => {
      expect(elemento().querySelector('h1')?.textContent).toContain('Copa de verano');
      expect(texto()).toContain('4ª');
      expect(texto()).toContain('viernes, 16 de octubre, a las 10:30');
    });

    it('**se paga con Webpay**, saliendo a la pasarela sin otro botón', async () => {
      await apretar('Webpay');

      expect(api.pagarInscripcion).toHaveBeenCalledWith('llave-1');
      expect(document.body.querySelector('form[action="https://webpay/x"]')).not.toBeNull();
    });

    it('**o con el comprobante**, y termina en Torneos como la inscripción', async () => {
      const campo = elemento().querySelector<HTMLInputElement>('input[type="file"]')!;
      const archivo = new File(['una imagen'], 'transferencia.jpg', { type: 'image/jpeg' });
      Object.defineProperty(campo, 'files', { value: [archivo] });
      campo.dispatchEvent(new Event('change'));
      await fixture.whenStable();

      expect(api.subirComprobante).toHaveBeenCalledWith('llave-1', archivo);
      alTerminar('comprobante');
    });

    it('no ofrece «Tomar el cupo»: esta categoría se paga', () => {
      expect(boton('Tomar el cupo')).toBeUndefined();
    });

    it('**si el servidor rechaza, lo dice y vuelve a leer la oferta**: puede haber vencido', async () => {
      api.pagarInscripcion.mockRejectedValueOnce({
        error: { message: 'Se venció tu plazo para tomar el cupo.' },
      });

      await apretar('Webpay');

      expect(texto()).toContain('Se venció tu plazo para tomar el cupo.');
      expect(api.inscripcionPorLlave).toHaveBeenCalledTimes(2);
    });
  });

  it('**gratis, se toma con un botón** y termina en Torneos (E5)', async () => {
    await montar({ ...OFRECIDA, montoClp: 0 });

    expect(boton('Webpay')).toBeUndefined();
    await apretar('Tomar el cupo');

    expect(api.tomarCupo).toHaveBeenCalledWith('llave-1');
    alTerminar('inscrito');
  });

  it('**volviendo de Webpay sin pagar, dice que el cupo le sigue guardado**', async () => {
    await montar(OFRECIDA, 'anulado');

    expect(texto()).toContain('No terminaste el pago');
    expect(texto()).toContain('sigue guardado');
  });

  it('con el pago rechazado, lo mismo', async () => {
    await montar(OFRECIDA, 'rechazado');

    expect(texto()).toContain('El pago fue rechazado');
    expect(texto()).toContain('sigue guardado');
  });

  describe('**sin la oferta en pie no ofrece pagar**', () => {
    for (const [situacion, dice] of [
      ['VENCIDO', 'Se venció tu plazo'],
      ['CERRADO', 'se cerró'],
      ['ESPERANDO', 'Sigues en la lista de espera'],
      ['INSCRITO', 'Ya estás inscrito'],
      ['RETIRADO', 'ya no está en el torneo'],
    ] as const) {
      it(`${situacion}: «${dice}»`, async () => {
        await montar({ ...OFRECIDA, situacion, hasta: null });

        expect(texto()).toContain(dice);
        expect(boton('Webpay')).toBeUndefined();
        expect(boton('Tomar el cupo')).toBeUndefined();
        expect(elemento().querySelector('input[type="file"]')).toBeNull();
      });
    }
  });

  it('una llave que no existe lo dice, y lleva a Torneos', async () => {
    await montar(new Error('404'));

    expect(texto()).toContain('No encontramos esta inscripción');
    expect(elemento().querySelector('a[href="/torneos"]')).not.toBeNull();
  });
});
