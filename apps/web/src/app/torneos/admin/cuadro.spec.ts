import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Cuadro, PartidoDelCuadro, Torneos } from '../torneos.service';
import { CuadroDelTorneo } from './cuadro';

/**
 * T51. El cuadro, que es lo que la gente mira en el mural del club.
 *
 * Lo que este archivo cuida: que **un hueco de primera ronda diga "Bye" y uno de las
 * demás diga "Por definir"**. Poner un guion en los dos casos haría parecer que el
 * cuadro está a medio armar, justo en la pantalla que se imprime y se cuelga.
 */
describe('CuadroDelTorneo', () => {
  const semifinal = (posicion: number, extra: Partial<PartidoDelCuadro> = {}) =>
    ({
      id: posicion,
      ronda: 1,
      ronda_nombre: 'Semifinal',
      posicion,
      jugadorA: 'Ana Uno',
      jugadorB: 'Beto Dos',
      jugadorAId: 1,
      jugadorBId: 2,
      ganadorId: null,
      marcador: null,
      walkover: false,
      ...extra,
    }) as PartidoDelCuadro;

  const FINAL: PartidoDelCuadro = {
    id: 3,
    ronda: 2,
    ronda_nombre: 'Final',
    posicion: 1,
    jugadorA: null,
    jugadorB: null,
    jugadorAId: null,
    jugadorBId: null,
    ganadorId: null,
    marcador: null,
    walkover: false,
  };

  const ARMADO: Cuadro = {
    torneoId: 5,
    estado: 'CUADRO_ARMADO',
    rondas: 2,
    semillaSorteo: 12345,
    partidos: [semifinal(1), semifinal(2), FINAL],
  };

  const SIN_ARMAR: Cuadro = {
    torneoId: 5,
    estado: 'INSCRIPCION',
    rondas: 0,
    semillaSorteo: null,
    partidos: [],
  };

  let fixture: ComponentFixture<CuadroDelTorneo>;
  let api: {
    cuadro: ReturnType<typeof vi.fn>;
    armarCuadro: ReturnType<typeof vi.fn>;
    deshacerCuadro: ReturnType<typeof vi.fn>;
    consecuencias: ReturnType<typeof vi.fn>;
    cargarResultado: ReturnType<typeof vi.fn>;
  };

  const montar = async (cuadro: Cuadro) => {
    api = {
      cuadro: vi.fn().mockResolvedValue(cuadro),
      armarCuadro: vi.fn().mockResolvedValue(ARMADO),
      deshacerCuadro: vi.fn().mockResolvedValue({ torneoId: 5 }),
      consecuencias: vi.fn().mockResolvedValue({ deshace: 0 }),
      cargarResultado: vi.fn().mockResolvedValue({ id: 1, deshechos: 0 }),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: Torneos, useValue: api }],
    });

    fixture = TestBed.createComponent(CuadroDelTorneo);
    fixture.componentRef.setInput('torneoId', 5);
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

  beforeEach(async () => {
    await montar(ARMADO);
  });

  it('dibuja las rondas con su nombre', () => {
    expect(texto()).toContain('Semifinal');
    expect(texto()).toContain('Final');
  });

  it('**muestra la semilla: el sorteo se puede rehacer**', () => {
    // Si alguien pregunta por qué le tocó ese cruce, la respuesta no es "salió así".
    expect(texto()).toContain('12345');
  });

  it('**un hueco de primera ronda es un bye, no un lugar por definir**', async () => {
    await montar({
      ...ARMADO,
      partidos: [
        semifinal(1, { jugadorB: null, jugadorBId: null, ganadorId: 1 }),
        semifinal(2),
        FINAL,
      ],
    });

    expect(texto()).toContain('Bye');
  });

  it('un hueco de las rondas siguientes está por definir', () => {
    expect(texto()).toContain('Por definir');
  });

  it('**el cuadro se dibuja entero desde el primer día, con la final incluida**', () => {
    // Una mitad en blanco no dice nada; una dibujada dice a quién te toca si ganás.
    const columnas = elemento().querySelectorAll('h4');

    expect(columnas).toHaveLength(2);
  });

  it('sin cuadro armado ofrece armarlo y explica qué hace', async () => {
    await montar(SIN_ARMAR);

    expect(texto()).toContain('los demás se sortean');
    await apretar('Armar el cuadro');

    expect(api.armarCuadro).toHaveBeenCalledWith(5);
  });

  it('con el cuadro armado ofrece deshacerlo, con su condición', () => {
    expect(texto()).toContain('Solo mientras no haya resultados');
  });

  it('deshacer lo pide al servidor', async () => {
    await apretar('Deshacer el cuadro');

    expect(api.deshacerCuadro).toHaveBeenCalledWith(5);
  });

  it('**si ya hay resultados, el servidor se niega y se lee su razón**', async () => {
    api.deshacerCuadro.mockRejectedValue({
      error: {
        message: 'Ese cuadro ya tiene 1 partido jugado: rehacerlo borraría resultados.',
      },
    });

    await apretar('Deshacer el cuadro');

    expect(texto()).toContain('borraría resultados');
  });

  it('**solo se ofrece cargar el resultado de un partido con sus dos jugadores**', () => {
    // La final está vacía: cargarle un resultado dejaría el cuadro contando puntos de
    // un partido que no se jugó, y el servidor lo rechaza igual.
    const botones = Array.from(elemento().querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('Cargar resultado'),
    );

    expect(botones).toHaveLength(2);
  });

  it('cargar un resultado manda el ganador y el marcador', async () => {
    await apretar('Cargar resultado');

    const radios = elemento().querySelectorAll('input[type="radio"]');
    (radios[1] as HTMLInputElement).click();
    const marcador = elemento().querySelector(
      'input[name="marcador"]',
    ) as HTMLInputElement;
    marcador.value = '6-4 6-3';
    marcador.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();

    await apretar('Guardar resultado');

    expect(api.cargarResultado).toHaveBeenCalledWith(5, 1, {
      ganadorId: 2,
      marcador: '6-4 6-3',
      walkover: false,
    });
  });

  it('**antes de corregir, dice cuántos partidos jugados va a deshacer**', async () => {
    // Lo que se confirma no es "¿seguro?", es este número: corregir una semifinal
    // borra la final que ya se jugó.
    await montar({
      ...ARMADO,
      partidos: [
        semifinal(1, { ganadorId: 1, marcador: '6-4 6-2' }),
        semifinal(2),
        FINAL,
      ],
    });
    api.consecuencias.mockResolvedValue({ deshace: 1 });

    await apretar('Corregir');

    expect(api.consecuencias).toHaveBeenCalledWith(5, 1);
    expect(texto()).toContain('deshace 1');
    expect(texto()).toContain('partido ya jugado');
  });

  it('un partido sin cargar no pregunta por consecuencias', async () => {
    await apretar('Cargar resultado');

    expect(api.consecuencias).not.toHaveBeenCalled();
  });

  it('el walkover se marca en el cuadro, no solo en la carga', async () => {
    await montar({
      ...ARMADO,
      partidos: [semifinal(1, { ganadorId: 1, walkover: true }), semifinal(2), FINAL],
    });

    expect(texto()).toContain('No se presentó');
  });

  it('el ganador de un partido se lee en negrita, no solo por el marcador', async () => {
    await montar({
      ...ARMADO,
      partidos: [
        semifinal(1, { ganadorId: 1, marcador: '6-4 6-2' }),
        semifinal(2),
        FINAL,
      ],
    });

    expect(texto()).toContain('6-4 6-2');
    // Dentro de la lista y no en todo el documento: el título del bloque también va
    // en negrita, y buscarlo suelto haría pasar este test por la razón equivocada.
    const enNegrita = elemento().querySelector('li .font-semibold');
    expect(enNegrita?.textContent).toContain('Ana Uno');
  });
});
