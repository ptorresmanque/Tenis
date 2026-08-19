import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReservaMia, Reservas } from '../reservas.service';
import { MisReservas } from './mis-reservas';

/**
 * T24 en pantalla.
 *
 * Lo que no se puede fallar acá: **decir si hay devolución antes de que la persona
 * apriete cancelar**, no después. Enterarse de que perdió lo que pagó cuando la hora
 * ya está liberada es la llamada al club que esta pantalla existe para evitar.
 */
describe('MisReservas', () => {
  const UNA: ReservaMia = {
    id: 7,
    folio: 'AB23CDE',
    cancha: 'Cancha 1',
    // 7 de septiembre: Chile ya cambió la hora el domingo anterior, así que estas
    // 12:00Z son las 09:00 del club y no las 08:00 que serían en agosto.
    inicio: '2026-09-07T12:00:00.000Z',
    fin: '2026-09-07T13:00:00.000Z',
    estado: 'CONFIRMADA',
    esPico: false,
    pagada: false,
    sePuedeModificar: true,
    devolucionAlCancelar: false,
  };

  let fixture: ComponentFixture<MisReservas>;
  let cancelar: ReturnType<typeof vi.fn>;

  const montar = async (mias: ReservaMia[]) => {
    cancelar = vi.fn().mockResolvedValue({
      folio: 'AB23CDE',
      huboDevolucion: false,
      motivo: null,
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: Reservas,
          useValue: { mias: () => Promise.resolve(mias), cancelar },
        },
      ],
    });

    fixture = TestBed.createComponent(MisReservas);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const boton = (etiqueta: string) =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((b) => (b.textContent ?? '').includes(etiqueta));

  const apretar = async (etiqueta: string) => {
    boton(etiqueta)!.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await montar([UNA]);
  });

  it('muestra la cancha, el día, la hora del club y el folio', () => {
    expect(texto()).toContain('Cancha 1');
    // La hora del club y con el desfase vigente ese día, no la del navegador ni un
    // -04:00 fijo: un socio de viaje tiene que leer la misma hora a la que juega.
    expect(texto()).toContain('09:00–10:00');
    expect(texto()).toContain('AB23CDE');
  });

  it('cuando no hay reservas lo dice, en vez de quedar en blanco', async () => {
    await montar([]);

    expect(texto()).toContain('No tienes horas tomadas');
  });

  it('no ofrece cambiar la hora cuando ya pasó el plazo, y explica por qué', async () => {
    await montar([{ ...UNA, sePuedeModificar: false }]);

    expect(texto()).not.toContain('Cambiar la hora');
    expect(texto()).toContain('6 horas');
    // Cancelar sí se puede hasta el final: lo que cambia es si hay devolución.
    expect(boton('Cancelar')).toBeDefined();
  });

  it('antes de confirmar avisa que no hay plata que devolver', async () => {
    await apretar('Cancelar');

    expect(texto()).toContain('recuperas el cupo');
    // Y no se cancela nada hasta que la persona confirme.
    expect(cancelar).not.toHaveBeenCalled();
  });

  it('a quien pagó y está a tiempo le avisa que se le devuelve', async () => {
    await montar([{ ...UNA, pagada: true, devolucionAlCancelar: true }]);

    await apretar('Cancelar');

    expect(texto()).toContain('devolvemos');
  });

  it('**a quien pagó y ya no alcanza le avisa que pierde lo pagado, antes de confirmar**', async () => {
    // El caso que justifica la pantalla: la ventana de reembolso se mide contra el
    // bloque comprado, así que quien reagendó puede estar fuera de plazo aunque su
    // hora se vea lejos. Si esto no se dice antes, se entera cuando ya no hay vuelta.
    await montar([{ ...UNA, pagada: true, devolucionAlCancelar: false }]);

    await apretar('Cancelar');

    expect(texto()).toContain('pierdes lo que pagaste');
    expect(texto()).toContain('24 horas');
    // Contra la hora **comprada**, no contra la que se ve en la tarjeta: quien movió
    // su reserva la ve lejos y el plazo ya venció. Decirlo al revés la haría cancelar
    // creyendo que está a tiempo.
    expect(texto()).toContain('compraste');
  });

  it('al confirmar, cancela y la reserva desaparece de la lista', async () => {
    await apretar('Cancelar');
    await apretar('Sí, cancelar');

    expect(cancelar).toHaveBeenCalledWith(7);
    expect(texto()).toContain('No tienes horas tomadas');
  });

  it('si la cancelación falla, la reserva sigue ahí y se avisa', async () => {
    // Lo contrario es lo peor posible: la pantalla dice que canceló, la persona no
    // va, y la hora sigue tomada a su nombre.
    await apretar('Cancelar');
    cancelar.mockRejectedValueOnce({ status: 500 });

    await apretar('Sí, cancelar');

    expect(texto()).toContain('AB23CDE');
    expect(texto()).toContain('No se pudo');
  });
});
