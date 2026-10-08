import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HoraAfectada } from '../../catalogo-canchas/admin/admin-canchas.service';
import { Clases, FechaDeLaSerie } from '../clases.service';
import { NuevaSerie } from './nueva-serie';

/**
 * T115. El panel agenda una serie de clases: la escribe, la revisa fecha por fecha y decide
 * qué hacer con las que tienen algo encima (decisión 9). Lo que este archivo cuida es que
 * **no se pueda agendar con un choque sin decidir**, y que el botón diga por qué.
 */
describe('NuevaSerie', () => {
  const TOMADA: HoraAfectada = {
    id: 3,
    folio: 'AB23CDE',
    inicio: '2037-10-20T22:00:00.000Z',
    fin: '2037-10-20T23:00:00.000Z',
    nombre: 'Camila Visitante',
    email: 'camila@ejemplo.cl',
    esSocio: false,
    pagada: true,
    pagoEnCurso: false,
  };

  const fecha = (dia: string, parche: Partial<FechaDeLaSerie> = {}): FechaDeLaSerie => ({
    fecha: dia,
    inicio: `${dia}T22:00:00.000Z`,
    fin: `${dia}T23:00:00.000Z`,
    choque: null,
    afectadas: [],
    ...parche,
  });

  // Martes 20 con una reserva, jueves 22 con la cancha cerrada, martes 27 libre.
  const FECHAS = [
    fecha('2037-10-20', { afectadas: [TOMADA] }),
    fecha('2037-10-22', { choque: 'Esa cancha ya está cerrada en ese rango: Cambio de red.' }),
    fecha('2037-10-27'),
  ];

  let fixture: ComponentFixture<NuevaSerie>;
  let api: { simularSerie: ReturnType<typeof vi.fn>; agendarSerie: ReturnType<typeof vi.fn> };
  let agendadas: string[];

  const el = () => fixture.nativeElement as HTMLElement;
  const texto = () => el().textContent?.replace(/\s+/g, ' ') ?? '';
  const boton = (nombre: string) =>
    [...el().querySelectorAll('button')].find((b) => b.textContent?.trim() === nombre)!;
  const esperar = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const escribir = async (selector: string, valor: string) => {
    const campo = el().querySelector<HTMLInputElement | HTMLSelectElement>(selector)!;
    campo.value = valor;
    campo.dispatchEvent(new Event(campo instanceof HTMLSelectElement ? 'change' : 'input'));
    await esperar();
  };

  /** Llena la serie de los tests: martes y jueves de 19 a 20, del 14 de octubre al 31. */
  const llenar = async () => {
    await escribir('select[name="serie-cancha"]', '2');
    await escribir('select[name="serie-profesor"]', '4');
    for (const dia of ['Martes', 'Jueves']) {
      [...el().querySelectorAll('label')]
        .find((label) => label.textContent?.trim() === dia)!
        .querySelector('input')!
        .click();
    }
    await escribir('input[name="serie-desde"]', '2037-10-14');
    await escribir('input[name="serie-hasta"]', '2037-10-31');
  };

  const revisar = async (fechas = FECHAS) => {
    api.simularSerie.mockResolvedValue({ fechas });
    await llenar();
    boton('Revisar fechas').click();
    await esperar();
  };

  const decidir = async (dia: string, valor: string) => {
    await escribir(`select[name="decision-${dia}"]`, valor);
  };

  beforeEach(async () => {
    api = {
      simularSerie: vi.fn(),
      agendarSerie: vi.fn().mockResolvedValue({
        id: 9,
        clases: [{ id: 1, fecha: '2037-10-20' }, { id: 2, fecha: '2037-10-27' }],
        saltadas: ['2037-10-22'],
        canceladas: [TOMADA],
      }),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: Clases, useValue: api }] });

    fixture = TestBed.createComponent(NuevaSerie);
    fixture.componentRef.setInput('canchas', [{ id: 2, nombre: 'Cancha 1' }]);
    fixture.componentRef.setInput('profesores', [
      { id: 4, nombreVisible: 'Ana Silva', especialidad: 'Iniciación' },
    ]);
    agendadas = [];
    fixture.componentInstance.agendada.subscribe((mensaje) => agendadas.push(mensaje));
    await esperar();
  });

  it('**revisar manda la serie con los días marcados y muestra cada fecha**', async () => {
    await revisar();

    expect(api.simularSerie).toHaveBeenCalledWith(
      expect.objectContaining({
        canchaId: 2,
        profesorId: 4,
        diasSemana: [2, 4],
        horaDesde: '19:00',
        horaHasta: '20:00',
        desde: '2037-10-14',
        hasta: '2037-10-31',
      }),
    );
    expect(texto()).toContain('martes, 20 de octubre');
    expect(texto()).toContain('AB23CDE · Camila Visitante');
    expect(texto()).toContain('Cambio de red');
  });

  it('sin días de la semana, revisar no llama al servidor y lo dice', async () => {
    await escribir('select[name="serie-cancha"]', '2');
    boton('Revisar fechas').click();
    await esperar();

    expect(api.simularSerie).not.toHaveBeenCalled();
    expect(texto()).toContain('Marca al menos un día de la semana');
  });

  it('**no se puede agendar con un choque sin decidir, y el botón dice por qué**', async () => {
    await revisar();

    const agendar = boton('Agendar serie');
    expect(agendar.disabled).toBe(true);
    const motivo = el().querySelector(`#${agendar.getAttribute('aria-describedby')}`);
    expect(motivo?.textContent).toContain('Falta decidir 2 fechas');
    expect(motivo?.textContent).toContain('martes, 20 de octubre');
  });

  it('una fecha con la cancha cerrada solo ofrece saltarla', async () => {
    await revisar();

    const opciones = [
      ...el().querySelectorAll<HTMLOptionElement>('select[name="decision-2037-10-22"] option'),
    ].map((opcion) => opcion.value);
    expect(opciones).toEqual(['', 'saltar']);
  });

  it('**decidir cada choque habilita agendar, y las decisiones viajan con la serie**', async () => {
    await revisar();
    await decidir('2037-10-20', 'cancelar');
    await decidir('2037-10-22', 'saltar');

    boton('Agendar serie').click();
    await esperar();

    expect(api.agendarSerie).toHaveBeenCalledWith(expect.objectContaining({ diasSemana: [2, 4] }), {
      '2037-10-20': 'cancelar',
      '2037-10-22': 'saltar',
    });
    expect(agendadas).toEqual([
      'Serie agendada: 2 clases. Se saltó 1 fecha. Avisamos a 1 persona que tenía su hora.',
    ]);
  });

  it('una fecha libre también se puede saltar: un feriado', async () => {
    await revisar([fecha('2037-10-27'), fecha('2037-10-29')]);
    await decidir('2037-10-29', 'saltar');

    boton('Agendar serie').click();
    await esperar();

    expect(api.agendarSerie).toHaveBeenCalledWith(expect.anything(), { '2037-10-29': 'saltar' });
  });

  it('si la serie cambia después de revisarla, pide revisarla de nuevo', async () => {
    await revisar([fecha('2037-10-27')]);
    await escribir('input[name="serie-hora-desde"]', '18:00');

    const agendar = boton('Agendar serie');
    expect(agendar.disabled).toBe(true);
    expect(el().querySelector(`#${agendar.getAttribute('aria-describedby')}`)?.textContent).toContain(
      'Cambiaste la serie',
    );
  });

  it('si el servidor la rechaza —una reserva nueva, por ejemplo—, lo dice con sus palabras', async () => {
    api.agendarSerie.mockRejectedValue({
      status: 409,
      error: {
        motivo: 'FALTA_DECIDIR',
        message: 'Falta decidir qué hacer con estas fechas: martes 27 de octubre (reservas ZZ9).',
      },
    });
    await revisar([fecha('2037-10-27')]);

    boton('Agendar serie').click();
    await esperar();

    expect(texto()).toContain('martes 27 de octubre (reservas ZZ9)');
    expect(agendadas).toEqual([]);
  });
});
