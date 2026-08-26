import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NoUsoPanel } from './no-uso';
import { Reportes, ReporteDeNoUso } from './reportes.service';

/**
 * T59. Las horas reservadas y no usadas, en el panel.
 *
 * Es el indicador que el objetivo específico 4 del perfil compara antes y después del
 * sistema. Lo que este archivo cuida: que **la pantalla no deje leer un número bajo como
 * una buena noticia** cuando lo que pasa es que la bandeja de reportes está sin revisar.
 */
describe('NoUsoPanel', () => {
  const REPORTE: ReporteDeNoUso = {
    desde: '2026-08-01',
    hasta: '2026-08-31',
    corte: 'mes',
    noUsadas: 12,
    reservadas: 200,
    porcentaje: 6,
    sinResolver: 4,
    filas: [{ etiqueta: '2026-08', noUsadas: 12, reservadas: 200, porcentaje: 6 }],
    calculadoEn: '2026-08-25T14:30:00.000Z',
  };

  let fixture: ComponentFixture<NoUsoPanel>;
  let api: { noUso: ReturnType<typeof vi.fn>; csv: ReturnType<typeof vi.fn> };

  const montar = async (reporte: ReporteDeNoUso = REPORTE) => {
    api = {
      noUso: vi.fn().mockResolvedValue(reporte),
      csv: vi.fn().mockReturnValue('/api/admin/reportes/no-uso.csv?x=1'),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: Reportes, useValue: api }],
    });

    fixture = TestBed.createComponent(NoUsoPanel);
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

  it('muestra las no usadas sobre el total reservado', () => {
    expect(filas()[0]).toEqual(['2026-08', '12', '200', '6 %']);
  });

  it('**avisa cuántos reportes están sin revisar**', () => {
    // Sin esto, un 6 % se lee como que el club anda bien cuando lo que pasa es que
    // hay cuatro reportes que nadie miró.
    expect(texto()).toContain('4');
    expect(texto()).toContain('sin revisar');
  });

  it('no habla de pendientes cuando no hay ninguno', async () => {
    await montar({ ...REPORTE, sinResolver: 0 });

    expect(texto()).not.toContain('sin revisar');
  });

  it('**explica que solo cuentan los reportes que el club confirmó**', () => {
    expect(texto()).toContain('confirm');
  });

  it('un período sin reservas no dice 0 %', async () => {
    // Cero por ciento de nada no es una buena noticia, es que no hubo nada.
    await montar({
      ...REPORTE,
      noUsadas: 0,
      reservadas: 0,
      porcentaje: null,
      filas: [{ etiqueta: '2026-08', noUsadas: 0, reservadas: 0, porcentaje: null }],
    });

    expect(filas()[0]).toEqual(['2026-08', '0', '0', 'Sin reservas']);
  });

  it('**ofrece el CSV con el mismo rango y corte que se está mirando**', () => {
    // Si el enlace no llevara el corte, el club descargaría otra cosa de la que ve.
    const enlace = elemento().querySelector<HTMLAnchorElement>('a[download]');

    expect(enlace).not.toBeNull();
    expect(api.csv).toHaveBeenCalledWith('no-uso', expect.any(String), expect.any(String), 'mes');
  });

  it('cambiar el corte vuelve a pedir el reporte', async () => {
    const selector = elemento().querySelector<HTMLSelectElement>('select[name="corte"]')!;
    selector.value = 'cancha';
    selector.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect((api.noUso.mock.calls[1] as string[])[2]).toBe('cancha');
  });

  it('sin nada que medir lo dice, en vez de una tabla vacía', async () => {
    await montar({ ...REPORTE, filas: [], reservadas: 0, noUsadas: 0 });

    expect(texto()).toContain('No hubo reservas');
  });
});
