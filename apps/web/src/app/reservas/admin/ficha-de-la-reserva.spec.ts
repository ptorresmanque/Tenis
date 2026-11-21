import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Auth } from '../../core/auth/auth';
import { avisoDeLoHecho } from '../../testing/snackbar';
import { ReservaCancelada, Reservas } from '../reservas.service';
import { Agenda, PagosDeLaReserva, ReservaDelDia } from './agenda.service';
import { FichaDeLaReserva } from './ficha-de-la-reserva';

/**
 * T391 (`SPEC-panel.md` § Reservas del panel, R5, R6, R8 y R9). La ficha de una reserva dice cómo
 * se paga; al admin, además, lo que dijo Webpay, y le deja cancelarla con una confirmación dentro
 * de la misma ficha. El gestor ve la ficha y anota, nada más.
 */
describe('FichaDeLaReserva', () => {
  const UNA: ReservaDelDia = {
    id: 1,
    folio: 'AB23CDE',
    cancha: 'Cancha 1',
    canchaId: 1,
    // Las 08:00 del club el 17 de agosto.
    inicio: '2026-08-17T12:00:00.000Z',
    fin: '2026-08-17T13:00:00.000Z',
    estado: 'CONFIRMADA',
    nombre: 'Camila Visitante',
    telefono: '+56955556666',
    esSocio: false,
    socioId: null,
    acompanantes: [],
    observaciones: [],
    observacionesAnteriores: 0,
    pago: 'EN_LINEA',
  };

  const PAGADA: PagosDeLaReserva = {
    devolucionAlCancelar: true,
    pagos: [
      {
        id: 7,
        referencia: 'R-2026-0007',
        montoClp: 12000,
        estado: 'AUTORIZADA',
        pasarela: 'webpay',
        codigoAutorizacion: '1213',
        ultimosDigitos: '6623',
        creadaEn: '2026-08-10T15:00:00.000Z',
        confirmadaEn: '2026-08-10T15:02:00.000Z',
        requiereRevision: false,
        revisadaEn: null,
      },
    ],
  };

  let fixture: ComponentFixture<FichaDeLaReserva> | undefined;
  let pagosDe: ReturnType<typeof vi.fn>;
  let cancelar: ReturnType<typeof vi.fn>;
  let canceladas: ReservaCancelada[];
  let aModificar: ReservaDelDia[];

  const ficha = () => document.querySelector('mat-dialog-container') as HTMLElement;
  const texto = () => (ficha()?.textContent ?? '').replace(/\s+/g, ' ');
  const boton = (nombre: string) =>
    [...ficha().querySelectorAll<HTMLButtonElement>('button')].find(
      (uno) => uno.textContent?.trim() === nombre,
    );
  const actualizar = async () => {
    await fixture!.whenStable();
    fixture!.detectChanges();
  };

  const montar = async (
    cambios: { reserva?: ReservaDelDia; esAdmin?: boolean; pagos?: PagosDeLaReserva | Error } = {},
  ) => {
    fixture?.destroy();
    await new Promise((listo) => setTimeout(listo));
    pagosDe = vi.fn(() =>
      cambios.pagos instanceof Error
        ? Promise.reject(cambios.pagos)
        : Promise.resolve(cambios.pagos ?? PAGADA),
    );
    cancelar = vi.fn(() =>
      Promise.resolve({ folio: 'AB23CDE', huboDevolucion: true, motivo: null }),
    );
    canceladas = [];
    aModificar = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Agenda, useValue: { pagosDe } },
        { provide: Reservas, useValue: { cancelar } },
        { provide: Auth, useValue: { usuario: signal(null).asReadonly() } },
      ],
    });
    fixture = TestBed.createComponent(FichaDeLaReserva);
    fixture.componentRef.setInput('reserva', cambios.reserva ?? UNA);
    fixture.componentRef.setInput('esAdmin', cambios.esAdmin ?? true);
    fixture.componentInstance.cancelada.subscribe((una) => canceladas.push(una));
    fixture.componentInstance.modificar.subscribe((una) => aModificar.push(una));
    await actualizar();
  };

  beforeEach(async () => {
    // Las 07:00 del club ese día: la reserva todavía no empieza.
    vi.setSystemTime('2026-08-17T11:00:00.000Z');
    await montar();
  });

  afterEach(() => {
    fixture?.destroy();
    vi.useRealTimers();
  });

  it('**dice cómo se paga, con palabras**', () => {
    expect(texto()).toContain('Visitante');
    expect(texto()).toContain('Pagada en línea');
  });

  it('**al admin le muestra lo que dijo Webpay**: orden de compra, monto, autorización y tarjeta', () => {
    expect(pagosDe).toHaveBeenCalledWith(1);
    const pago = ficha().querySelector('[data-pagos]')?.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(pago).toContain('R-2026-0007');
    expect(pago).toContain('$12.000');
    expect(pago).toContain('Autorizado');
    expect(pago).toContain('1213');
    expect(pago).toContain('terminada en 6623');
  });

  it('**cada pago enlaza a su ficha en Finanzas › Pagos**, con el día en que se pagó (T399)', () => {
    const enlace = [...ficha().querySelectorAll<HTMLAnchorElement>('[data-pagos] a')].find((uno) =>
      uno.textContent?.includes('Ver en Finanzas › Pagos'),
    );

    expect(enlace?.getAttribute('href')).toBe(
      '/administracion/finanzas/pagos?pago=webpay-7&desde=2026-08-10&hasta=2026-08-10',
    );
    // Con la compra y la diferencia hay dos enlaces: el nombre dice cuál (revisión, T400).
    expect(enlace?.textContent).toContain('$12.000');
  });

  it('**la revisión dice lo mismo que Finanzas: «Por revisar» hasta que alguien la revisa**', async () => {
    const conMarca = { ...PAGADA.pagos[0], requiereRevision: true };
    await montar({ pagos: { ...PAGADA, pagos: [conMarca] } });
    const revision = () =>
      [...ficha().querySelectorAll('[data-pagos] dt')]
        .find((dt) => dt.textContent?.trim() === 'Revisión')
        ?.nextElementSibling?.textContent?.trim();
    expect(revision()).toBe('Por revisar');

    await montar({
      pagos: { ...PAGADA, pagos: [{ ...conMarca, revisadaEn: '2026-08-11T15:00:00.000Z' }] },
    });
    expect(revision()).toBe('Revisado');
  });

  it('**al gestor no**: ni el pago, ni pide los pagos, ni ofrece cancelar (R9)', async () => {
    await montar({ esAdmin: false });

    expect(pagosDe).not.toHaveBeenCalled();
    expect(ficha().querySelector('[data-pagos]')).toBeNull();
    expect(boton('Cancelar reserva')).toBeUndefined();
    // Sus observaciones sí: es para lo que entra a la ficha.
    expect(ficha().querySelector('app-observaciones-de-reserva')).not.toBeNull();
  });

  it('se cierra con el ícono del título, que tiene nombre', () => {
    const cerrar = ficha().querySelector('button[aria-label="Cerrar la ficha"]');

    expect(cerrar).not.toBeNull();
  });

  it('**«Cancelar reserva» pide confirmación dentro de la ficha, con lo que pasa con la plata** (R6)', async () => {
    boton('Cancelar reserva')!.click();
    await actualizar();

    expect(texto()).toContain('¿Cancelar la reserva de Camila Visitante?');
    expect(texto()).toContain('Se le devuelve todo lo pagado, $12.000, al mismo medio de pago.');
    expect(cancelar).not.toHaveBeenCalled();
    // El foco va a lo seguro (modern-web-guidance, dialog).
    expect(document.activeElement?.textContent?.trim()).toBe('Volver');
  });

  it('«Volver» deja la reserva como estaba', async () => {
    boton('Cancelar reserva')!.click();
    await actualizar();
    boton('Volver')!.click();
    await actualizar();

    expect(texto()).not.toContain('¿Cancelar la reserva');
    expect(cancelar).not.toHaveBeenCalled();
  });

  it('**confirmar la cancela y avisa a la agenda con lo que pasó**', async () => {
    boton('Cancelar reserva')!.click();
    await actualizar();
    boton('Cancelar reserva')!.click();
    await actualizar();

    expect(cancelar).toHaveBeenCalledWith(1);
    expect(canceladas).toEqual([{ folio: 'AB23CDE', huboDevolucion: true, motivo: null }]);
  });

  it('**avisa con el snackbar lo que pasó con la plata**', async () => {
    boton('Cancelar reserva')!.click();
    await actualizar();
    boton('Cancelar reserva')!.click();
    await actualizar();

    expect(avisoDeLoHecho()).toBe('Reserva AB23CDE cancelada. Se devolvió el pago.');
  });

  it('**avisa aunque la ficha se haya ido antes de que responda la API**', async () => {
    // El servidor avisa en vivo antes de responder el DELETE: la agenda vuelve a pedir el día,
    // la reserva ya no está y la ficha se va. La respuesta llega después, y el aviso tiene que
    // salir igual (lo encontró la prueba en el navegador, T391).
    let responder!: (valor: ReservaCancelada) => void;
    cancelar.mockReturnValue(new Promise<ReservaCancelada>((listo) => (responder = listo)));
    boton('Cancelar reserva')!.click();
    await actualizar();
    boton('Cancelar reserva')!.click();

    fixture!.destroy();
    fixture = undefined;
    responder({ folio: 'AB23CDE', huboDevolucion: false, motivo: 'sin_pago' });
    await new Promise((listo) => setTimeout(listo));

    expect(avisoDeLoHecho()).toBe('Reserva AB23CDE cancelada.');
  });

  it('al socio le dice que su cupo de ese día queda libre', async () => {
    await montar({
      reserva: { ...UNA, esSocio: true, socioId: 3, pago: 'SIN_COBRO' },
      pagos: { pagos: [], devolucionAlCancelar: false },
    });
    boton('Cancelar reserva')!.click();
    await actualizar();

    expect(texto()).toContain('Esa hora deja de contar en sus cupos: puede reservar otra.');
    expect(texto()).not.toContain('devuelve');
  });

  it('fuera de plazo, dice que el pago no se devuelve', async () => {
    await montar({ pagos: { ...PAGADA, devolucionAlCancelar: false } });
    boton('Cancelar reserva')!.click();
    await actualizar();

    // Ahora se puede devolver a mano: no se dice que nunca (revisión, T400).
    expect(texto()).toContain(
      'Ya pasó el plazo de devolución: al cancelar, el pago no se devuelve solo. Si corresponde, devuélvelo desde Finanzas › Pagos.',
    );
  });

  it('**si los pagos no cargaron, no le dice que no tiene pagos en línea**', async () => {
    await montar({ pagos: new Error('la API no respondió') });
    boton('Cancelar reserva')!.click();
    await actualizar();

    expect(texto()).not.toContain('No tiene pagos en línea');
    expect(texto()).toContain('No se pudieron cargar los pagos');
  });

  it('**el rechazo de la API se dice tal cual, y la ficha sigue abierta**', async () => {
    cancelar.mockRejectedValue(
      new HttpErrorResponse({
        status: 409,
        error: {
          motivo: 'PAGO_EN_CURSO',
          message: 'Esa hora tiene un pago en curso. Si no se completa, se libera sola en unos minutos.',
        },
      }),
    );
    boton('Cancelar reserva')!.click();
    await actualizar();
    boton('Cancelar reserva')!.click();
    await actualizar();

    expect(texto()).toContain('Esa hora tiene un pago en curso.');
    expect(canceladas).toEqual([]);
  });

  it('**la misma reserva, recargada por un aviso, no vuelve a pedir los pagos**', async () => {
    // Cada recarga del día trae objetos nuevos: pedir los pagos otra vez ponía el esqueleto en la
    // ficha y cambiaba la consecuencia en plena confirmación (revisión, T394).
    boton('Cancelar reserva')!.click();
    await actualizar();
    fixture!.componentRef.setInput('reserva', { ...UNA });
    await actualizar();

    expect(pagosDe).toHaveBeenCalledTimes(1);
    expect(texto()).toContain('Se le devuelve todo lo pagado');
  });

  it('**la consecuencia se lee junto con los botones de la confirmación**', async () => {
    // El foco va a «Volver», y el lector anunciaba solo el botón, no lo que pasa con la plata.
    boton('Cancelar reserva')!.click();
    await actualizar();

    for (const nombre of ['Volver', 'Cancelar reserva']) {
      const id = boton(nombre)!.getAttribute('aria-describedby');
      expect(id && document.getElementById(id)?.textContent).toContain('Se le devuelve todo lo pagado');
    }
  });

  it('**con el pago en curso no ofrece cancelar ni modificar, y dice por qué**', async () => {
    // La API los rechazaría con PAGO_EN_CURSO: la hora se libera sola si el pago no se completa.
    await montar({
      reserva: { ...UNA, estado: 'PENDIENTE_PAGO', pago: 'ESPERANDO' },
      pagos: { pagos: [], devolucionAlCancelar: false },
    });

    expect(boton('Cancelar reserva')).toBeUndefined();
    expect(boton('Modificar')).toBeUndefined();
    expect(texto()).toContain('Tiene un pago en curso');
  });

  it('**«Modificar» avisa a la agenda qué reserva mover** (R7, T392)', async () => {
    boton('Modificar')!.click();
    await actualizar();

    expect(aModificar).toEqual([UNA]);
  });

  it('«Modificar» va al borde y «Cancelar reserva» a su izquierda: en la confirmación, ese lugar es de «Volver»', () => {
    const acciones = [...ficha().querySelectorAll('mat-dialog-actions button')].map((uno) =>
      uno.textContent?.trim(),
    );

    expect(acciones).toEqual(['Cancelar reserva', 'Modificar']);
  });

  it('al gestor tampoco le ofrece modificar', async () => {
    await montar({ esAdmin: false });

    expect(boton('Modificar')).toBeUndefined();
  });

  it('**una reserva que ya terminó no ofrece cancelarla** (R8)', async () => {
    vi.setSystemTime('2026-08-17T13:30:00.000Z');
    await montar();

    expect(boton('Cancelar reserva')).toBeUndefined();
    expect(boton('Modificar')).toBeUndefined();
  });
});
