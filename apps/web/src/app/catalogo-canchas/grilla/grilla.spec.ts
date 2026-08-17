import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { Disponibilidad, GrillaDeCancha } from '../disponibilidad';
import { Grilla } from './grilla';

/**
 * La pantalla principal de la demo. Lo que se prueba acá es lo que el master
 * marca como no negociable: el precio visible en el bloque antes de hacer clic, y
 * el estado distinguible por texto y no solo por color.
 */
describe('Grilla', () => {
  const DIA: GrillaDeCancha[] = [
    {
      cancha: {
        id: 1,
        nombre: 'Cancha 1',
        superficie: 'ARCILLA',
        techada: false,
        iluminacion: true,
      },
      bloques: [
        {
          inicio: '2026-08-17T12:00:00.000Z',
          fin: '2026-08-17T13:00:00.000Z',
          canchaId: 1,
          montoClp: 12000,
          esPico: false,
          bloqueado: false,
          motivoBloqueo: null,
        },
        {
          inicio: '2026-08-17T14:00:00.000Z',
          fin: '2026-08-17T15:00:00.000Z',
          canchaId: 1,
          montoClp: 12000,
          esPico: false,
          bloqueado: true,
          motivoBloqueo: 'MANTENCION',
        },
        {
          inicio: '2026-08-17T22:00:00.000Z',
          fin: '2026-08-17T23:00:00.000Z',
          canchaId: 1,
          montoClp: 20000,
          esPico: true,
          bloqueado: false,
          motivoBloqueo: null,
        },
      ],
    },
  ];

  let fixture: ComponentFixture<Grilla>;

  const montar = async (dia: GrillaDeCancha[]) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Disponibilidad, useValue: { delDia: () => Promise.resolve(dia) } },
      ],
    });

    fixture = TestBed.createComponent(Grilla);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const texto = () => fixture.nativeElement.textContent as string;
  const bloques = () =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.bloque'),
    );

  beforeEach(async () => {
    await montar(DIA);
  });

  it('muestra la hora de cada bloque en la hora del club', () => {
    // 12:00Z en agosto son las 08:00 en Santiago. Con la hora del navegador o un
    // desfase fijo, el socio vería una hora que no es a la que juega.
    expect(texto()).toContain('08:00–09:00');
  });

  it('muestra el precio en el bloque, antes de hacer clic', () => {
    expect(texto()).toContain('$12.000');
    expect(texto()).toContain('$20.000');
  });

  it('avisa cuál es hora pico', () => {
    expect(texto()).toContain('Hora pico');
  });

  it('dice el estado con palabras, no solo con color', () => {
    // El par verde/rojo es justo el que no distingue quien tiene daltonismo
    // rojo-verde: si el estado solo estuviera en el color, la pantalla mentiría.
    expect(texto()).toContain('Disponible');
    expect(texto()).toContain('En mantención');
    // Y nunca el enum crudo de la base, que se lee como una falla del sistema.
    expect(texto()).not.toContain('MANTENCION');
  });

  it('marca el bloque tomado con una forma distinta, no solo un color', () => {
    const tomado = bloques()[1];

    expect(tomado.classList.contains('border-dashed')).toBe(true);
    expect(bloques()[0].classList.contains('border-dashed')).toBe(false);
  });

  it('no ofrece precio de un bloque que no se puede tomar', () => {
    // Un precio junto a "En mantención" invita a intentar reservarlo.
    expect(bloques()[1].textContent).not.toContain('$');
  });

  it('numera los bloques para el stagger, sin pasar del tope', () => {
    // El `--i` es lo que escalona la entrada. El tope vive en el CSS; acá se fija
    // que el índice llegue, porque sin él todos entran a la vez.
    expect(bloques().map((b) => b.getAttribute('style'))).toEqual([
      expect.stringContaining('--i: 0'),
      expect.stringContaining('--i: 1'),
      expect.stringContaining('--i: 2'),
    ]);
  });

  it('anuncia el resultado a quien no ve la grilla', async () => {
    // Sin esto, un lector de pantalla dice "buscando" y después se queda callado:
    // nadie se entera de si la grilla se repobló ni con cuánto. Dos libres de
    // tres bloques, porque el del medio está en mantención.
    const resumen = (fixture.nativeElement as HTMLElement).querySelector(
      '[role="status"] .sr-only',
    );

    expect(resumen?.textContent).toBe('2 horas disponibles en 1 cancha.');
  });

  it('cuando una cancha no abre ese día lo dice, en vez de quedar vacía', async () => {
    await montar([{ cancha: DIA[0].cancha, bloques: [] }]);

    expect(texto()).toContain('no abre este día');
  });

  it('cuando el club no tiene canchas publicadas lo dice', async () => {
    await montar([]);

    expect(texto()).toContain('no tiene canchas publicadas');
  });
});
