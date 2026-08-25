import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CategoriaTorneo, Torneo, Torneos } from '../torneos.service';
import { TorneosPanel } from './torneos';

/**
 * T49. Los torneos y sus categorías.
 *
 * Lo que este archivo cuida: que **una categoría desactivada no se ofrezca** para un
 * torneo nuevo —es una que el club dejó de usar— y que el error de las fechas llegue
 * con las palabras del servidor, que es quien las compara entre sí.
 */
describe('TorneosPanel', () => {
  const CLUB_250: CategoriaTorneo = {
    id: 1,
    nombre: 'Club 250',
    puntosCampeon: 250,
    activa: true,
  };

  const VIEJA: CategoriaTorneo = {
    id: 2,
    nombre: 'Copa antigua',
    puntosCampeon: 100,
    activa: false,
  };

  const TORNEO: Torneo = {
    id: 5,
    nombre: 'Copa de verano',
    categoriaId: 1,
    categoria: 'Club 250',
    puntosCampeon: 250,
    superficie: 'ARCILLA',
    fechaInicio: '2026-12-01',
    fechaFin: '2026-12-07',
    cierreInscripcion: '2026-11-25',
    cupo: 16,
    estado: 'INSCRIPCION',
  };

  let fixture: ComponentFixture<TorneosPanel>;
  let api: {
    torneos: ReturnType<typeof vi.fn>;
    categorias: ReturnType<typeof vi.fn>;
    crearTorneo: ReturnType<typeof vi.fn>;
    crearCategoria: ReturnType<typeof vi.fn>;
    editarCategoria: ReturnType<typeof vi.fn>;
  };

  const montar = async (torneos: Torneo[], categorias: CategoriaTorneo[]) => {
    api = {
      torneos: vi.fn().mockResolvedValue(torneos),
      categorias: vi.fn().mockResolvedValue(categorias),
      crearTorneo: vi.fn().mockResolvedValue(TORNEO),
      crearCategoria: vi.fn().mockResolvedValue(CLUB_250),
      editarCategoria: vi.fn().mockResolvedValue(CLUB_250),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: Torneos, useValue: api }],
    });

    fixture = TestBed.createComponent(TorneosPanel);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const texto = () => elemento().textContent ?? '';

  const escribir = async (campo: string, valor: string) => {
    const entrada = elemento().querySelector(
      `[name="${campo}"]`,
    ) as HTMLInputElement;
    entrada.value = valor;
    entrada.dispatchEvent(new Event('input'));
    entrada.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const apretar = async (etiqueta: string) => {
    Array.from(elemento().querySelectorAll('button'))
      .find((b) => b.textContent?.trim().startsWith(etiqueta))
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await montar([TORNEO], [CLUB_250, VIEJA]);
  });

  it('muestra el torneo con su categoría y sus fechas en palabras', () => {
    expect(texto()).toContain('Copa de verano');
    expect(texto()).toContain('Club 250');
    expect(texto()).toContain('diciembre');
  });

  it('dice cuántos puntos se lleva el campeón, que es de lo que vive el ranking', () => {
    expect(texto()).toContain('250 puntos');
  });

  it('**una categoría desactivada no se ofrece para un torneo nuevo**', () => {
    const opciones = Array.from(
      elemento().querySelectorAll('select[name="categoriaId"] option'),
    ).map((o) => o.textContent?.trim());

    expect(opciones.some((o) => o?.startsWith('Club 250'))).toBe(true);
    expect(opciones.some((o) => o?.startsWith('Copa antigua'))).toBe(false);
  });

  it('la categoría desactivada sigue en la lista, para poder reactivarla', async () => {
    expect(texto()).toContain('Copa antigua');

    await apretar('Reactivar');

    expect(api.editarCategoria).toHaveBeenCalledWith(2, { activa: true });
  });

  it('crear un torneo manda las tres fechas juntas', async () => {
    await escribir('nombre', 'Copa de invierno');
    await escribir('categoriaId', '1');
    await escribir('fechaInicio', '2026-07-01');
    await escribir('fechaFin', '2026-07-05');
    await escribir('cierreInscripcion', '2026-06-25');

    await apretar('Crear torneo');

    expect(api.crearTorneo).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: 'Copa de invierno',
        categoriaId: 1,
        fechaInicio: '2026-07-01',
        fechaFin: '2026-07-05',
        cierreInscripcion: '2026-06-25',
      }),
    );
  });

  it('**si las fechas no cierran, lo dice el servidor y se muestra tal cual**', async () => {
    // La comparación entre las tres fechas vive en el servidor: es la misma regla
    // para el panel y para cualquier otra cosa que cree torneos.
    api.crearTorneo.mockRejectedValue({
      error: { message: 'El torneo no puede terminar antes de empezar.' },
    });

    await apretar('Crear torneo');

    expect(texto()).toContain('no puede terminar antes de empezar');
  });

  it('sin categorías, lo dice en vez de dejar un selector vacío', async () => {
    await montar([TORNEO], []);

    expect(texto()).toContain('Crea una categoría primero');
  });

  it('agregar una categoría manda su nombre y sus puntos', async () => {
    await escribir('nombreCategoria', 'Máster de fin de año');
    await escribir('puntosCampeon', '1000');

    await apretar('Agregar categoría');

    expect(api.crearCategoria).toHaveBeenCalledWith({
      nombre: 'Máster de fin de año',
      puntosCampeon: 1000,
    });
  });

  it('sin torneos lo dice, en vez de quedar en blanco', async () => {
    await montar([], [CLUB_250]);

    expect(texto()).toContain('Todavía no hay torneos');
  });
});
