import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { elegir as elegirOpcion, textosDe } from '../../testing/elegir';
import { Socios } from '../../identidad/admin/socios.service';
import { Jugador, Torneos } from '../torneos.service';
import { JugadoresPanel } from './jugadores';
import { avisoDeLoHecho } from '../../testing/snackbar';
import { textoDelDialogo } from '../../testing/dialogos';

/**
 * T49. Quiénes juegan torneos.
 *
 * Lo que este archivo cuida: que **enlazar a un socio se ofrezca solo donde tiene
 * sentido** y que la lista de socios no invite a anotar dos veces a la misma persona.
 * El jugador es la identidad que acumula puntos; duplicarlo parte la tabla en dos.
 *
 * Desde T292 se anota en un diálogo que abre el FAB «Anotar jugador».
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

  /** El diálogo de anotar, que Material dibuja fuera del componente (T292). */
  const dialogo = () => document.querySelector<HTMLElement>('mat-dialog-container');

  const esperar = async () => {
    // Dos vueltas: el diálogo responde, y después la lista sigue con lo que esperaba.
    for (let i = 0; i < 2; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  };

  const abrirElDialogo = async () => {
    elemento().querySelector<HTMLButtonElement>('.mat-mdc-fab-base')!.click();
    await esperar();
  };

  const anotarEnElDialogo = async () => {
    dialogo()!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await esperar();
  };

  beforeEach(async () => {
    await montar([EXTERNO, DEL_CLUB]);
  });

  it('distingue al jugador del club del de afuera', () => {
    expect(texto()).toContain('Socio 001');
    expect(texto()).toContain('De afuera');
  });

  it('**«Anotar jugador» es el único FAB, y el formulario ya no está en la página** (T292)', () => {
    const fabs = elemento().querySelectorAll('.mat-mdc-fab-base');

    expect(fabs.length).toBe(1);
    expect(fabs[0].textContent).toContain('Anotar jugador');
    expect(elemento().querySelector('form')).toBeNull();
    // Espacio al final para que el FAB no tape el último jugador (A9).
    expect(elemento().classList).toContain('pb-24');
  });

  it('**al socio que ya tiene jugador no se le ofrece anotarlo otra vez**', async () => {
    await abrirElDialogo();
    const opciones = textosDe(fixture, 'mat-select[name="socioId"]');

    expect(opciones.some((o) => o?.startsWith('002'))).toBe(true);
    expect(opciones.some((o) => o?.startsWith('001'))).toBe(false);
  });

  it('si los socios llegan con el diálogo ya abierto, aparecen en su lista', async () => {
    let soltar!: (listado: unknown) => void;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Torneos, useValue: api },
        {
          provide: Socios,
          useValue: { listado: vi.fn(() => new Promise((listo) => (soltar = listo))) },
        },
      ],
    });
    // Sin whenStable hasta que lleguen los socios: esperaría justo ese pedido, que sigue abierto.
    const unaVuelta = async () => {
      await new Promise((listo) => setTimeout(listo));
      fixture.detectChanges();
    };
    fixture = TestBed.createComponent(JugadoresPanel);
    await unaVuelta();
    elemento().querySelector<HTMLButtonElement>('.mat-mdc-fab-base')!.click();
    await unaVuelta();
    expect(textosDe(fixture, 'mat-select[name="socioId"]')).toEqual(['Elige un socio']);

    soltar({
      socios: [{ id: 10, numeroSocio: '002', usuario: { nombre: 'Matías', apellido: 'Rojas' } }],
    });
    await esperar();

    expect(textosDe(fixture, 'mat-select[name="socioId"]')).toContain('002 · Matías Rojas');
  });

  it('anotar a un socio manda su ficha, no un nombre escrito a mano; **y la lista se relee**', async () => {
    await abrirElDialogo();
    await elegirOpcion(fixture, `mat-select[name="socioId"]`, '10');
    await fixture.whenStable();

    await anotarEnElDialogo();

    expect(api.crearJugador).toHaveBeenCalledWith({ socioId: 10 });
    await vi.waitFor(() => expect(avisoDeLoHecho()).toContain('ya puede jugar torneos'));
    expect(textoDelDialogo()).toBe('');
    expect(api.jugadores).toHaveBeenCalledTimes(2);
  });

  it('a alguien de afuera se lo anota con su nombre, apellido y teléfono', async () => {
    await abrirElDialogo();
    dialogo()!
      .querySelectorAll<HTMLButtonElement>('mat-button-toggle button')[1]
      .click();
    await esperar();
    await Promise.resolve();
    for (const [campo, valor] of [
      ['nombre', 'Rodrigo'],
      ['apellido', 'Externo'],
      ['telefono', '911112222'],
    ]) {
      const entrada = dialogo()!.querySelector<HTMLInputElement>(`input[name="${campo}"]`)!;
      entrada.value = valor;
      entrada.dispatchEvent(new Event('input'));
    }
    await esperar();

    await anotarEnElDialogo();

    expect(api.crearJugador).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: 'Rodrigo', apellido: 'Externo' }),
    );
  });

  it('si el servidor no lo anota, lo dice en el diálogo, que sigue abierto', async () => {
    api.crearJugador.mockRejectedValue({
      error: { message: 'Ese socio ya juega como Carolina Díaz.' },
    });
    await abrirElDialogo();
    await elegirOpcion(fixture, `mat-select[name="socioId"]`, '10');
    await fixture.whenStable();

    await anotarEnElDialogo();

    expect(textoDelDialogo()).toContain('ya juega como');
  });

  it('mientras anota no se puede cerrar: quedaría anotado sin que la lista se relea', async () => {
    let soltar!: (jugador: Jugador) => void;
    api.crearJugador.mockReturnValue(new Promise((listo) => (soltar = listo)));
    await abrirElDialogo();
    await elegirOpcion(fixture, `mat-select[name="socioId"]`, '10');
    await fixture.whenStable();
    dialogo()!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();

    document.querySelector<HTMLElement>('.cdk-overlay-backdrop')!.click();
    await fixture.whenStable();
    expect(dialogo()).not.toBeNull();

    soltar(EXTERNO);
    await vi.waitFor(() => expect(avisoDeLoHecho()).toContain('ya puede jugar torneos'));
  });

  it('**enlazar solo se ofrece a quien no tiene ficha de socio**', () => {
    // Al que ya está enlazado no se le puede cambiar de persona desde acá.
    const selects = elemento().querySelectorAll('mat-select[name^="enlace-"]');

    expect(selects).toHaveLength(1);
    expect(selects[0].getAttribute('name')).toBe('enlace-1');
    // Sin elegir, dice el guion y no queda en blanco, como el <select> de antes (T248).
    expect(selects[0].textContent?.trim()).toBe('—');
  });

  it('enlazar escribe el socio sobre el jugador que ya existe', async () => {
    await elegirOpcion(fixture, `mat-select[name="enlace-1"]`, '10');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.editarJugador).toHaveBeenCalledWith(1, { socioId: 10 });
    expect(avisoDeLoHecho()).toContain('quedó enlazado a su ficha de socio');
  });

  it('volver al guion después de un enlace que falló no manda nada', async () => {
    // Al abrir, el guion ya está elegido y elegirlo no avisa: se llega a él desde otro (T248).
    api.editarJugador.mockRejectedValueOnce({ error: { message: 'No se pudo.' } });
    await elegirOpcion(fixture, `mat-select[name="enlace-1"]`, '10');
    await fixture.whenStable();
    fixture.detectChanges();

    await elegirOpcion(fixture, `mat-select[name="enlace-1"]`, '0');
    await fixture.whenStable();

    expect(api.editarJugador).toHaveBeenCalledTimes(1);
  });

  it('si el socio ya juega con otro nombre, lo dice con las palabras del servidor', async () => {
    api.editarJugador.mockRejectedValue({
      error: { message: 'Ese socio ya juega como Carolina Díaz.' },
    });

    await elegirOpcion(fixture, `mat-select[name="enlace-1"]`, '10');
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
