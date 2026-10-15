import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { responder, textoDelDialogo } from '../../../testing/dialogos';
import { avisoDeLoHecho } from '../../../testing/snackbar';
import { InvitacionPendiente, Socios } from '../socios.service';
import { InvitacionesPendientes } from './invitaciones-pendientes';

/**
 * T299 (SPEC-panel.md D14). Las invitaciones de socio de antes de pedir cuenta se cumplen
 * cuando esa persona se registra, pero ya no se crean. Estaban en el padrón, que se va: Personas
 * las muestra con el filtro Socios, y se pueden revocar.
 */
describe('Las invitaciones de socio pendientes', () => {
  const CAMILA: InvitacionPendiente = {
    id: 5,
    email: 'camila@ejemplo.cl',
    numeroSocio: '042',
    alDiaHasta: '2026-10-31',
    creadaEn: '2026-09-01T12:00:00.000Z',
  };

  const montar = async (invitaciones: InvitacionPendiente[]) => {
    const api = {
      listado: vi.fn().mockResolvedValue({ socios: [], invitaciones }),
      revocar: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({ providers: [{ provide: Socios, useValue: api }] });
    const fixture = TestBed.createComponent(InvitacionesPendientes);
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, api, el: fixture.nativeElement as HTMLElement };
  };

  it('sin invitaciones pendientes no dice nada', async () => {
    const { el } = await montar([]);

    expect(el.textContent?.trim()).toBe('');
  });

  it('**con invitaciones, avisa cuántas y las lista**', async () => {
    const { el } = await montar([CAMILA, { ...CAMILA, id: 6, email: 'beto@ejemplo.cl' }]);
    const texto = el.textContent!.replace(/\s+/g, ' ');

    expect(texto).toContain('2 invitaciones de socio siguen pendientes');
    expect(texto).toContain('camila@ejemplo.cl');
    expect(texto).toContain('beto@ejemplo.cl');
  });

  it('**revocar pregunta antes**: sin cuenta, ya no se puede volver a invitar', async () => {
    const { el, fixture, api } = await montar([CAMILA]);
    const revocar = () =>
      [...el.querySelectorAll<HTMLButtonElement>('button')]
        .find((boton) => boton.textContent?.includes('Revocar'))!
        .click();

    revocar();
    await fixture.whenStable();
    expect(textoDelDialogo()).toContain('camila@ejemplo.cl');
    await responder(fixture, false);
    expect(api.revocar).not.toHaveBeenCalled();

    revocar();
    await fixture.whenStable();
    await responder(fixture, true);
    expect(api.revocar).toHaveBeenCalledWith(5);
    expect(avisoDeLoHecho()).toContain('Se anuló la invitación de camila@ejemplo.cl');
    expect(api.listado).toHaveBeenCalledTimes(2);
  });
});
