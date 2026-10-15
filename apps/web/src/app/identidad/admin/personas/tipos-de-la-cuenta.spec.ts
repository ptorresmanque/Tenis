import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { Profesor, Profesores } from '../../../clases/profesores.service';
import { Auth } from '../../../core/auth/auth';
import { responder, textoDelDialogo } from '../../../testing/dialogos';
import { elegir } from '../../../testing/elegir';
import { Socios } from '../socios.service';
import { FichaDeCuenta, Usuarios } from '../usuarios.service';
import { TiposDeLaCuenta } from './tipos-de-la-cuenta';

/**
 * T298 (SPEC-panel.md D3 y A6). Los tipos de una cuenta son cuatro casillas con un «Guardar»,
 * en vez de los botones «Hacer socio» y «Hacer profesor» y los interruptores de admin y
 * gestor. Guardar aplica cada cambio con su endpoint, en orden —gestor y admin, socio,
 * profesor—, y cada uno es independiente: si uno falla, lo dice junto a su casilla.
 */
describe('Los tipos de una cuenta', () => {
  const ANA: FichaDeCuenta = {
    id: 7,
    nombre: 'Ana',
    apellido: 'Rojas',
    email: 'ana@ejemplo.cl',
    telefono: '56911112222',
    creadoEn: '2026-01-10T12:00:00.000Z',
    esAdmin: false,
    esGestor: false,
    socio: null,
    profesor: null,
  };
  const FICHA_ACTIVA: NonNullable<FichaDeCuenta['profesor']> = {
    id: 4,
    nombreVisible: 'Ana Rojas',
    telefono: '56911112222',
    especialidad: 'Iniciación',
    tarifaHoraClp: null,
    activo: true,
    clasesPorVenir: 0,
  };
  const SIN_CUENTA: Profesor = {
    id: 9,
    nombreVisible: 'Ana R.',
    telefono: '56999998888',
    especialidad: 'Competición',
    tarifaHoraClp: 15000,
    activo: true,
    usuarioId: null,
  };

  const montar = async (cuenta: FichaDeCuenta, fichas: Profesor[] = []) => {
    const usuarios = { cambiar: vi.fn().mockResolvedValue({}) };
    const socios = { invitar: vi.fn().mockResolvedValue({}) };
    const profesores = {
      listar: vi.fn().mockResolvedValue(fichas),
      crear: vi.fn().mockResolvedValue({}),
      vincular: vi.fn().mockResolvedValue({}),
      editar: vi.fn().mockResolvedValue({}),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: Usuarios, useValue: usuarios },
        { provide: Socios, useValue: socios },
        { provide: Profesores, useValue: profesores },
        { provide: Auth, useValue: { usuario: signal({ id: 1 }) } },
      ],
    });
    const fixture = TestBed.createComponent(TiposDeLaCuenta);
    fixture.componentRef.setInput('cuenta', cuenta);
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    /** La casilla por su etiqueta: el `input` de su mat-checkbox. */
    const casilla = (etiqueta: string) =>
      [...el.querySelectorAll<HTMLElement>('mat-checkbox')]
        .find((c) => c.querySelector('label')?.textContent?.trim().startsWith(etiqueta))!
        .querySelector<HTMLInputElement>('input')!;
    const marcar = async (etiqueta: string) => {
      casilla(etiqueta).click();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const escribir = async (nombre: string, valor: string) => {
      await Promise.resolve();
      const campo = el.querySelector<HTMLInputElement>(`input[name="${nombre}"]`)!;
      campo.value = valor;
      campo.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    const guardar = async () => {
      el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
      for (let i = 0; i < 3; i++) {
        await fixture.whenStable();
        fixture.detectChanges();
      }
    };

    return { fixture, el, usuarios, socios, profesores, casilla, marcar, escribir, guardar };
  };

  it('**las casillas dicen lo que la cuenta es**', async () => {
    const { casilla } = await montar({
      ...ANA,
      esGestor: true,
      profesor: FICHA_ACTIVA,
    });

    expect(casilla('Socio').checked).toBe(false);
    expect(casilla('Profesor').checked).toBe(true);
    expect(casilla('Gestor').checked).toBe(true);
    expect(casilla('Administrador').checked).toBe(false);
  });

  it('marcar Gestor y guardar cambia solo eso', async () => {
    const { marcar, guardar, usuarios, socios, profesores } = await montar(ANA);

    await marcar('Gestor');
    await guardar();

    expect(usuarios.cambiar).toHaveBeenCalledWith(7, { esGestor: true });
    expect(socios.invitar).not.toHaveBeenCalled();
    expect(profesores.crear).not.toHaveBeenCalled();
  });

  it('**marcar Socio pide el número y la fecha, y crea la ficha con su correo**', async () => {
    const { marcar, escribir, guardar, socios, el } = await montar(ANA);
    expect(el.querySelector('input[name="numeroSocio"]')).toBeNull();

    await marcar('Socio');
    await escribir('numeroSocio', '042');
    await guardar();

    expect(socios.invitar).toHaveBeenCalledWith({ email: 'ana@ejemplo.cl', numeroSocio: '042' });
  });

  it('**Socio ya marcado no se desmarca**: la baja es el estado Retirado, en «Cuota»', async () => {
    const { casilla, el } = await montar({
      ...ANA,
      socio: {
        id: 3,
        numeroSocio: '012',
        estado: 'ACTIVO',
        alDiaHasta: '2099-12-31T00:00:00.000Z',
        sancionadoHasta: null,
      },
    });

    expect(casilla('Socio').checked).toBe(true);
    expect(casilla('Socio').disabled).toBe(true);
    expect(el.textContent).toContain('Retirado');
  });

  it('**marcar Profesor sin ficha la crea con su cuenta**, con su nombre y su teléfono', async () => {
    const { marcar, escribir, guardar, profesores } = await montar(ANA);

    await marcar('Profesor');
    await escribir('especialidad', 'Iniciación');
    await guardar();

    expect(profesores.crear).toHaveBeenCalledWith(
      {
        nombreVisible: 'Ana Rojas',
        telefono: '56911112222',
        especialidad: 'Iniciación',
        tarifaHoraClp: null,
      },
      7,
    );
  });

  it('**con una ficha suya desactivada, marcar Profesor la reactiva**', async () => {
    const { marcar, guardar, profesores } = await montar({
      ...ANA,
      profesor: { ...FICHA_ACTIVA, activo: false },
    });

    await marcar('Profesor');
    await guardar();

    expect(profesores.editar).toHaveBeenCalledWith(4, expect.objectContaining({ activo: true }));
    expect(profesores.crear).not.toHaveBeenCalled();
  });

  it('**puede ser una ficha de antes, sin cuenta**: se le asocia y conserva sus clases (D14)', async () => {
    const { marcar, guardar, profesores, fixture } = await montar(ANA, [SIN_CUENTA]);

    await marcar('Profesor');
    await elegir(fixture, 'mat-select[name="fichaSinCuenta"]', '9');
    await guardar();

    expect(profesores.vincular).toHaveBeenCalledWith(9, 7);
    expect(profesores.crear).not.toHaveBeenCalled();
  });

  it('si esa ficha de antes estaba desactivada, además la reactiva', async () => {
    const { marcar, guardar, profesores, fixture } = await montar(ANA, [
      { ...SIN_CUENTA, activo: false },
    ]);

    await marcar('Profesor');
    await elegir(fixture, 'mat-select[name="fichaSinCuenta"]', '9');
    await guardar();

    expect(profesores.vincular).toHaveBeenCalledWith(9, 7);
    expect(profesores.editar).toHaveBeenCalledWith(9, { activo: true });
  });

  it('**quitar Profesor desactiva la ficha**, y con clases por venir pregunta antes', async () => {
    const { marcar, guardar, profesores, fixture } = await montar({
      ...ANA,
      profesor: { ...FICHA_ACTIVA, clasesPorVenir: 3 },
    });

    await marcar('Profesor');
    await guardar();
    expect(textoDelDialogo()).toContain('3 clases por venir');
    await responder(fixture, false);
    expect(profesores.editar).not.toHaveBeenCalled();

    await guardar();
    await responder(fixture, true);
    expect(profesores.editar).toHaveBeenCalledWith(4, { activo: false });
  });

  it('nadie se quita a sí mismo el Administrador', async () => {
    const { casilla } = await montar({ ...ANA, id: 1, esAdmin: true });

    expect(casilla('Administrador').disabled).toBe(true);
  });

  it('**cada paso es independiente**: si el socio falla, lo dice junto a su casilla y sigue', async () => {
    const { marcar, escribir, guardar, socios, usuarios, profesores, el } = await montar(ANA);
    socios.invitar.mockRejectedValue({ error: { message: 'Ese número de socio ya es de otra persona.' } });

    await marcar('Gestor');
    await marcar('Socio');
    await marcar('Profesor');
    await escribir('especialidad', 'Iniciación');
    await guardar();

    expect(usuarios.cambiar).toHaveBeenCalled();
    expect(profesores.crear).toHaveBeenCalled();
    const socio = el.querySelector('[data-tipo="socio"]')!;
    expect(socio.textContent).toContain('Ese número de socio ya es de otra persona.');
  });
});
