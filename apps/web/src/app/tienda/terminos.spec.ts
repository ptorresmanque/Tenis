import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { TerminosDeVenta } from './terminos';

/**
 * T167. Los términos de venta dicen lo que `SPEC-tienda.md` § Legal pide: retiro, despacho
 * por pagar, encargo, garantía legal, retracto y devoluciones. Como en la política de
 * privacidad, el test no revisa la redacción —es del club y de su asesor—: revisa que no
 * falte nada de lo que la ley obliga a informar.
 */
describe('Términos de venta', () => {
  function texto(): string {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(TerminosDeVenta);
    fixture.detectChanges();

    return (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';
  }

  it('lleva versión y fecha', () => {
    expect(texto()).toMatch(/Versión \d+\.\d+ · vigente desde el \d{1,2} de \w+ de \d{4}/);
  });

  it.each([
    ['quién vende, con su RUT', 'Fedal SpA, RUT 77.950.109-4'],
    ['dónde escribir', 'contacto@fedal.cl'],
    ['que los precios llevan IVA', 'incluyen IVA'],
    ['el precio de socio y a quién le toca', 'socio activo y al día'],
    ['el retiro en el club', 'Retiro en el club'],
    ['el despacho por pagar', 'por pagar'],
    ['quién despacha', 'Starken'],
    ['los productos por encargo', 'Por encargo'],
    ['la garantía legal de seis meses', 'seis meses'],
    ['lo que se puede pedir con la garantía', 'el cambio, la reparación o la devolución'],
    ['el derecho a retracto de 10 días', '10 días'],
    ['que el retracto no exige dar motivo', 'sin expresar causa'],
    ['lo que no se puede retractar', 'uso personal'],
    ['las devoluciones', 'Devoluciones'],
    ['la ley que se aplica', 'Ley N.º 19.496'],
  ])('nombra %s', (_, frase) => {
    expect(texto()).toContain(frase);
  });
});
