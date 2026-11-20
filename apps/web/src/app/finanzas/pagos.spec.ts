import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { TestBed } from '@angular/core/testing';
import { MatSelectHarness } from '@angular/material/select/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FilaDePago, FiltroDePagos, ListadoDePagos, PagosDelClub, parametrosDe } from './pagos.service';
import { PagosPanel } from './pagos';

/**
 * T398 (`SPEC-panel.md` § Los pagos del club, F1, F3 y F4). Finanzas › Pagos: los filtros, el
 * resumen, la tabla con su orden y su página, y la planilla del mismo filtro. Todo lo elegido
 * viaja en la dirección, como en Personas.
 */
describe('PagosPanel', () => {
  const PAGADA: FilaDePago = {
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
  };
  const DEL_MESON: FilaDePago = {
    origen: 'cuota',
    id: 9,
    fecha: '2039-02-12T15:00:00.000Z',
    concepto: 'CUOTA',
    detalle: 'Cuota mar 2039',
    quien: 'Sofía Socia',
    esSocio: true,
    medio: 'EFECTIVO',
    tipoPago: null,
    montoClp: 25000,
    estado: 'MESON',
    referencia: null,
    codigoAutorizacion: null,
    porRevisar: false,
  };

  const montar = async (
    url: Record<string, string> = {},
    listado: Partial<ListadoDePagos> = {},
  ) => {
    const listar = vi.fn().mockResolvedValue({
      pagos: [DEL_MESON, PAGADA],
      total: 2,
      pagina: 1,
      porPagina: 50,
      resumen: { cobradoClp: 37000, devueltoClp: 15000, porRevisar: 1 },
      ...listado,
    });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: PagosDelClub,
          useValue: {
            listar,
            // Con los parámetros de verdad: son los mismos que viajan a la API.
            urlDelCsv: (filtro: FiltroDePagos) =>
              `/api/admin/pagos.csv?${new URLSearchParams(parametrosDe(filtro))}`,
          },
        },
      ],
    });
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(PagosPanel);
    // Lo que trae la URL: el router se lo da como inputs.
    for (const [nombre, valor] of Object.entries(url)) fixture.componentRef.setInput(nombre, valor);
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, listar, navegar };
  };

  /** Lo que se pidió que cambie en la URL, sin el resto de las opciones. */
  const cambioEnLaUrl = (navegar: ReturnType<typeof vi.spyOn>) =>
    (navegar.mock.lastCall![1] as { queryParams: object }).queryParams;
  const texto = (nodo: Element | null) => (nodo?.textContent ?? '').replace(/\s+/g, ' ').trim();

  beforeEach(() => vi.setSystemTime('2039-02-15T15:00:00.000Z'));
  afterEach(() => vi.useRealTimers());

  it('**por omisión pide el mes en curso, del más nuevo al más viejo**', async () => {
    const { listar } = await montar();

    expect(listar).toHaveBeenCalledWith(
      {
        desde: '2039-02-01',
        hasta: '2039-02-28',
        conceptos: [],
        estado: null,
        medio: null,
        q: '',
        porRevisar: false,
        orden: 'fecha',
        direccion: 'desc',
      },
      1,
    );
  });

  it('**pide a la API lo que dice la URL**', async () => {
    const { listar } = await montar({
      desde: '2039-03-01',
      hasta: '2039-03-31',
      concepto: 'RESERVA,CUOTA',
      estado: 'ANULADA',
      medio: 'WEBPAY',
      q: 'camila',
      porRevisar: 'true',
      orden: 'monto',
      direccion: 'asc',
      pagina: '2',
    });

    expect(listar).toHaveBeenCalledWith(
      {
        desde: '2039-03-01',
        hasta: '2039-03-31',
        conceptos: ['RESERVA', 'CUOTA'],
        estado: 'ANULADA',
        medio: 'WEBPAY',
        q: 'camila',
        porRevisar: true,
        orden: 'monto',
        direccion: 'asc',
      },
      2,
    );
  });

  it('lo que no se entiende en la URL vale por lo de siempre', async () => {
    const { listar } = await montar({
      desde: '2039-02-30',
      concepto: 'PEDIDO',
      estado: 'PAGADA',
      orden: 'nombre',
      pagina: 'cero',
    });

    expect(listar).toHaveBeenCalledWith(
      expect.objectContaining({ desde: '2039-02-01', conceptos: [], estado: null, orden: 'fecha' }),
      1,
    );
  });

  it('**el resumen del filtro: lo cobrado, lo devuelto y lo que falta revisar**', async () => {
    const { el } = await montar();
    const resumen = texto(el.querySelector('[data-resumen]'));

    expect(resumen).toContain('Cobrado');
    expect(resumen).toContain('$37.000');
    expect(resumen).toContain('Devuelto');
    expect(resumen).toContain('$15.000');
    expect(resumen).toContain('Por revisar');
  });

  it('**una fila por pago: qué, quién, por dónde, cuánto y en qué quedó**', async () => {
    const { el } = await montar();
    const filas = [...el.querySelectorAll('tr[mat-row]')].map(texto);

    expect(filas).toHaveLength(2);
    expect(filas[1]).toContain('Reserva T396RPA · Cancha 3, vie 10 feb 10:00');
    expect(filas[1]).toContain('Camila Pagada');
    expect(filas[1]).toContain('Visitante');
    expect(filas[1]).toContain('Webpay · débito');
    expect(filas[1]).toContain('$12.000');
    expect(filas[1]).toContain('Autorizado');
    expect(filas[1]).toContain('Por revisar');
    expect(filas[0]).toContain('Socio');
    expect(filas[0]).toContain('Efectivo');
    expect(filas[0]).toContain('Pagado en el mesón');
  });

  it('**los chips de concepto filtran, y filtrar vuelve a la primera página**', async () => {
    const { el, fixture, navegar } = await montar({ pagina: '3' });
    const chips = [...el.querySelectorAll<HTMLElement>('mat-chip-option')];

    expect(chips.map(texto)).toEqual(['Reservas', 'Cuotas', 'Inscripciones']);
    chips[1].querySelector<HTMLElement>('button')!.click();
    fixture.detectChanges();

    expect(cambioEnLaUrl(navegar)).toEqual({ concepto: 'CUOTA', pagina: null });
  });

  it('el medio, la búsqueda y «Solo por revisar» van a la URL', async () => {
    const { el, fixture, navegar } = await montar();

    [...el.querySelectorAll<HTMLButtonElement>('mat-button-toggle button')]
      .find((boton) => texto(boton) === 'Webpay')!
      .click();
    fixture.detectChanges();
    expect(cambioEnLaUrl(navegar)).toEqual({ medio: 'WEBPAY', pagina: null });

    el.querySelector<HTMLButtonElement>('mat-slide-toggle button')!.click();
    fixture.detectChanges();
    expect(cambioEnLaUrl(navegar)).toEqual({ porRevisar: 'true', pagina: null });

    const campo = el.querySelector<HTMLInputElement>('input[name="busqueda"]')!;
    campo.value = 'camila';
    campo.dispatchEvent(new Event('input'));
    el.querySelector('form[role="search"]')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(cambioEnLaUrl(navegar)).toEqual({ q: 'camila', pagina: null });
  });

  it('el estado se elige en un select, y «Todos» lo quita', async () => {
    const { fixture, navegar } = await montar();
    const estado = await TestbedHarnessEnvironment.loader(fixture).getHarness(
      MatSelectHarness.with({ selector: '[data-estado]' }),
    );

    await estado.open();
    await estado.clickOptions({ text: 'Devuelto' });
    expect(cambioEnLaUrl(navegar)).toEqual({ estado: 'ANULADA', pagina: null });
  });

  it('**el rango de fechas se aplica, y vuelve a la primera página**', async () => {
    const { el, fixture, navegar } = await montar();
    const [inicio, fin] = [...el.querySelectorAll<HTMLInputElement>('mat-date-range-input input')];

    inicio.value = '01-03-2039';
    inicio.dispatchEvent(new Event('input'));
    fin.value = '31-03-2039';
    fin.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(cambioEnLaUrl(navegar)).toEqual({
      desde: '2039-03-01',
      hasta: '2039-03-31',
      pagina: null,
    });
  });

  it('**ordenar por monto va a la URL, del mayor al menor, y vuelve a la primera página**', async () => {
    const { el, fixture, navegar } = await montar({ pagina: '2' });
    const monto = [...el.querySelectorAll<HTMLElement>('th[mat-sort-header]')].find((th) =>
      texto(th).includes('Monto'),
    )!;

    monto.querySelector<HTMLElement>('.mat-sort-header-container')!.click();
    fixture.detectChanges();

    expect(cambioEnLaUrl(navegar)).toEqual({ orden: 'monto', direccion: 'desc', pagina: null });
  });

  it('**pagina en el servidor**: con más de 50, el paginador va a la URL', async () => {
    const { el, fixture, navegar } = await montar({}, { total: 120 });

    expect(el.querySelector('mat-paginator')?.getAttribute('aria-label')).toBe('Páginas de pagos');
    el.querySelector<HTMLButtonElement>('.mat-mdc-paginator-navigation-next')!.click();
    fixture.detectChanges();

    expect(cambioEnLaUrl(navegar)).toEqual({ pagina: 2 });
  });

  it('**la planilla lleva el mismo filtro**', async () => {
    const { el } = await montar({ concepto: 'CUOTA', medio: 'EFECTIVO' });
    const enlace = el.querySelector('app-descargar-csv a')!.getAttribute('href')!;

    expect(enlace).toContain('/api/admin/pagos.csv?');
    expect(enlace).toContain('concepto=CUOTA');
    expect(enlace).toContain('medio=EFECTIVO');
  });

  it('sin pagos, lo dice y sugiere otro filtro', async () => {
    const { el } = await montar({}, { pagos: [], total: 0 });

    expect(texto(el.querySelector('app-estado-vacio'))).toContain('Ningún pago coincide');
    expect(el.querySelector('table')).toBeNull();
  });

  it('dice que las reservas cobradas en el mesón no aparecen', async () => {
    const { el } = await montar();

    expect(texto(el)).toContain('Las reservas de visitante cobradas en el mesón no aparecen');
  });

  it('la tabla tiene nombre, y su contenedor se recorre con el teclado', async () => {
    const { el } = await montar();

    expect(el.querySelector('table')?.getAttribute('aria-label')).toBe('Pagos del club');
    const region = el.querySelector('[role="region"]');
    expect(region?.getAttribute('tabindex')).toBe('0');
    expect(region?.getAttribute('aria-label')).toBe('Pagos del club');
  });
});
