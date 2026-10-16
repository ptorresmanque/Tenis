import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Agenda } from '../../reservas/admin/agenda.service';
import { CuotaDelSocio } from './cuota-del-socio';
import { CambioDeFicha, SocioDelClub, Socios } from './socios.service';

/**
 * T37. La ficha de un socio: editarla y ver quién la cambió antes. Desde T298 es la pestaña
 * «Cuota» de la ficha de una cuenta en Personas, dentro de la página y no en un diálogo.
 *
 * Lo que este archivo ataja: que el panel **mande de más**. Guardar sin haber tocado
 * nada, o mandar los tres campos cuando cambió uno, hace que un error del servidor
 * hable de algo que el admin no tocó —y en un formulario de derechos eso se lee como
 * "el sistema hizo algo que yo no pedí".
 */
describe('La cuota del socio', () => {
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

  let fixture: ComponentFixture<CuotaDelSocio>;
  let api: {
    editar: ReturnType<typeof vi.fn>;
    historial: ReturnType<typeof vi.fn>;
  };

  const montar = async (cambios: CambioDeFicha[] | Error = []) => {
    api = {
      editar: vi.fn().mockResolvedValue(SOCIA),
      historial: vi.fn(() =>
        cambios instanceof Error ? Promise.reject(cambios) : Promise.resolve(cambios),
      ),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Socios, useValue: api },
        // T226: la ficha muestra el historial de observaciones del socio.
        {
          provide: Agenda,
          useValue: {
            historial: vi.fn().mockResolvedValue([
              {
                id: 1,
                texto: 'Se pasó 20 minutos de su hora.',
                autorId: 5,
                autorNombre: 'Carolina Díaz',
                creadaEn: '2026-10-14T23:15:00.000Z',
                editadaEn: null,
                reservaId: 40,
                folio: 'AB23CDE',
                cancha: 'Cancha 1',
                inicio: '2026-10-14T22:00:00.000Z',
              },
            ]),
          },
        },
      ],
    });

    fixture = TestBed.createComponent(CuotaDelSocio);
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

  it('muestra las observaciones del mesón sobre sus reservas (T226)', () => {
    const texto = elemento().textContent ?? '';

    expect(texto).toContain('Observaciones del mesón');
    expect(texto).toContain('Se pasó 20 minutos de su hora.');
    expect(texto).toContain('Cancha 1');
  });

  it('el calendario de la cuota se abre desde la ficha', async () => {
    elemento()
      .querySelector<HTMLButtonElement>('mat-datepicker-toggle button')!
      .click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(document.querySelector('mat-calendar')).not.toBeNull();
  });

  it('el calendario confirma con «Cancelar / Aplicar» y dice su formato (D16 y D17)', async () => {
    elemento().querySelector<HTMLButtonElement>('mat-datepicker-toggle button')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      [...document.querySelectorAll('.mat-datepicker-actions button')].map((b) =>
        b.textContent?.trim(),
      ),
    ).toEqual(['Cancelar', 'Aplicar']);
    expect(elemento().textContent).toContain('dd-mm-aaaa');
  });

  it('llega con los datos del socio puestos', () => {
    const numero = elemento().querySelector<HTMLInputElement>('[name="numeroSocio"]');

    expect(numero?.value).toBe('001');
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

  // `value()` de un resource lanza en estado de error aunque tenga `defaultValue`.
  it('si el historial no carga, lo dice', async () => {
    await montar(new Error('la API no respondió'));

    expect(elemento().textContent).toContain('No se pudo cargar el historial');
  });
});
