import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminCanchas, CanchaAdmin } from './admin-canchas.service';
import { EditorHorarios } from './editor-horarios';

/**
 * T13. El horario de apertura es lo que decide qué bloques existen: un día que se
 * guarda mal saca una cancha de la grilla, o la abre un día que el club cierra.
 */
describe('EditorHorarios', () => {
  const CANCHA: CanchaAdmin = {
    id: 7,
    nombre: 'Cancha 7',
    superficie: 'ARCILLA',
    techada: false,
    iluminacion: false,
    activa: true,
    orden: 1,
    horarios: [
      { id: 1, diaSemana: 1, horaApertura: '09:00', horaCierre: '21:00' },
    ],
    franjas: [],
  };

  let fixture: ComponentFixture<EditorHorarios>;
  let api: { fijarHorarios: ReturnType<typeof vi.fn> };

  const montar = async (cancha: CanchaAdmin) => {
    api = { fijarHorarios: vi.fn().mockResolvedValue([]) };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: AdminCanchas, useValue: api }],
    });

    fixture = TestBed.createComponent(EditorHorarios);
    fixture.componentRef.setInput('cancha', cancha);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const casillas = () =>
    Array.from(
      elemento().querySelectorAll<HTMLInputElement>('input[type=checkbox]'),
    );
  const guardar = async () => {
    elemento().querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await montar(CANCHA);
  });

  it('muestra los siete días, abra la cancha o no', () => {
    // Una lista con solo los días que tienen horario obligaría a agregar y quitar
    // filas para decir "el martes cerramos", que es la operación más común.
    expect(casillas()).toHaveLength(7);
    expect(elemento().textContent).toContain('Domingo');
    expect(elemento().textContent).toContain('Sábado');
  });

  it('marca solo los días que la cancha abre', () => {
    // El lunes es el único con horario: índice 1, porque el domingo es el 0.
    expect(casillas().map((c) => c.checked)).toEqual([
      false,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('trae las horas guardadas del día que abre', () => {
    const horas = Array.from(
      elemento().querySelectorAll<HTMLInputElement>('input[type=time]'),
    ).map((i) => i.value);

    // Las dos del lunes, en las posiciones 2 y 3 del recorrido.
    expect(horas[2]).toBe('09:00');
    expect(horas[3]).toBe('21:00');
  });

  it('guarda solo los días marcados', async () => {
    await guardar();

    expect(api.fijarHorarios).toHaveBeenCalledWith(7, [
      { diaSemana: 1, horaApertura: '09:00', horaCierre: '21:00' },
    ]);
  });

  it('desmarcar un día lo saca del horario', async () => {
    // Es como el club cierra un día. Si el día siguiera viajando, la cancha
    // abriría un día que el club cree cerrado.
    casillas()[1].click();
    await fixture.whenStable();

    await guardar();

    expect(api.fijarHorarios).toHaveBeenCalledWith(7, []);
  });

  it('marcar un día nuevo lo manda con el horario del club', async () => {
    casillas()[3].click();
    await fixture.whenStable();

    await guardar();

    expect(api.fijarHorarios).toHaveBeenCalledWith(7, [
      { diaSemana: 1, horaApertura: '09:00', horaCierre: '21:00' },
      { diaSemana: 3, horaApertura: '08:00', horaCierre: '22:00' },
    ]);
  });

  it('muestra el motivo que dio el servidor cuando rechaza el horario', async () => {
    // "El cierre tiene que ser posterior a la apertura" dice cuál corregir; un
    // mensaje genérico obliga a revisar los siete días a mano.
    api.fijarHorarios.mockRejectedValue({
      error: { message: 'El cierre tiene que ser posterior a la apertura.' },
    });

    await guardar();

    expect(elemento().textContent).toContain(
      'El cierre tiene que ser posterior a la apertura.',
    );
  });

  it('confirma cuando el horario quedó guardado', async () => {
    await guardar();

    expect(elemento().textContent).toContain('Horario guardado');
  });
});
