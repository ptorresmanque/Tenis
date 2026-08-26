import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { Club } from '../club/club.service';
import { ReservaPublicaPagina } from './reserva-publica';
import { ReservaPublica, ReservasPublicas } from './reserva-publica.service';

/**
 * La pantalla del QR, la que se mira en el mesón.
 *
 * Lo que no puede fallar acá es **decir cuándo no corresponde dejar entrar**. Quien
 * la lee tiene a alguien enfrente esperando la cancha y le dedica dos segundos: una
 * reserva cancelada que se vea parecida a una confirmada es la hora entregada a
 * quien no la tiene.
 *
 * Y lo segundo: que esta página **no cancele**. El enlace se reenvía por WhatsApp y
 * termina en pantallas ajenas; un botón de cancelar acá es la hora perdida por quien
 * dejó el teléfono sobre la mesa.
 */
describe('ReservaPublicaPagina', () => {
  const UNA: ReservaPublica = {
    folio: 'AB23CDE',
    cancha: 'Cancha 1',
    inicio: '2026-08-17T12:00:00.000Z',
    fin: '2026-08-17T13:00:00.000Z',
    nombre: 'Rafael Nadal',
    esPico: false,
    estado: 'CONFIRMADA',
    acompanantes: 1,
  };

  let fixture: ComponentFixture<ReservaPublicaPagina>;

  const montar = async (
    respuesta: ReservaPublica | Error,
    email = 'hola@fedaltenis.cl',
  ) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ReservasPublicas,
          useValue: {
            porToken: () =>
              respuesta instanceof Error
                ? Promise.reject(respuesta)
                : Promise.resolve(respuesta),
          },
        },
        {
          provide: Club,
          useValue: {
            datos: () => ({
              nombre: 'FEDAL Tennis Center',
              direccion: '',
              telefono: '',
              email,
            }),
            email: () => email,
          },
        },
      ],
    });

    fixture = TestBed.createComponent(ReservaPublicaPagina);
    fixture.componentRef.setInput('token', 'un-token-cualquiera');
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('muestra el nombre, la cancha, la hora del club y el folio', async () => {
    await montar(UNA);

    expect(texto()).toContain('Rafael Nadal');
    expect(texto()).toContain('Cancha 1');
    // 12:00Z en agosto son las 08:00 en Santiago: la hora a la que juega, no la
    // del teléfono con que se escaneó.
    expect(texto()).toContain('08:00–09:00');
    expect(texto()).toContain('AB23CDE');
  });

  it('cuenta al titular dentro de los que entran', async () => {
    // Un acompañante son dos personas en la puerta. Mostrar el campo crudo haría
    // pasar a uno de más o dejar a uno afuera.
    await montar(UNA);
    expect(texto()).toContain('2 personas');

    await montar({ ...UNA, acompanantes: 0 });
    expect(texto()).toContain('1 persona');
  });

  it('**con la reserva cancelada avisa que no corresponde dar acceso**', async () => {
    await montar({ ...UNA, estado: 'CANCELADA' });

    expect(texto()).toContain('Cancelada');
    expect(texto()).toContain('no corresponde dar acceso');
  });

  it('lo mismo con una que espera el pago: tampoco es una hora tomada', async () => {
    await montar({ ...UNA, estado: 'PENDIENTE_PAGO' });

    expect(texto()).toContain('Esperando el pago');
    expect(texto()).toContain('no corresponde dar acceso');
  });

  it('confirmada no lleva la advertencia, que es lo que la hace visible', async () => {
    // Sin esto la prueba de arriba pasaría igual con la advertencia siempre puesta,
    // y una advertencia que sale siempre deja de leerse.
    await montar(UNA);

    expect(texto()).not.toContain('no corresponde dar acceso');
  });

  it('no ofrece cancelar por acá, y dice a dónde ir', async () => {
    await montar(UNA);

    const botones = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'button',
    );
    expect(botones).toHaveLength(0);
    expect(texto()).toContain('desde este enlace no se puede');
    expect(texto()).toContain('hola@fedaltenis.cl');
  });

  it('sin correo cargado la frase sigue teniendo sentido', async () => {
    await montar(UNA, '');

    expect(texto()).toContain('Dile');
    expect(texto()).toContain('desde este enlace no se puede');
  });

  it('un token que no existe no deja la pantalla en blanco', async () => {
    await montar(new Error('404'));

    expect(texto()).toContain('no lleva a ninguna reserva');
    expect(texto()).not.toContain('AB23CDE');
  });
});
