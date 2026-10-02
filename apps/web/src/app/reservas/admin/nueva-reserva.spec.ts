import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Disponibilidad, GrillaDeCancha } from '../../catalogo-canchas/disponibilidad';
import { Socios } from '../../identidad/admin/socios.service';
import { NuevaReserva } from './nueva-reserva';
import { ReservasDelAdmin } from './nueva-reserva.service';

/**
 * La hora que el club toma en el mesón. Lo que se prueba acá es qué horas ofrece:
 * la API le deja tomar la que está corriendo —alguien llega a jugar ahora—, pero
 * no una que ya terminó (`BLOQUE_EN_EL_PASADO`).
 */
describe('NuevaReserva', () => {
  const DIA: GrillaDeCancha[] = [
    {
      cancha: {
        id: 1,
        nombre: 'Cancha 1',
        superficie: 'ARCILLA',
        techada: false,
        iluminacion: true,
      },
      bloques: [
        {
          inicio: '2026-08-17T12:00:00.000Z',
          fin: '2026-08-17T13:00:00.000Z',
          canchaId: 1,
          montoClp: 12000,
          esPico: false,
          bloqueado: false,
          motivoBloqueo: null,
          reservado: false,
        },
        {
          inicio: '2026-08-17T14:00:00.000Z',
          fin: '2026-08-17T15:00:00.000Z',
          canchaId: 1,
          montoClp: 12000,
          esPico: false,
          bloqueado: false,
          motivoBloqueo: null,
          reservado: false,
        },
        {
          inicio: '2026-08-17T16:00:00.000Z',
          fin: '2026-08-17T17:00:00.000Z',
          canchaId: 1,
          montoClp: 12000,
          esPico: false,
          bloqueado: false,
          motivoBloqueo: null,
          reservado: false,
        },
      ],
    },
  ];

  let fixture: ComponentFixture<NuevaReserva>;

  const horasOfrecidas = () =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLOptionElement>(
        'select[name="hora"] option',
      ),
    )
      .filter((opcion) => opcion.value)
      .map((opcion) => opcion.textContent?.trim());

  beforeEach(async () => {
    // jsdom no implementa el diálogo nativo, y el constructor lo abre en un
    // microtask: sin esto, el error salta después del test y no dentro de él.
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });

    // Las 10:40 del club: la de las 08:00 ya terminó, la de las 10:00 está
    // corriendo y la de las 12:00 no empieza.
    vi.setSystemTime('2026-08-17T14:40:00.000Z');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Disponibilidad, useValue: { delDia: () => Promise.resolve(DIA) } },
        { provide: Socios, useValue: { listado: () => Promise.resolve({ socios: [] }) } },
        { provide: ReservasDelAdmin, useValue: { cupoDe: vi.fn(), crear: vi.fn() } },
      ],
    });

    fixture = TestBed.createComponent(NuevaReserva);
    fixture.componentRef.setInput('fecha', '2026-08-17');
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('no ofrece una hora que ya terminó', () => {
    // La ofrecía, y la API la rechazaba con "Esa hora ya terminó." recién al crear.
    expect(horasOfrecidas()).not.toContain('08:00–09:00');
  });

  it('sí ofrece la hora que está corriendo', () => {
    // A diferencia de la grilla pública: en el mesón está la persona que llega a
    // jugar ahora, y esa hora todavía se puede vender.
    expect(horasOfrecidas()).toEqual(['10:00–11:00', '12:00–13:00']);
  });
});
