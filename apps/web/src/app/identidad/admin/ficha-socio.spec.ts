import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FichaSocio } from './ficha-socio';
import { CambioDeFicha, SocioDelClub, Socios } from './socios.service';

/**
 * T37. La ficha de un socio: editarla y ver quién la cambió antes.
 *
 * Lo que este archivo ataja: que el panel **mande de más**. Guardar sin haber tocado
 * nada, o mandar los tres campos cuando cambió uno, hace que un error del servidor
 * hable de algo que el admin no tocó —y en un formulario de derechos eso se lee como
 * "el sistema hizo algo que yo no pedí".
 */
describe('FichaSocio', () => {
  const SOCIA: SocioDelClub = {
    id: 7,
    numeroSocio: '001',
    estado: 'ACTIVO',
    alDiaHasta: '2026-08-31T00:00:00.000Z',
    usuario: { nombre: 'Carolina', apellido: 'Díaz', email: 'caro@club.cl' },
  };

  const UN_CAMBIO: CambioDeFicha = {
    id: 3,
    campo: 'estado',
    valorAnterior: 'ACTIVO',
    valorNuevo: 'SUSPENDIDO',
    hechoPorNombre: 'Rodrigo Vera',
    hechoEn: '2026-08-20T14:00:00.000Z',
    motivo: 'Cuota impaga desde junio',
  };

  let fixture: ComponentFixture<FichaSocio>;
  let api: {
    editar: ReturnType<typeof vi.fn>;
    historial: ReturnType<typeof vi.fn>;
  };

  const montar = async (cambios: CambioDeFicha[] = []) => {
    api = {
      editar: vi.fn().mockResolvedValue(SOCIA),
      historial: vi.fn().mockResolvedValue(cambios),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: Socios, useValue: api }],
    });

    // El componente abre un `<dialog>` con showModal(), que jsdom no implementa.
    HTMLDialogElement.prototype.showModal = vi.fn(function (
      this: HTMLDialogElement,
    ) {
      this.open = true;
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.open = false;
    });

    fixture = TestBed.createComponent(FichaSocio);
    fixture.componentRef.setInput('socio', SOCIA);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const escribir = (nombre: string, valor: string) => {
    const campo = elemento().querySelector<HTMLInputElement>(`[name="${nombre}"]`)!;
    campo.value = valor;
    campo.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const guardar = async () => {
    elemento().querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await montar([UN_CAMBIO]);
  });

  it('llega con los datos del socio puestos', () => {
    const numero = elemento().querySelector<HTMLInputElement>('[name="numeroSocio"]');

    expect(numero?.value).toBe('001');
    expect(elemento().textContent).toContain('Carolina Díaz');
  });

  it('**manda solo el campo que cambió**', async () => {
    escribir('numeroSocio', '042');

    await guardar();

    expect(api.editar).toHaveBeenCalledWith(7, { numeroSocio: '042' });
  });

  it('sin cambios no llama al servidor, y lo dice', async () => {
    await guardar();

    expect(api.editar).not.toHaveBeenCalled();
    expect(elemento().textContent).toContain('No cambiaste nada');
  });

  it('el motivo viaja con el cambio', async () => {
    escribir('numeroSocio', '042');
    escribir('motivo', 'Se equivocaron al inscribirla');

    await guardar();

    expect(api.editar).toHaveBeenCalledWith(7, {
      numeroSocio: '042',
      motivo: 'Se equivocaron al inscribirla',
    });
  });

  it('muestra el historial con el campo en castellano, no el nombre de la columna', () => {
    expect(elemento().textContent).toContain('Estado');
    expect(elemento().textContent).not.toContain('estado:');
    expect(elemento().textContent).toContain('Rodrigo Vera');
    expect(elemento().textContent).toContain('Cuota impaga desde junio');
  });

  it('un socio sin historial lo dice, en vez de quedar en blanco', async () => {
    await montar([]);

    expect(elemento().textContent).toContain('Nada desde que existe el registro');
  });

  it('el error del servidor se muestra tal como viene escrito', async () => {
    api.editar.mockRejectedValue({
      error: { message: 'Ese número de socio ya es de otra persona.' },
    });

    escribir('numeroSocio', '002');
    await guardar();

    expect(elemento().textContent).toContain('ya es de otra persona');
  });
});
