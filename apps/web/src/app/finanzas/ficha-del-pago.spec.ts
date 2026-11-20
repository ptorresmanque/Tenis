import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { avisoDeLoHecho } from '../testing/snackbar';
import { FichaDelPago } from './ficha-del-pago';
import { FichaDePago, OrigenDelPago, PagosDelClub } from './pagos.service';

/**
 * T399 (`SPEC-panel.md` § Los pagos del club, F5–F8). La ficha de un pago: lo que dijo Webpay, la
 * devolución y la revisión, lo pagado con su enlace, y las dos acciones, que confirman dentro de
 * la misma ficha y piden el motivo o la nota.
 */
describe('FichaDelPago', () => {
  const AUTORIZADO: FichaDePago = {
    fila: {
      origen: 'webpay',
      id: 7,
      fecha: '2039-02-05T15:00:00.000Z',
      concepto: 'RESERVA',
      detalle: 'Reserva T396RPA · Cancha 3, vie 10 feb 10:00',
      quien: 'Camila Pagada',
      esSocio: false,
      medio: 'WEBPAY',
      tipoPago: 'VD',
      montoClp: 12000,
      estado: 'AUTORIZADA',
      referencia: 'R-2039-0007',
      codigoAutorizacion: '1213',
      porRevisar: true,
    },
    webpay: {
      id: 7,
      referencia: 'R-2039-0007',
      montoClp: 12000,
      estado: 'AUTORIZADA',
      pasarela: 'webpay',
      codigoAutorizacion: '1213',
      ultimosDigitos: '6623',
      creadaEn: '2039-02-05T14:58:00.000Z',
      confirmadaEn: '2039-02-05T15:00:00.000Z',
      requiereRevision: true,
      tipoPago: 'VD',
      numeroCuotas: 0,
      codigoRespuesta: 0,
      motivoRechazo: null,
      revisadaPor: null,
      revisadaEn: null,
      notaRevision: null,
      anuladaPor: null,
      anuladaEn: null,
      motivoAnulacion: null,
      revisadaPorNombre: null,
      anuladaPorNombre: null,
    },
    registradaPor: null,
    asociadoA: {
      tipo: 'RESERVA',
      id: 41,
      texto: 'Reserva T396RPA · Cancha 3, vie 10 feb 10:00',
      enlace: '/administracion/reservas?fecha=2039-02-10&reserva=41',
    },
    devolucion: { permitida: true, motivo: null, enlace: null },
  };

  let fixture: ComponentFixture<FichaDelPago> | undefined;
  let api: { ficha: ReturnType<typeof vi.fn>; revisar: ReturnType<typeof vi.fn>; devolver: ReturnType<typeof vi.fn> };
  let cambios: number;

  const dialogo = () => document.querySelector('mat-dialog-container') as HTMLElement;
  const texto = () => (dialogo()?.textContent ?? '').replace(/\s+/g, ' ');
  const limpio = (nodo: Element | null | undefined) =>
    (nodo?.textContent ?? '').replace(/\s+/g, ' ').trim();
  /** Lo que dice una lista de definiciones: cada `dt` con su `dd`. */
  const definiciones = (selector: string) =>
    Object.fromEntries(
      [...dialogo().querySelectorAll(`${selector} dt`)].map((dt) => [
        limpio(dt),
        limpio(dt.nextElementSibling),
      ]),
    );
  const boton = (nombre: string) =>
    [...dialogo().querySelectorAll<HTMLButtonElement>('button')].find(
      (uno) => uno.textContent?.replace(/\s+/g, ' ').trim() === nombre,
    );
  const actualizar = async () => {
    await fixture!.whenStable();
    fixture!.detectChanges();
  };
  const escribir = async (valor: string) => {
    const campo = dialogo().querySelector<HTMLTextAreaElement>('textarea')!;
    campo.value = valor;
    campo.dispatchEvent(new Event('input'));
    await actualizar();
  };

  const montar = async (ficha: FichaDePago = AUTORIZADO, origen: OrigenDelPago = 'webpay') => {
    fixture?.destroy();
    await new Promise((listo) => setTimeout(listo));
    api = {
      ficha: vi.fn(() => Promise.resolve(ficha)),
      revisar: vi.fn(() => Promise.resolve(ficha)),
      devolver: vi.fn(() => Promise.resolve(ficha)),
    };
    cambios = 0;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: PagosDelClub, useValue: api }],
    });
    fixture = TestBed.createComponent(FichaDelPago);
    fixture.componentRef.setInput('origen', origen);
    fixture.componentRef.setInput('id', ficha.fila.id);
    fixture.componentInstance.cambio.subscribe(() => cambios++);
    await actualizar();
  };

  afterEach(() => {
    fixture?.destroy();
    fixture = undefined;
  });

  it('**dice lo que dijo Webpay**: la orden de compra, la autorización, la tarjeta y el tipo de pago (F5)', async () => {
    await montar();
    const webpay = definiciones('[data-webpay]');

    expect(api.ficha).toHaveBeenCalledWith('webpay', 7);
    expect(webpay['Orden de compra']).toBe('R-2039-0007');
    expect(webpay['Autorización']).toBe('1213');
    expect(webpay['Tarjeta']).toBe('terminada en 6623');
    expect(webpay['Tipo de pago']).toBe('Débito');
    expect(webpay['Cuotas']).toBe('0');
    expect(webpay['Código de respuesta']).toBe('0');
    expect(webpay['Motivo del rechazo']).toBeUndefined();
    expect(texto()).toContain('$12.000');
    expect(texto()).toContain('Autorizado');
  });

  it('**en un pago anterior a la migración dice «No se guardó»** (F6)', async () => {
    await montar({
      ...AUTORIZADO,
      webpay: { ...AUTORIZADO.webpay!, tipoPago: null, numeroCuotas: null, codigoRespuesta: null },
    });
    const webpay = definiciones('[data-webpay]');

    expect(webpay['Tipo de pago']).toBe('No se guardó');
    expect(webpay['Cuotas']).toBe('No se guardó');
    expect(webpay['Código de respuesta']).toBe('No se guardó');
  });

  it('**el rechazado dice el motivo**, y no ofrece devolver (F6)', async () => {
    await montar({
      ...AUTORIZADO,
      fila: { ...AUTORIZADO.fila, estado: 'RECHAZADA', codigoAutorizacion: null },
      webpay: {
        ...AUTORIZADO.webpay!,
        estado: 'RECHAZADA',
        codigoAutorizacion: null,
        codigoRespuesta: -1,
        motivoRechazo: 'Rechazo de transacción',
        requiereRevision: false,
      },
      devolucion: { permitida: false, motivo: 'Solo se devuelve un pago autorizado.', enlace: null },
    });

    expect(definiciones('[data-webpay]')['Motivo del rechazo']).toBe('Rechazo de transacción');
    expect(texto()).toContain('Rechazado');
    expect(boton('Devolver')).toBeUndefined();
  });

  it('**lo pagado enlaza a su lugar en el panel: la reserva abre su ficha en la agenda** (F5)', async () => {
    await montar();
    const enlace = dialogo().querySelector<HTMLAnchorElement>('[data-asociado] a')!;

    expect(enlace.textContent).toContain('Reserva T396RPA');
    expect(enlace.getAttribute('href')).toBe('/administracion/reservas?fecha=2039-02-10&reserva=41');
  });

  it('**la devolución dice cuándo, quién y por qué**, y la automática se dice así', async () => {
    await montar({
      ...AUTORIZADO,
      fila: { ...AUTORIZADO.fila, estado: 'ANULADA' },
      webpay: {
        ...AUTORIZADO.webpay!,
        estado: 'ANULADA',
        anuladaPor: 3,
        anuladaPorNombre: 'Rodrigo Admin',
        anuladaEn: '2039-02-06T15:00:00.000Z',
        motivoAnulacion: 'Pagó dos veces la misma hora.',
      },
      devolucion: { permitida: false, motivo: 'Ya se devolvió.', enlace: null },
    });
    const devolucion = (dialogo().querySelector('[data-devolucion]')?.textContent ?? '').replace(/\s+/g, ' ');
    expect(devolucion).toContain('Rodrigo Admin');
    expect(devolucion).toContain('Pagó dos veces la misma hora.');

    await montar({
      ...AUTORIZADO,
      webpay: { ...AUTORIZADO.webpay!, estado: 'ANULADA', anuladaEn: '2039-02-06T15:00:00.000Z' },
      devolucion: { permitida: false, motivo: 'Ya se devolvió.', enlace: null },
    });
    expect(dialogo().querySelector('[data-devolucion]')?.textContent).toContain(
      'Automática, al cancelar',
    );
  });

  it('la revisión dice si falta o quién la hizo, con su nota', async () => {
    await montar();
    expect(dialogo().querySelector('[data-revision]')?.textContent).toContain('Por revisar');

    await montar({
      ...AUTORIZADO,
      webpay: {
        ...AUTORIZADO.webpay!,
        revisadaEn: '2039-02-07T15:00:00.000Z',
        revisadaPorNombre: 'Rodrigo Admin',
        notaRevision: 'Cuadra con la cartola.',
      },
    });
    const revision = (dialogo().querySelector('[data-revision]')?.textContent ?? '').replace(/\s+/g, ' ');
    expect(revision).toContain('Rodrigo Admin');
    expect(revision).toContain('Cuadra con la cartola.');
    expect(boton('Marcar como revisado')).toBeUndefined();
  });

  it('**«Devolver» confirma dentro de la ficha, con el monto y la tarjeta, y pide el motivo** (F8)', async () => {
    await montar();
    boton('Devolver')!.click();
    await actualizar();

    expect(texto()).toContain('¿Devolver $12.000 a la tarjeta terminada en 6623?');
    expect(boton('Devolver $12.000')).toBeDefined();

    // Sin motivo no se manda.
    boton('Devolver $12.000')!.click();
    await actualizar();
    expect(api.devolver).not.toHaveBeenCalled();

    await escribir('Pagó dos veces la misma hora.');
    boton('Devolver $12.000')!.click();
    await actualizar();

    expect(api.devolver).toHaveBeenCalledWith(7, 'Pagó dos veces la misma hora.');
    expect(avisoDeLoHecho()).toBe('Pago devuelto.');
    expect(cambios).toBe(1);
  });

  it('**con lo pagado todavía vigente, «Devolver» no se ofrece y se dice qué hacer, con el enlace** (F8)', async () => {
    await montar({
      ...AUTORIZADO,
      devolucion: {
        permitida: false,
        motivo: 'Primero cancela la reserva desde la agenda: todavía está vigente.',
        enlace: '/administracion/reservas?fecha=2039-02-10&reserva=41',
      },
    });

    expect(boton('Devolver')).toBeUndefined();
    const aviso = dialogo().querySelector('[data-sin-devolucion]')!;
    expect(aviso.textContent).toContain('Primero cancela la reserva desde la agenda');
    expect(aviso.querySelector('a')?.getAttribute('href')).toBe(
      '/administracion/reservas?fecha=2039-02-10&reserva=41',
    );
    expect(aviso.querySelector('a')?.textContent?.trim()).toBe('Ir a la reserva');
  });

  it('**«Marcar como revisado» pide la nota, avisa y deja la lista al día** (F7)', async () => {
    await montar();
    boton('Marcar como revisado')!.click();
    await actualizar();

    expect(texto()).toContain('¿Marcar como revisado el pago de Camila Pagada?');
    await escribir('Cuadra con la cartola.');
    boton('Marcar como revisado')!.click();
    await actualizar();

    expect(api.revisar).toHaveBeenCalledWith(7, 'Cuadra con la cartola.');
    expect(avisoDeLoHecho()).toBe('Pago marcado como revisado.');
    expect(cambios).toBe(1);
  });

  it('**el rechazo de la API se dice tal cual, y la ficha sigue en la confirmación**', async () => {
    await montar();
    api.devolver.mockRejectedValue(
      new HttpErrorResponse({
        status: 502,
        error: { message: 'La pasarela no hizo la devolución: La pasarela no aceptó la devolución.' },
      }),
    );
    boton('Devolver')!.click();
    await actualizar();
    await escribir('Motivo.');
    boton('Devolver $12.000')!.click();
    await actualizar();

    expect(texto()).toContain('La pasarela no aceptó la devolución.');
    expect(texto()).toContain('¿Devolver $12.000');
    expect(cambios).toBe(0);
  });

  it('«Volver» deja la ficha como estaba', async () => {
    await montar();
    boton('Devolver')!.click();
    await actualizar();
    boton('Volver')!.click();
    await actualizar();

    expect(texto()).not.toContain('¿Devolver');
    expect(api.devolver).not.toHaveBeenCalled();
  });

  it('el cobro del mesón dice quién lo registró, y no tiene acciones', async () => {
    await montar(
      {
        ...AUTORIZADO,
        fila: { ...AUTORIZADO.fila, origen: 'cuota', id: 9, medio: 'EFECTIVO', estado: 'MESON', tipoPago: null },
        webpay: null,
        registradaPor: 'Rodrigo Admin',
        asociadoA: { tipo: 'CUOTA', id: 9, texto: 'Cuota mar 2039', enlace: '/administracion/personas/5' },
        devolucion: null,
      },
      'cuota',
    );

    expect(definiciones('[data-pago]')['Registrado por']).toBe('Rodrigo Admin');
    expect(texto()).toContain('Pagado en el mesón');
    expect(dialogo().querySelector('[data-webpay]')).toBeNull();
    expect(boton('Devolver')).toBeUndefined();
    expect(boton('Marcar como revisado')).toBeUndefined();
  });

  it('se cierra con el ícono del título, que tiene nombre', async () => {
    await montar();

    expect(dialogo().querySelector('button[aria-label="Cerrar la ficha"]')).not.toBeNull();
  });
});
