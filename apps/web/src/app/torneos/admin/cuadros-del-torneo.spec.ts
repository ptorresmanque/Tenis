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
  const CUARTA: CuadroDelTorneo = {
    id: 7,
    torneoId: 1,
    categoriaJuegoId: 20,
    categoria: '4ª',
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
    agregarCuadro: ReturnType<typeof vi.fn>;
    editarCuadro: ReturnType<typeof vi.fn>;
    quitarCuadro: ReturnType<typeof vi.fn>;
  };

  const montar = async (cuadros: CuadroDelTorneo[]) => {
    api = {
      cuadrosDelTorneo: vi.fn().mockResolvedValue(cuadros),
      categoriasDeJuego: vi.fn().mockResolvedValue(CATALOGO),
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

  it('se encabeza con un h2: es hermana de "Datos del torneo", no una parte suya', () => {
    // Va entre el formulario de los datos y "Cancelar el torneo", los dos con h2.
    // Con un h3, el lector de pantalla la anunciaba dentro de los datos, y desde
    // TV7.6 se ve con la misma placa que sus hermanas (revisión de TV7.6).
    const titulo = elemento().querySelector('section > h2');

    expect(titulo?.textContent).toContain('Categorías del torneo');
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
   * T199. **El cuadro ya no tiene valor propio**: cuánto vale ganarlo lo dice el nivel con
   * que el torneo entró a cada tour, en Ajustes. Lo que T70 había puesto por cuadro —la
   * categoría de torneo— se fue con la tabla.
   */
  describe('sin categoría de torneo (T199)', () => {
    it('**agregar un cuadro manda la categoría, el cupo y el monto**, y nada más', async () => {
      const nivel = elemento().querySelector<HTMLSelectElement>(
        'select[name="categoriaJuego"]',
      )!;
      nivel.value = '60';
      nivel.dispatchEvent(new Event('change'));
      await fixture.whenStable();

      elemento().querySelector('form')!.dispatchEvent(new Event('submit'));
      await fixture.whenStable();

      expect(api.agregarCuadro).toHaveBeenCalledWith(1, {
        categoriaJuegoId: 60,
        cupo: 16,
        montoInscripcionClp: 0,
      });
    });

    it('no hay selector de valor, ni en el alta ni en las filas', () => {
      expect(elemento().querySelector('select[name="valor"]')).toBeNull();
      expect(elemento().querySelector('li select')).toBeNull();
      expect(texto()).not.toContain('recalcula el ranking');
    });
  });

  // `value()` de un resource lanza en estado de error aunque tenga `defaultValue`.
  describe('lo que cuesta inscribirse', () => {
    /** El campo del monto en la fila del cuadro, por su nombre accesible. */
    const montoDe = (categoria: string) =>
      elemento().querySelector<HTMLInputElement>(
        `input[aria-label="Inscripción de ${categoria}, en pesos"]`,
      )!;

    const cambiar = async (campo: HTMLInputElement, valor: string) => {
      campo.value = valor;
      campo.dispatchEvent(new Event('change'));
      await fixture.whenStable();
      fixture.detectChanges();
    };

    it('**cada cuadro muestra lo que cuesta**', async () => {
      await montar([{ ...CUARTA, montoInscripcionClp: 15000 }]);

      expect(montoDe('4ª').value).toBe('15000');
    });

    it('**cambiarlo manda solo el monto**', async () => {
      await cambiar(montoDe('4ª'), '20000');

      expect(api.editarCuadro).toHaveBeenCalledWith(1, 7, {
        montoInscripcionClp: 20000,
      });
    });

    it('**un monto negativo o con decimales no llega al servidor**', async () => {
      await cambiar(montoDe('4ª'), '-5');
      await cambiar(montoDe('4ª'), '1500.5');

      expect(api.editarCuadro).not.toHaveBeenCalled();
      expect(texto()).toContain('en pesos, sin decimales');
    });

    it('**avisa a quién alcanza un cambio de monto**', () => {
      expect(texto()).toContain('se inscribió gratis');
      expect(texto()).toContain('paga el monto nuevo');
    });

    it('**agregar un cuadro manda su monto**, y cero es gratis', async () => {
      const nivel = elemento().querySelector<HTMLSelectElement>(
        'select[name="categoriaJuego"]',
      )!;
      nivel.value = '60';
      nivel.dispatchEvent(new Event('change'));
      const monto = elemento().querySelector<HTMLInputElement>(
        'input[name="monto"]',
      )!;
      monto.value = '25000';
      monto.dispatchEvent(new Event('input'));
      await fixture.whenStable();

      elemento().querySelector('form')!.dispatchEvent(new Event('submit'));
      await fixture.whenStable();

      expect(api.agregarCuadro).toHaveBeenCalledWith(1, {
        categoriaJuegoId: 60,
        cupo: 16,
        montoInscripcionClp: 25000,
      });
      expect(texto()).toContain('0 es gratis');
    });
  });

  it('si la API no responde, lo dice en vez de reventar', async () => {
    const caida = () => Promise.reject(new Error('la API no respondió'));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Torneos,
          useValue: { cuadrosDelTorneo: caida, categoriasDeJuego: caida },
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
