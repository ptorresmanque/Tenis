import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IngresoPanel } from './ingreso';
import { Reportes, ReporteDeIngreso } from './reportes.service';

/**
 * T57. El reporte de ingreso, en el panel.
 *
 * Lo que este archivo cuida: que **la pantalla no deje leer un total como si fuera toda
 * la plata del mes**. El reporte de un mes cambia después de cerrado —una cuota de
 * agosto pagada en octubre suma a agosto—, y sin decirlo el club toma una decisión de
 * inversión con un número que todavía se está moviendo.
 */
describe('IngresoPanel', () => {
  const REPORTE: ReporteDeIngreso = {
    desde: '2026-08-01',
    hasta: '2026-08-31',
    corte: 'condicion',
    totalClp: 530000,
    filas: [
      { etiqueta: 'Techada', montoClp: 320000 },
      { etiqueta: 'Abierta', montoClp: 210000 },
    ],
    cuotasImpagasClp: 75000,
    calculadoEn: '2026-08-25T14:30:00.000Z',
  };

  let fixture: ComponentFixture<IngresoPanel>;
  let api: {
    ingreso: ReturnType<typeof vi.fn>;
    csv: ReturnType<typeof vi.fn>;
  };

  const montar = async (reporte: ReporteDeIngreso | Error = REPORTE) => {
    api = {
      ingreso: vi.fn(() =>
        reporte instanceof Error ? Promise.reject(reporte) : Promise.resolve(reporte),
      ),
      csv: vi.fn().mockReturnValue('/api/admin/reportes/ingreso.csv?x=1'),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: Reportes, useValue: api }],
    });

    fixture = TestBed.createComponent(IngresoPanel);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const texto = () => elemento().textContent ?? '';

  const filas = () =>
    Array.from(elemento().querySelectorAll('tbody tr')).map((fila) =>
      Array.from(fila.querySelectorAll('th, td')).map((celda) => celda.textContent?.trim() ?? ''),
    );

  beforeEach(async () => {
    await montar();
  });

  it('muestra una fila por corte, con su monto en pesos', () => {
    expect(filas()[0][0]).toBe('Techada');
    expect(filas()[0][1]).toContain('320.000');
  });

  it('muestra el total del período', () => {
    expect(texto()).toContain('530.000');
  });

  it('**avisa que el total todavía se puede mover**', () => {
    // Sin esto, el club lee el ingreso de un mes reciente como si estuviera cerrado.
    expect(texto()).toContain('75.000');
    expect(texto()).toContain('sin cobrar');
  });

  it('no habla de cuotas impagas cuando no hay ninguna', async () => {
    await montar({ ...REPORTE, cuotasImpagasClp: 0 });

    expect(texto()).not.toContain('sin cobrar');
  });

  it('**dice cuándo se calculó**', () => {
    // El mismo rango puede dar otro número mañana; sin la marca, dos capturas de
    // pantalla distintas parecen un error del sistema.
    expect(texto()).toContain('agosto');
  });

  it('**y lo dice en el día del club, no en el de UTC**', async () => {
    // A las 02:00Z de un 26 en Santiago todavía es 25. Recortando los diez primeros
    // caracteres del ISO, el reporte decía que se había calculado mañana.
    await montar({ ...REPORTE, calculadoEn: '2026-08-26T02:00:00.000Z' });

    expect(texto()).toContain('25 de agosto de 2026');
  });

  it('arranca en el mes corriente y por condición, que es la pregunta del club', () => {
    const [desde, hasta, corte] = api.ingreso.mock.calls[0] as string[];

    expect(desde.slice(8)).toBe('01');
    expect(hasta.slice(0, 7)).toBe(desde.slice(0, 7));
    expect(corte).toBe('condicion');
  });

  it('cambiar el corte vuelve a pedir el reporte', async () => {
    const selector = elemento().querySelector<HTMLSelectElement>('select[name="corte"]')!;
    selector.value = 'cancha';
    selector.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.ingreso).toHaveBeenCalledTimes(2);
    expect((api.ingreso.mock.calls[1] as string[])[2]).toBe('cancha');
  });

  it('cambiar el rango también', async () => {
    const campo = elemento().querySelector<HTMLInputElement>('input[name="desde"]')!;
    campo.value = '2026-07-01';
    campo.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect((api.ingreso.mock.calls[1] as string[])[0]).toBe('2026-07-01');
  });

  it('la tabla lleva encabezados', () => {
    const encabezados = Array.from(elemento().querySelectorAll('thead th[scope="col"]')).map((th) =>
      th.textContent?.trim(),
    );

    expect(encabezados).toEqual(['Corte', 'Ingreso']);
  });

  it('un período sin nada lo dice, en vez de mostrar una tabla vacía', async () => {
    await montar({
      ...REPORTE,
      totalClp: 0,
      filas: [],
      cuotasImpagasClp: 0,
    });

    expect(texto()).toContain('No hubo ingresos');
    expect(elemento().querySelector('tbody')).toBeNull();
  });

  // `value()` de un resource lanza en estado de error.
  it('si el reporte no carga, lo dice', async () => {
    await montar(new Error('la API no respondió'));

    expect(texto()).toContain('No se pudo calcular el ingreso');
  });
});
