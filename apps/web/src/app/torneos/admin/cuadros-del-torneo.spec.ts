import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CategoriaJuego, CuadroDelTorneo, Torneos } from '../torneos.service';
import { CuadrosDelTorneo } from './cuadros-del-torneo';

/**
 * T63. Qué categorías corre un torneo.
 *
 * Lo que este archivo cuida: que **no se ofrezca una categoría que el torneo ya corre**
 * —el servidor la rechaza con un 409 que el admin no puede prevenir mirando la
 * pantalla—, y que un torneo sin categorías diga por qué eso importa en vez de quedar
 * en blanco.
 */
describe('CuadrosDelTorneo', () => {
  /**
   * Cuánto puede valer ganar un cuadro (T70).
   *
   * Es la `CategoriaTorneo`, no la de juego: una dice el nivel de quien juega y la
   * otra la importancia del cuadro.
   */
  const VALORES = [
    { id: 3, nombre: 'Club 250', puntosCampeon: 250, activa: true },
    { id: 4, nombre: 'Máster 500', puntosCampeon: 500, activa: true },
  ];

  const CUARTA: CuadroDelTorneo = {
    id: 7,
    torneoId: 1,
    categoriaJuegoId: 20,
    categoria: '4ª',
    categoriaId: 3,
    valor: 'Club 250',
    puntosCampeon: 250,
    cupo: 32,
    montoInscripcionClp: 0,
    semillaSorteo: null,
  };

  const CATALOGO: CategoriaJuego[] = [
    { id: 20, nombre: '4ª', orden: 20, activa: true },
    { id: 60, nombre: 'Honor', orden: 60, activa: true },
  ];

  let fixture: ComponentFixture<CuadrosDelTorneo>;
  let api: {
    cuadrosDelTorneo: ReturnType<typeof vi.fn>;
    categoriasDeJuego: ReturnType<typeof vi.fn>;
    categorias: ReturnType<typeof vi.fn>;
    agregarCuadro: ReturnType<typeof vi.fn>;
    editarCuadro: ReturnType<typeof vi.fn>;
    quitarCuadro: ReturnType<typeof vi.fn>;
  };

  const montar = async (cuadros: CuadroDelTorneo[]) => {
    api = {
      cuadrosDelTorneo: vi.fn().mockResolvedValue(cuadros),
      categoriasDeJuego: vi.fn().mockResolvedValue(CATALOGO),
      categorias: vi.fn().mockResolvedValue(VALORES),
      agregarCuadro: vi.fn().mockResolvedValue(CUARTA),
      editarCuadro: vi.fn().mockResolvedValue(CUARTA),
      quitarCuadro: vi.fn().mockResolvedValue({ id: 7 }),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: Torneos, useValue: api }],
    });

    fixture = TestBed.createComponent(CuadrosDelTorneo);
    fixture.componentRef.setInput('torneoId', 1);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const texto = () => elemento().textContent ?? '';

  const opciones = () =>
    Array.from(elemento().querySelectorAll('select option')).map((o) =>
      o.textContent?.trim(),
    );

  const apretar = async (etiqueta: string) => {
    Array.from(elemento().querySelectorAll('button'))
      .find((b) => b.textContent?.trim().startsWith(etiqueta))
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await montar([CUARTA]);
  });

  it('**no ofrece una categoría que el torneo ya corre**', () => {
    // El servidor la rechaza con un 409, y ofrecerla es mandar al admin a un error que
    // la pantalla ya sabía.
    expect(opciones()).toContain('Honor');
    expect(opciones()).not.toContain('4ª');
  });

  it('**un torneo sin categorías explica por qué eso importa**', async () => {
    await montar([]);

    expect(texto()).toContain('no se puede inscribir a nadie');
  });

  it('cuando ya corre todas, lo dice en vez de dejar un botón muerto', async () => {
    await montar([
      CUARTA,
      { ...CUARTA, id: 8, categoriaJuegoId: 60, categoria: 'Honor' },
    ]);

    expect(texto()).toContain('Ya corre todas las categorías activas');
  });

  it('marca el cuadro ya armado, que es el que no acepta más inscritos', async () => {
    await montar([{ ...CUARTA, semillaSorteo: 123 }]);

    expect(texto()).toContain('Armado');
  });

  it('agregar sin elegir categoría no llama al servidor', async () => {
    await apretar('Agregar');

    expect(api.agregarCuadro).not.toHaveBeenCalled();
    expect(texto()).toContain('Elige la categoría');
  });

  it('cambiar el cupo manda solo el cupo', async () => {
    const campo = elemento().querySelector<HTMLInputElement>(
      'input[type="number"]',
    )!;
    campo.value = '16';
    campo.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.editarCuadro).toHaveBeenCalledWith(1, 7, { cupo: 16 });
  });

  it('**un cupo menor que dos no llega al servidor**', async () => {
    const campo = elemento().querySelector<HTMLInputElement>(
      'input[type="number"]',
    )!;
    campo.value = '1';
    campo.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.editarCuadro).not.toHaveBeenCalled();
    expect(texto()).toContain('de 2 para arriba');
  });

  it('**recarga aunque el servidor rechace quitar un cuadro con gente**', async () => {
    api.quitarCuadro.mockRejectedValueOnce(new Error('tiene inscritos'));
    const consultasPrevias = api.cuadrosDelTorneo.mock.calls.length;

    await apretar('Quitar');

    expect(api.cuadrosDelTorneo.mock.calls.length).toBeGreaterThan(
      consultasPrevias,
    );
  });

  /**
   * T70. Cuánto vale ganar cada cuadro.
   *
   * Lo que este bloque cuida: que **el valor se elija por cuadro y no por torneo**. Es
   * la decisión entera de T70 — el campeón de Honor y el de 5ª no suman lo mismo en una
   * tabla que es única y los mezcla.
   */
  describe('cuánto vale ganar el cuadro (T70)', () => {
    it('**agregar un cuadro manda su valor**, no solo su categoría', async () => {
      const nivel = elemento().querySelector<HTMLSelectElement>(
        'select[name="categoria"]',
      )!;
      nivel.value = '60';
      nivel.dispatchEvent(new Event('change'));

      const valor = elemento().querySelector<HTMLSelectElement>(
        'select[name="valor"]',
      )!;
      valor.value = '4';
      valor.dispatchEvent(new Event('change'));
      await fixture.whenStable();

      elemento().querySelector('form')!.dispatchEvent(new Event('submit'));
      await fixture.whenStable();

      expect(api.agregarCuadro).toHaveBeenCalledWith(1, {
        categoriaJuegoId: 60,
        categoriaId: 4,
        cupo: 16,
      });
    });

    it('**sin valor no se manda**: el cuadro tendría que valer algo', async () => {
      const nivel = elemento().querySelector<HTMLSelectElement>(
        'select[name="categoria"]',
      )!;
      nivel.value = '60';
      nivel.dispatchEvent(new Event('change'));
      await fixture.whenStable();

      elemento().querySelector('form')!.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(api.agregarCuadro).not.toHaveBeenCalled();
      expect(texto()).toContain('cuánto vale ganar');
    });

    it('el selector dice cuántos puntos da cada uno', () => {
      const opciones = Array.from(
        elemento().querySelectorAll('select[name="valor"] option'),
      ).map((o) => o.textContent?.trim());

      expect(opciones.some((o) => o?.includes('500'))).toBe(true);
    });

    it('**un cuadro que ya existe puede cambiar de valor**', async () => {
      // El club se equivocó al crearlo: la alternativa era borrarlo con sus partidos.
      const enLaFicha = elemento().querySelectorAll<HTMLSelectElement>(
        'li select',
      )[0];
      enLaFicha.value = '4';
      enLaFicha.dispatchEvent(new Event('change'));
      await fixture.whenStable();

      expect(api.editarCuadro).toHaveBeenCalledWith(1, 7, { categoriaId: 4 });
    });

    it('**avisa que cambiarlo recalcula el ranking**', () => {
      // El aviso vive en la pantalla y no solo en un comentario del código: mover ese
      // selector en un torneo ya jugado cambia puestos en una tabla que se cuelga en
      // el mural del club.
      expect(texto()).toContain('recalcula el ranking');
    });
  });

  // `value()` de un resource lanza en estado de error aunque tenga `defaultValue`.
  it('si la API no responde, lo dice en vez de reventar', async () => {
    const caida = () => Promise.reject(new Error('la API no respondió'));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Torneos,
          useValue: { cuadrosDelTorneo: caida, categoriasDeJuego: caida, categorias: caida },
        },
      ],
    });

    fixture = TestBed.createComponent(CuadrosDelTorneo);
    fixture.componentRef.setInput('torneoId', 1);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(texto()).toContain('No se pudieron cargar las categorías del torneo');
    // Sin el catálogo no se sabe si quedan categorías por agregar.
    expect(texto()).not.toContain('Ya corre todas');
  });
});
