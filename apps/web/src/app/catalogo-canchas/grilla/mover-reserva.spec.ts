import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { ReservaPublica, ReservasPublicas } from '../../reservas/reserva-publica.service';
import { ReservaQueSeMueve, Reservas } from '../../reservas/reservas.service';
import { MoverReserva } from './mover-reserva';

/**
 * T401 (`SPEC-panel.md` § El modo mover a la vista). Dónde estaba la reserva que se mueve, para
 * que la barra diga «Antes» y el tablero marque su hora: por su id (el socio y el panel) o por el
 * enlace (el visitante). El panel no la saca de la lista del día, que cambia con el día que se
 * mira.
 */
describe('MoverReserva.origen', () => {
  const POR_ID: ReservaQueSeMueve = {
    id: 7,
    folio: 'AB23CDE',
    nombre: 'Carolina Díaz',
    canchaId: 2,
    cancha: 'Cancha 2',
    inicio: '2026-08-17T16:30:00.000Z',
    fin: '2026-08-17T17:30:00.000Z',
  };

  const POR_ENLACE = {
    folio: 'VIS1234',
    cancha: 'Cancha 3',
    canchaId: 3,
    inicio: '2026-08-18T13:00:00.000Z',
    fin: '2026-08-18T14:30:00.000Z',
    nombre: 'Camila Visitante',
  } as ReservaPublica;

  const montar = async (parametros: Record<string, string>) => {
    const hora = vi.fn(() => Promise.resolve(POR_ID));
    const porToken = vi.fn(() => Promise.resolve(POR_ENLACE));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        MoverReserva,
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(parametros)) } },
        { provide: Reservas, useValue: { hora } },
        { provide: ReservasPublicas, useValue: { porToken } },
      ],
    });
    const mover = TestBed.inject(MoverReserva);
    // Los `resource` arrancan con el primer ciclo de la aplicación.
    mover.origen();
    await TestBed.inject(ApplicationRef).whenStable();

    return { mover, hora, porToken };
  };

  it('**por su id: la cancha y la hora que tenía, aunque el día que se mira sea otro**', async () => {
    const { mover, hora } = await montar({ mover: '7' });

    expect(hora).toHaveBeenCalledWith(7);
    expect(mover.origen()).toEqual({
      folio: 'AB23CDE',
      nombre: 'Carolina Díaz',
      canchaId: 2,
      cancha: 'Cancha 2',
      inicio: '2026-08-17T16:30:00.000Z',
      fin: '2026-08-17T17:30:00.000Z',
    });
  });

  it('**por el enlace: de la reserva que ya se pide para la diferencia**', async () => {
    const { mover, hora, porToken } = await montar({ moverToken: 'tok-123' });

    expect(porToken).toHaveBeenCalledWith('tok-123');
    expect(hora).not.toHaveBeenCalled();
    expect(mover.origen()).toEqual({
      folio: 'VIS1234',
      nombre: 'Camila Visitante',
      canchaId: 3,
      cancha: 'Cancha 3',
      inicio: '2026-08-18T13:00:00.000Z',
      fin: '2026-08-18T14:30:00.000Z',
    });
  });

  it('sin modo mover no hay origen, ni se pide nada', async () => {
    const { mover, hora, porToken } = await montar({});

    expect(mover.origen()).toBeNull();
    expect(hora).not.toHaveBeenCalled();
    expect(porToken).not.toHaveBeenCalled();
  });
});
