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
    // T119: el ranking interno, anterior a la quinta parte, no tenía su tratamiento.
    ['el ranking interno y quién lo ve', 'Juegas partidos internos'],
    ['que un partido cuenta solo confirmado', 'solo cuando tu rival lo confirma'],
    ['cuánto se guardan los partidos internos', 'Partidos internos y ranking interno'],
    // Versión 1.2 (T138): lo que trajo la sexta parte.
    ['el correo del inscrito en un torneo', 'teléfono, correo, el club o lugar de dónde vienes'],
    ['que el estado del pago se publica', 'si tu inscripción está pagada o pendiente'],
    ['que ni el teléfono ni el correo se publican', 'El teléfono y el correo no se publican'],
    ['la confirmación de la inscripción', 'la confirmación de tu inscripción'],
    ['el resultado del pago de la inscripción', 'el pago de tu inscripción quedó confirmado o rechazado'],
    ['el aviso del cuadro armado', 'el cuadro se armó o cambió'],
    ['el aviso de la programación de un partido', 'programa, cambia o quita la hora'],
    ['el aviso a los administradores con el comprobante', 'comprobante de transferencia que llega'],
    ['que el teléfono es chileno', '+56 y nueve dígitos'],
  ])('nombra %s', (_, frase) => {
    expect(texto()).toContain(frase);
  });

  it('la versión 1.2 es la que nombra lo nuevo', () => {
    expect(texto()).toContain('Versión 1.2');
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
