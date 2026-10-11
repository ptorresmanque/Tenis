import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PadronPanel } from './padron';
import { ReporteDePadron, Reportes } from './reportes.service';

/**
 * El padrón en el tiempo, en el panel.
 *
 * Lo que este archivo cuida es la confusión que rompe el reporte: **cuatro cifras de
 * hoy y dos del período en la misma pantalla**. Leer "retirados hoy" como las bajas del
 * mes da un número que parece una fuga de socios y es el acumulado de años.
 */
describe('PadronPanel', () => {
  const REPORTE: ReporteDePadron = {
    desde: '2026-01-01',
    hasta: '2026-08-31',
    activosHoy: 120,
    suspendidosHoy: 7,
    retiradosHoy: 43,
    altasDelPeriodo: 9,
    bajasDelPeriodo: 4,
    meses: [
      {
        periodo: '2026-07',
        altas: 5,
        bajas: 1,
        deudaClp: 75000,
        sociosConDeuda: 3,
      },
      {
        periodo: '2026-08',
        altas: 4,
        bajas: 3,
        deudaClp: 0,
        sociosConDeuda: 0,
      },
    ],
    calculadoEn: '2026-08-25T14:30:00.000Z',
  };

  let fixture: ComponentFixture<PadronPanel>;
  let api: { padron: ReturnType<typeof vi.fn>; csv: ReturnType<typeof vi.fn> };

  const montar = async (reporte: ReporteDePadron | Error = REPORTE) => {
    api = {
      padron: vi.fn(() =>
        reporte instanceof Error ? Promise.reject(reporte) : Promise.resolve(reporte),
      ),
      csv: vi.fn().mockReturnValue('/api/admin/reportes/padron.csv?x=1'),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: Reportes, useValue: api }],
    });

    fixture = TestBed.createComponent(PadronPanel);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const texto = () => elemento().textContent ?? '';

  const filas = () =>
    Array.from(elemento().querySelectorAll('tbody tr')).map((fila) =>
      Array.from(fila.querySelectorAll('th, td')).map(
        (celda) => celda.textContent?.trim() ?? '',
      ),
    );

  const tarjetas = () =>
    Array.from(elemento().querySelectorAll('dl div')).map((tarjeta) => [
      tarjeta.querySelector('dt')?.textContent?.trim() ?? '',
      tarjeta.querySelector('dd')?.textContent?.trim() ?? '',
    ]);

  beforeEach(async () => {
    await montar();
  });

  it('**pone las bajas del mes junto a las altas**', () => {
    // La serie del padrón se lee de a pares: sin la baja al lado, cinco altas parecen
    // crecimiento aunque el club haya perdido seis socios ese mismo mes.
    expect(filas()[1]).toEqual(['2026-08', '4', '3', '$0', '0']);
  });

  it('el total del período tiene su tarjeta', () => {
    expect(tarjetas()).toContainEqual(['Bajas del período', '4']);
  });

  it('**distingue lo de hoy de lo del período en la propia etiqueta**', () => {
    // 43 retirados hoy y 4 bajas del período son cifras que sin etiqueta se leen como
    // si una contradijera a la otra.
    expect(tarjetas()).toContainEqual(['Retirados hoy', '43']);
    expect(texto()).toContain('son de hoy');
  });

  it('dice qué cuenta como baja, para que el club pueda discutir la cifra', () => {
    // La frase entera y no la palabra "panel" suelta: lo que hay que proteger es la
    // afirmación —qué hecho produce una baja—, no que aparezca una palabra común.
    expect(texto()).toContain('retirado desde el panel');
  });

  it('un rango sin meses lo dice, en vez de una tabla vacía', async () => {
    await montar({ ...REPORTE, meses: [] });

    expect(texto()).toContain('No hay meses en este rango');
  });

  it('**ofrece el CSV del mismo rango que se está mirando**', () => {
    const enlace = elemento().querySelector<HTMLAnchorElement>('a[download]');

    expect(enlace).not.toBeNull();
    expect(api.csv).toHaveBeenCalledWith(
      'padron',
      expect.any(String),
      expect.any(String),
    );
  });

  it('cambiar el rango vuelve a pedir el reporte', async () => {
    const campo = elemento().querySelector<HTMLInputElement>(
      'input[name="hasta"]',
    )!;
    campo.value = '2026-09-30';
    // El de Material lee lo escrito con `input` y lo entrega con `change`.
    campo.dispatchEvent(new Event('input'));
    campo.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect((api.padron.mock.calls[1] as string[])[1]).toBe('2026-09-30');
  });

  // `value()` de un resource lanza en estado de error.
  it('si el reporte no carga, lo dice', async () => {
    await montar(new Error('la API no respondió'));

    expect(texto()).toContain('No se pudo calcular el padrón');
  });
});
