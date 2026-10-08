import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { Privacidad } from './privacidad';

/**
 * D9. La Ley 21.719 (art. 14 ter) dice qué tiene que estar a la vista. Este test
 * no revisa la redacción, que es del club: revisa que no se pierda ninguna de las
 * cosas que la ley exige publicar.
 */
describe('Política de privacidad', () => {
  function texto(): string {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(Privacidad);
    fixture.detectChanges();

    return (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';
  }

  it('lleva versión y fecha', () => {
    expect(texto()).toMatch(/Versión \d+\.\d+ · vigente desde el \d{1,2} de \w+ de \d{4}/);
  });

  it.each([
    ['el responsable y su RUT', 'Fedal SpA, RUT 77.950.109-4'],
    ['el representante legal', 'Jonatan Illanes Bravo'],
    ['el domicilio', 'Lircay lt 42, Temuco'],
    ['el canal para ejercer los derechos', 'contacto@fedal.cl'],
    ['el plazo de respuesta', '30 días corridos'],
    ['la autoridad ante la que se reclama', 'Agencia de Protección de Datos Personales'],
    ['quién procesa los pagos', 'Transbank'],
    ['dónde se alojan los datos', 'Haulmer'],
    ['la transferencia internacional', 'Estados Unidos'],
    ['las decisiones automatizadas', 'Decisiones automatizadas'],
    ['cuánto se guardan los pagos', '6 años'],
  ])('nombra %s', (_, frase) => {
    expect(texto()).toContain(frase);
  });

  it('el correo de contacto se puede apretar', () => {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(Privacidad);
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('a[href="mailto:contacto@fedal.cl"]'),
    ).not.toBeNull();
  });
});
