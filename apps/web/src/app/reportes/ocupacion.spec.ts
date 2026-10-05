import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OcupacionPanel } from './ocupacion';
import { Reportes, ReporteDeOcupacion } from './reportes.service';

/**
 * T58. La ocupación de cancha, en el panel.
 *
 * Lo que este archivo cuida: que **las horas cerradas se vean como su propia columna**.
 * Una cancha cerrada por riego no está ocupada ni desaprovechada, y esconderla en
 * cualquiera de los dos lados le da al club un número con el que decidir mal.
 */
describe('OcupacionPanel', () => {
  const REPORTE: ReporteDeOcupacion = {
    desde: '2026-08-01',
    hasta: '2026-08-31',
    corte: 'condicion',
    horas: 100,
    ocupados: 60,
    cerrados: 20,
    libres: 20,
    porcentajeOcupacion: 75,
    filas: [
      {
        etiqueta: 'Techada',
        horas: 60,
        ocupados: 45,
        cerrados: 10,
        libres: 5,
        porcentajeOcupacion: 90,
      },
      {
        etiqueta: 'Abierta',
        horas: 40,
        ocupados: 15,
        cerrados: 10,
        libres: 15,
        porcentajeOcupacion: 50,
      },
    ],
    calculadoEn: '2026-08-25T14:30:00.000Z',
  };

  let fixture: ComponentFixture<OcupacionPanel>;
  let api: {
    ocupacion: ReturnType<typeof vi.fn>;
    csv: ReturnType<typeof vi.fn>;
  };

  const montar = async (reporte: ReporteDeOcupacion = REPORTE) => {
    api = {
      ocupacion: vi.fn().mockResolvedValue(reporte),
      csv: vi.fn().mockReturnValue('/api/admin/reportes/ocupacion.csv?x=1'),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: Reportes, useValue: api }],
    });

    fixture = TestBed.createComponent(OcupacionPanel);
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

  it('**las horas cerradas tienen su propia columna**', () => {
    const encabezados = Array.from(elemento().querySelectorAll('thead th[scope="col"]')).map((th) =>
      th.textContent?.trim(),
    );

    expect(encabezados).toEqual(['Corte', 'Ocupadas', 'Libres', 'Cerradas', 'Ocupación']);
  });

  it('muestra cada fila con sus tres cuentas y su porcentaje', () => {
    expect(filas()[0]).toEqual(['Techada', '45', '5', '10', '90 %']);
  });

  it('**explica que lo cerrado no entra en el porcentaje**', () => {
    // Sin decirlo, el club no entiende por qué 45 de 60 da 90 %.
    expect(texto()).toContain('no entran');
  });

  it('muestra el total del período', () => {
    expect(texto()).toContain('75 %');
  });

  it('una fila sin horas que ofrecer no dice 0 %', async () => {
    // Un cero se lee como "nadie vino", y lo que pasó es que la cancha estuvo cerrada.
    await montar({
      ...REPORTE,
      filas: [
        {
          etiqueta: 'Techada',
          horas: 5,
          ocupados: 0,
          cerrados: 5,
          libres: 0,
          porcentajeOcupacion: null,
        },
      ],
    });

    expect(filas()[0]).toEqual(['Techada', '0', '0', '5', 'Sin horas']);
  });

  it('la media hora se escribe con coma', async () => {
    // T77: la ocupación se mide en medias horas, y "0.5" no es como se escribe acá.
    await montar({
      ...REPORTE,
      filas: [
        {
          etiqueta: 'Techada',
          horas: 4,
          ocupados: 1.5,
          cerrados: 0.5,
          libres: 2,
          porcentajeOcupacion: 43,
        },
      ],
    });

    expect(filas()[0]).toEqual(['Techada', '1,5', '2', '0,5', '43 %']);
  });

  it('arranca por condición, que es la pregunta que motiva el módulo', () => {
    expect((api.ocupacion.mock.calls[0] as string[])[2]).toBe('condicion');
  });

  it('cambiar el corte vuelve a pedir el reporte', async () => {
    const selector = elemento().querySelector<HTMLSelectElement>('select[name="corte"]')!;
    selector.value = 'franja';
    selector.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect((api.ocupacion.mock.calls[1] as string[])[2]).toBe('franja');
  });

  it('un período sin bloques lo dice, en vez de mostrar una tabla vacía', async () => {
    await montar({
      ...REPORTE,
      horas: 0,
      ocupados: 0,
      cerrados: 0,
      libres: 0,
      porcentajeOcupacion: null,
      filas: [],
    });

    expect(texto()).toContain('No hubo horas');
    expect(elemento().querySelector('tbody')).toBeNull();
  });

  it('si el rango es demasiado largo, lo dice en vez de quedar cargando', async () => {
    api.ocupacion.mockRejectedValue(new Error('rango largo'));
    await montar();
    api.ocupacion.mockRejectedValue(new Error('rango largo'));

    const campo = elemento().querySelector<HTMLInputElement>('input[name="desde"]')!;
    campo.value = '2020-01-01';
    campo.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(texto()).toContain('No se pudo');
  });
});
