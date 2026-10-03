import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Socios } from '../../identidad/admin/socios.service';
import { Jugador, Torneos } from '../torneos.service';
import { JugadoresPanel } from './jugadores';

/**
 * T49. Quiénes juegan torneos.
 *
 * Lo que este archivo cuida: que **enlazar a un socio se ofrezca solo donde tiene
 * sentido** y que la lista de socios no invite a anotar dos veces a la misma persona.
 * El jugador es la identidad que acumula puntos; duplicarlo parte la tabla en dos.
 */
describe('JugadoresPanel', () => {
  const EXTERNO: Jugador = {
    id: 1,
    nombre: 'Rodrigo',
    apellido: 'Externo',
    telefono: '+56911112222',
    socioId: null,
    numeroSocio: null,
    activo: true,
  };

  const DEL_CLUB: Jugador = {
    id: 2,
    nombre: 'Carolina',
    apellido: 'Díaz',
    telefono: null,
    socioId: 9,
    numeroSocio: '001',
    activo: true,
  };

  let fixture: ComponentFixture<JugadoresPanel>;
  let api: {
    jugadores: ReturnType<typeof vi.fn>;
    crearJugador: ReturnType<typeof vi.fn>;
    editarJugador: ReturnType<typeof vi.fn>;
  };

  const montar = async (jugadores: Jugador[]) => {
    api = {
      jugadores: vi.fn().mockResolvedValue(jugadores),
      crearJugador: vi.fn().mockResolvedValue(EXTERNO),
      editarJugador: vi.fn().mockResolvedValue(EXTERNO),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Torneos, useValue: api },
        {
          provide: Socios,
          useValue: {
            listado: vi.fn().mockResolvedValue({
              socios: [
                {
                  id: 9,
                  numeroSocio: '001',
                  usuario: { nombre: 'Carolina', apellido: 'Díaz' },
                },
                {
                  id: 10,
                  numeroSocio: '002',
                  usuario: { nombre: 'Matías', apellido: 'Rojas' },
                },
              ],
            }),
          },
        },
      ],
    });

    fixture = TestBed.createComponent(JugadoresPanel);
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
    await montar([EXTERNO, DEL_CLUB]);
  });

  it('distingue al jugador del club del de afuera', () => {
    expect(texto()).toContain('Socio 001');
    expect(texto()).toContain('De afuera');
  });

  it('**al socio que ya tiene jugador no se le ofrece anotarlo otra vez**', () => {
    const opciones = Array.from(
      elemento().querySelectorAll('select[name="socioId"] option'),
    ).map((o) => o.textContent?.trim());

    expect(opciones.some((o) => o?.startsWith('002'))).toBe(true);
    expect(opciones.some((o) => o?.startsWith('001'))).toBe(false);
  });

  it('anotar a un socio manda su ficha, no un nombre escrito a mano', async () => {
    const select = elemento().querySelector(
      'select[name="socioId"]',
    ) as HTMLSelectElement;
    select.value = '10';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    await apretar('Anotar');

    expect(api.crearJugador).toHaveBeenCalledWith({ socioId: 10 });
  });

  it('**enlazar solo se ofrece a quien no tiene ficha de socio**', () => {
    // Al que ya está enlazado no se le puede cambiar de persona desde acá.
    const selects = elemento().querySelectorAll('select[name^="enlace-"]');

    expect(selects).toHaveLength(1);
    expect(selects[0].getAttribute('name')).toBe('enlace-1');
  });

  it('enlazar escribe el socio sobre el jugador que ya existe', async () => {
    const select = elemento().querySelector(
      'select[name="enlace-1"]',
    ) as HTMLSelectElement;
    select.value = '10';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.editarJugador).toHaveBeenCalledWith(1, { socioId: 10 });
  });

  it('elegir el guion en el selector de enlace no hace nada', async () => {
    const select = elemento().querySelector(
      'select[name="enlace-1"]',
    ) as HTMLSelectElement;
    select.value = '0';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(api.editarJugador).not.toHaveBeenCalled();
  });

  it('si el socio ya juega con otro nombre, lo dice con las palabras del servidor', async () => {
    api.editarJugador.mockRejectedValue({
      error: { message: 'Ese socio ya juega como Carolina Díaz.' },
    });

    const select = elemento().querySelector(
      'select[name="enlace-1"]',
    ) as HTMLSelectElement;
    select.value = '10';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(texto()).toContain('ya juega como');
  });

  it('sin jugadores lo dice, en vez de quedar en blanco', async () => {
    await montar([]);

    expect(texto()).toContain('Todavía no hay jugadores');
  });

  // `value()` de un resource lanza en estado de error aunque tenga `defaultValue`.
  it('si la API no responde, lo dice en vez de reventar', async () => {
    const caida = () => Promise.reject(new Error('la API no respondió'));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Torneos, useValue: { jugadores: caida } },
        { provide: Socios, useValue: { listado: caida } },
      ],
    });

    fixture = TestBed.createComponent(JugadoresPanel);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(texto()).toContain('No se pudieron cargar los jugadores');
  });
});
