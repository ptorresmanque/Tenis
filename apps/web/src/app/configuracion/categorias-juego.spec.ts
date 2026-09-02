import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CategoriaDeJuego, CategoriasDeJuego } from './categorias-juego.service';
import { CategoriasDeJuegoPanel } from './categorias-juego';

/**
 * T60. Las categorías con que juega el club.
 *
 * Lo que este archivo cuida: que **retirar una categoría se lea como retirar y no
 * como borrar** —la pantalla es lo único que le dice al club que la fila se queda— y
 * que reordenar por el número no mande al servidor un valor que no es un lugar.
 */
describe('CategoriasDeJuegoPanel', () => {
  const QUINTA: CategoriaDeJuego = {
    id: 1,
    nombre: '5ª',
    orden: 10,
    activa: true,
  };

  const HONOR: CategoriaDeJuego = {
    id: 6,
    nombre: 'Honor',
    orden: 60,
    activa: true,
  };

  let fixture: ComponentFixture<CategoriasDeJuegoPanel>;
  let api: {
    listar: ReturnType<typeof vi.fn>;
    crear: ReturnType<typeof vi.fn>;
    editar: ReturnType<typeof vi.fn>;
  };

  const montar = async (categorias: CategoriaDeJuego[]) => {
    api = {
      listar: vi.fn().mockResolvedValue(categorias),
      crear: vi.fn().mockResolvedValue(HONOR),
      editar: vi.fn().mockResolvedValue(HONOR),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: CategoriasDeJuego, useValue: api }],
    });

    fixture = TestBed.createComponent(CategoriasDeJuegoPanel);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const texto = () => elemento().textContent ?? '';

  const apretar = async (etiqueta: string) => {
    Array.from(elemento().querySelectorAll('button'))
      .find((b) => b.textContent?.trim().startsWith(etiqueta))
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const campoDeOrden = (id: number) =>
    elemento().querySelector<HTMLInputElement>(`#orden-${id}`);

  const escribirOrden = async (id: number, valor: string) => {
    const campo = campoDeOrden(id);
    campo!.value = valor;
    campo!.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await montar([QUINTA, HONOR]);
  });

  it('las muestra en el orden que trae el servidor, que es el del campo `orden`', () => {
    const nombres = Array.from(elemento().querySelectorAll('tbody td:first-child'))
      .map((celda) => celda.textContent?.trim());

    expect(nombres).toEqual(['5ª', 'Honor']);
  });

  it('**dice que retirar no borra**, que es lo único que se lo dice al club', () => {
    // Sin esta frase, "Retirar" se lee como el botón que hace desaparecer la
    // categoría y con ella los torneos que la jugaron.
    expect(texto()).toContain('no la borra');
  });

  it('avisa que no son las categorías de torneo', () => {
    // Es la confusión que `SPEC-torneos.md` § Las dos categorías que no son la misma
    // dice que el módulo más quiere evitar, y el club usa la misma palabra para las
    // dos cosas.
    expect(texto()).toContain('Club 250');
  });

  it('retirar una categoría manda `activa: false` y no la borra', async () => {
    await apretar('Retirar');

    expect(api.editar).toHaveBeenCalledWith(QUINTA.id, { activa: false });
  });

  it('la retirada ofrece volver a ofrecerse, no volver a crearse', async () => {
    await montar([{ ...QUINTA, activa: false }]);

    expect(texto()).toContain('Volver a ofrecer');

    await apretar('Volver a ofrecer');
    expect(api.editar).toHaveBeenCalledWith(QUINTA.id, { activa: true });
  });

  it('mover una categoría manda el lugar nuevo', async () => {
    await escribirOrden(QUINTA.id, '35');

    expect(api.editar).toHaveBeenCalledWith(QUINTA.id, { orden: 35 });
  });

  it('**un lugar en cero o vacío no llega al servidor**', async () => {
    // El campo es `type="number"`: un texto vacío o un cero llegan como 0 o NaN, y
    // mandarlos produce un 400 que el club lee como "no se pudo mover" sin saber qué
    // arreglar.
    await escribirOrden(QUINTA.id, '0');

    expect(api.editar).not.toHaveBeenCalled();
    expect(texto()).toContain('mayor que cero');
  });

  it('**el lugar por omisión sale de la lista, no de un número escrito a mano**', async () => {
    // Con un `70` fijo, agregada una séptima categoría en 70 el siguiente que abra la
    // pantalla recibe un 409 al primer intento contra el único de `orden`.
    const nuevo = () =>
      elemento().querySelector<HTMLInputElement>('input[name="orden"]')!.value;

    expect(nuevo()).toBe('70');

    await montar([QUINTA, HONOR, { id: 7, nombre: 'Sub-18', orden: 70, activa: true }]);
    expect(nuevo()).toBe('80');
  });

  it('agregar toma el lugar derivado y no obliga al admin a escribirlo', async () => {
    const campo = elemento().querySelector<HTMLInputElement>(
      'input[name="nombre"]',
    )!;
    campo.value = 'Sub-18';
    campo.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    await apretar('Agregar');

    expect(api.crear).toHaveBeenCalledWith('Sub-18', 70);
  });

  it('agregar sin nombre no llama al servidor', async () => {
    await apretar('Agregar');

    expect(api.crear).not.toHaveBeenCalled();
    expect(texto()).toContain('Escribe el nombre');
  });

  it('**recarga la lista aunque el servidor rechace el movimiento**', async () => {
    // Un choque de lugares deja escrito en la fila un número que no es el guardado.
    // Sin recargar, la pantalla miente hasta que alguien la refresque a mano.
    api.editar.mockRejectedValueOnce(
      new Error('Ya hay una categoría en ese lugar'),
    );
    const consultasPrevias = api.listar.mock.calls.length;

    await escribirOrden(QUINTA.id, '60');

    expect(api.listar.mock.calls.length).toBeGreaterThan(consultasPrevias);
  });
});
