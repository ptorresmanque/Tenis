import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminCanchas } from './admin-canchas.service';
import { EditorPrime } from './editor-prime';

/**
 * T213. Qué duraciones toma el socio en horario prime: solo 1 hora, solo 1 hora y media o
 * las dos. Siempre hay una elegida: un socio que no puede reservar nada en prime es una
 * regla que nadie pidió.
 */
describe('EditorPrime', () => {
  let fixture: ComponentFixture<EditorPrime>;
  let api: {
    configuracion: ReturnType<typeof vi.fn>;
    fijarConfiguracion: ReturnType<typeof vi.fn>;
  };

  const montar = async (duracionesSocioPico = 'UNA_HORA') => {
    api = {
      configuracion: vi.fn().mockResolvedValue({ duracionesSocioPico }),
      fijarConfiguracion: vi.fn().mockResolvedValue({}),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: AdminCanchas, useValue: api }],
    });

    fixture = TestBed.createComponent(EditorPrime);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const raiz = () => fixture.nativeElement as HTMLElement;
  const opcion = (valor: string) =>
    raiz().querySelector<HTMLInputElement>(`input[type="radio"][value="${valor}"]`)!;

  beforeEach(async () => {
    await montar();
  });

  it('ofrece las tres opciones y marca la que rige', () => {
    expect(raiz().textContent).toContain('Solo 1 hora');
    expect(raiz().textContent).toContain('Solo 1 hora y media');
    expect(raiz().textContent).toContain('Las dos');
    expect(opcion('UNA_HORA').checked).toBe(true);
  });

  it('guarda la elegida y avisa', async () => {
    opcion('AMBAS').click();
    fixture.detectChanges();
    raiz().querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.fijarConfiguracion).toHaveBeenCalledWith({
      duracionesSocioPico: 'AMBAS',
    });
    expect(raiz().textContent).toContain('Guardado. Rige desde la próxima reserva.');
  });

  it('parte en la que dice el servidor', async () => {
    await montar('HORA_Y_MEDIA');

    expect(opcion('HORA_Y_MEDIA').checked).toBe(true);
  });
});
