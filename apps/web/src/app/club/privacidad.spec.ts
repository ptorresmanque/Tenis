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
    // Versión 1.1 (T118): lo que trajo la quinta parte.
    ['el mapa de "El club" y a quién se lo pide el navegador', 'OpenStreetMap'],
    ['los botones para llegar, que abren otro servicio', 'Waze'],
    ['la confirmación de la reserva', 'confirmación de tu reserva'],
    ['el aviso de cada cambio de una reserva', 'cada cambio de tu reserva'],
    ['el recordatorio de la cuota', 'recordatorio de tu cuota'],
    ['el aviso al rival de un partido interno', 'partido interno'],
    ['que el socio vuelve a ver a sus invitados', 'te los sugerimos'],
  ])('nombra %s', (_, frase) => {
    expect(texto()).toContain(frase);
  });

  it('la versión 1.1 es la que nombra lo nuevo', () => {
    expect(texto()).toContain('Versión 1.1');
  });

  it('el cupo de invitados se describe como funciona desde A5: por reservas', () => {
    expect(texto()).toContain('reservas con invitados por mes');
    expect(texto()).not.toContain('e invitados por mes');
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
