import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Profesor, Profesores } from '../profesores.service';
import { ProfesoresPanel } from './profesores';

/**
 * T45. La ficha del profesor en el panel.
 *
 * Lo que este archivo cuida: que **desactivar no ofrezca borrar** —la pantalla no
 * tiene ese botón porque el módulo no tiene esa operación— y que el formulario sirva
 * para las dos cosas sin arrastrar datos de una a la otra.
 */
describe('ProfesoresPanel', () => {
  const ANA: Profesor = {
    id: 1,
    nombreVisible: 'Ana Silva',
    telefono: '+56944444444',
    especialidad: 'Iniciación',
    tarifaHoraClp: 18000,
    activo: true,
  };

  let fixture: ComponentFixture<ProfesoresPanel>;
  let api: {
    listar: ReturnType<typeof vi.fn>;
    crear: ReturnType<typeof vi.fn>;
    editar: ReturnType<typeof vi.fn>;
  };

  const montar = async (profesores: Profesor[] | Error) => {
    api = {
      listar: vi.fn(() =>
        profesores instanceof Error
          ? Promise.reject(profesores)
          : Promise.resolve(profesores),
      ),
      crear: vi.fn().mockResolvedValue(ANA),
      editar: vi.fn().mockResolvedValue(ANA),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: Profesores, useValue: api }],
    });

    fixture = TestBed.createComponent(ProfesoresPanel);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;

  const botones = () => Array.from(elemento().querySelectorAll('button'));

  const apretar = async (etiqueta: string) => {
    botones()
      .find((b) => b.textContent?.trim().startsWith(etiqueta))
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const escribir = async (campo: string, valor: string) => {
    const entrada = elemento().querySelector(
      `input[name="${campo}"]`,
    ) as HTMLInputElement;
    entrada.value = valor;
    entrada.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await montar([ANA]);
  });

  it('muestra a cada profesor con lo que el club anuncia de él', () => {
    const texto = elemento().textContent ?? '';

    expect(texto).toContain('Ana Silva');
    expect(texto).toContain('Iniciación');
    expect(texto).toContain('+56944444444');
  });

  it('**no ofrece borrar: la operación no existe**', () => {
    expect(botones().some((b) => /Borrar|Eliminar/.test(b.textContent ?? ''))).toBe(
      false,
    );
    expect(botones().some((b) => b.textContent?.includes('Desactivar'))).toBe(true);
  });

  it('anotar un profesor manda la ficha completa', async () => {
    await escribir('nombreVisible', 'Felipe Morales');
    await escribir('telefono', '+56955555555');
    await escribir('especialidad', 'Competitivo');

    await apretar('Anotar profesor');

    expect(api.crear).toHaveBeenCalledWith({
      nombreVisible: 'Felipe Morales',
      telefono: '+56955555555',
      especialidad: 'Competitivo',
      tarifaHoraClp: null,
    });
  });

  it('después de anotar, el formulario queda vacío para el siguiente', async () => {
    await escribir('nombreVisible', 'Felipe Morales');
    await escribir('telefono', '+56955555555');
    await escribir('especialidad', 'Competitivo');
    await apretar('Anotar profesor');

    const entrada = elemento().querySelector(
      'input[name="nombreVisible"]',
    ) as HTMLInputElement;
    expect(entrada.value).toBe('');
  });

  it('editar carga la ficha en el mismo formulario', async () => {
    await apretar('Editar');

    const entrada = elemento().querySelector(
      'input[name="especialidad"]',
    ) as HTMLInputElement;
    expect(entrada.value).toBe('Iniciación');
    expect(elemento().textContent).toContain('Editar ficha');
  });

  it('guardar los cambios no crea un profesor nuevo', async () => {
    await apretar('Editar');
    await escribir('especialidad', 'Competitivo');
    await apretar('Guardar cambios');

    expect(api.crear).not.toHaveBeenCalled();
    expect(api.editar).toHaveBeenCalledWith(1, {
      nombreVisible: 'Ana Silva',
      telefono: '+56944444444',
      especialidad: 'Competitivo',
      tarifaHoraClp: 18000,
    });
  });

  it('**desactivar solo cambia el estado, no toca el resto de la ficha**', async () => {
    await apretar('Desactivar');

    expect(api.editar).toHaveBeenCalledWith(1, { activo: false });
  });

  it('al desactivado se le ofrece reactivarlo', async () => {
    await montar([{ ...ANA, activo: false }]);

    expect(elemento().textContent).toContain('Desactivado');
    await apretar('Reactivar');

    expect(api.editar).toHaveBeenCalledWith(1, { activo: true });
  });

  it('si el servidor rechaza la ficha, lo dice con sus palabras', async () => {
    api.crear.mockRejectedValue({ error: { message: 'Falta el teléfono.' } });

    await escribir('nombreVisible', 'Sin teléfono');
    await apretar('Anotar profesor');

    expect(elemento().textContent).toContain('Falta el teléfono');
  });

  it('sin profesores lo dice, en vez de quedar en blanco', async () => {
    await montar([]);

    expect(elemento().textContent).toContain('Todavía no hay profesores');
  });

  // `value()` de un resource lanza en estado de error aunque tenga `defaultValue`.
  it('si la lista no carga, lo dice', async () => {
    await montar(new Error('la API no respondió'));

    expect(elemento().textContent).toContain('No se pudieron cargar los profesores');
  });
});
