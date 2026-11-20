import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { BloqueDisponible, Cancha } from '../disponibilidad';
import { OrigenDelCambio } from './mover-reserva';
import { ResumenDelCambio } from './resumen-del-cambio';

/**
 * T402 (`SPEC-panel.md` § El modo mover a la vista, MV1 y MV2). La barra del cambio está desde
 * que empieza el modo mover: dice qué reserva se modifica, la hora que tenía y la nueva. Sin hora
 * elegida, la única salida es «Volver sin cambiar».
 */
describe('ResumenDelCambio', () => {
  const CANCHA: Cancha = {
    id: 1,
    nombre: 'Cancha 1',
    superficie: 'ARCILLA',
    techada: false,
    iluminacion: true,
  };

  /** De 12:00 a 13:00 del club, el lunes 17 de agosto. */
  const BLOQUE: BloqueDisponible = {
    inicio: '2026-08-17T16:00:00.000Z',
    fin: '2026-08-17T17:00:00.000Z',
    canchaId: 1,
    montoClp: 12000,
    esPico: false,
    bloqueado: false,
    motivoBloqueo: null,
    reservado: false,
  };

  /** La que tenía: la Cancha 2 a las 08:30 del mismo lunes. */
  const ANTES: OrigenDelCambio = {
    folio: 'AB23CDE',
    nombre: 'Carolina Díaz',
    canchaId: 2,
    cancha: 'Cancha 2',
    inicio: '2026-08-17T12:30:00.000Z',
    fin: '2026-08-17T13:30:00.000Z',
  };

  let fixture: ComponentFixture<ResumenDelCambio>;
  const raiz = () => fixture.nativeElement as HTMLElement;
  const texto = () => (raiz().textContent ?? '').replace(/\s+/g, ' ');
  const botones = () => [...raiz().querySelectorAll('button')].map((uno) => uno.textContent?.trim());

  const montar = (cambios: Record<string, unknown>) => {
    fixture = TestBed.createComponent(ResumenDelCambio);
    fixture.componentRef.setInput('pagadoClp', null);
    for (const [nombre, valor] of Object.entries(cambios)) fixture.componentRef.setInput(nombre, valor);
    fixture.detectChanges();
  };

  beforeEach(() => TestBed.resetTestingModule());

  it('**sin hora elegida: qué se modifica, la hora que tenía y que falta elegir la nueva**', () => {
    montar({ antes: ANTES, rotulo: 'Modificando · Reserva de Carolina Díaz' });

    expect(texto()).toContain('Modificando · Reserva de Carolina Díaz');
    expect(texto()).toContain('Antes');
    expect(texto()).toContain('Cancha 2 · Lun 17 ago · 08:30–09:30');
    expect(texto()).toContain('Nueva');
    expect(texto()).toContain('elige una hora en el tablero');
  });

  it('**sin hora elegida, la salida es «Volver sin cambiar»**', () => {
    montar({ antes: ANTES, rotulo: 'Modificando · Reserva de Carolina Díaz' });
    let volvio = false;
    fixture.componentInstance.volver.subscribe(() => (volvio = true));

    expect(botones()).toEqual(['Volver sin cambiar']);
    raiz().querySelector('button')!.click();
    expect(volvio).toBe(true);
  });

  it('**con hora elegida: las dos con su día, y «Soltar» y «Cambiar a esta hora»**', () => {
    montar({ antes: ANTES, rotulo: 'Modificando · Reserva de Carolina Díaz', cancha: CANCHA, bloque: BLOQUE });

    expect(texto()).toContain('Cancha 2 · Lun 17 ago · 08:30–09:30');
    expect(texto()).toContain('Cancha 1 · Lun 17 ago · 12:00–13:00');
    expect(texto()).not.toContain('elige una hora');
    expect(botones()).toEqual(['Soltar', 'Cambiar a esta hora']);
  });

  it('desde el enlace, la diferencia sigue debajo de la nueva, y el botón la paga', () => {
    montar({ antes: ANTES, rotulo: 'Cambiando tu reserva', cancha: CANCHA, bloque: BLOQUE, pagadoClp: 8000 });

    expect(texto()).toContain('Pagas $4.000 de diferencia.');
    expect(botones()).toEqual(['Soltar', 'Pagar $4.000']);
  });

  it('**mientras se envía el cambio no se puede soltar**: volver sin cambiar llegaría tarde (revisión, T405)', () => {
    montar({ antes: ANTES, rotulo: 'Cambiando tu reserva', cancha: CANCHA, bloque: BLOQUE, enviando: true });

    const soltar = [...raiz().querySelectorAll('button')].find((uno) => uno.textContent?.trim() === 'Soltar');
    expect(soltar?.disabled).toBe(true);
  });

  it('**al soltar, el foco pasa a «Volver sin cambiar»**, que toma el lugar del botón (revisión, T405)', async () => {
    montar({ antes: ANTES, rotulo: 'Cambiando tu reserva', cancha: CANCHA, bloque: BLOQUE });
    // Quien la usa suelta la hora: la barra pasa a «elige una hora».
    fixture.componentInstance.soltar.subscribe(() => {
      fixture.componentRef.setInput('cancha', null);
      fixture.componentRef.setInput('bloque', null);
    });

    [...raiz().querySelectorAll('button')].find((uno) => uno.textContent?.trim() === 'Soltar')!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.activeElement?.textContent?.trim()).toBe('Volver sin cambiar');
  });

  it('para el lector, el día va completo', () => {
    montar({ antes: ANTES, rotulo: 'Modificando · Reserva de Carolina Díaz' });

    expect(raiz().querySelector('.sr-only')?.textContent).toContain('lunes, 17 de agosto');
  });
});
