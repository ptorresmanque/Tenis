import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminCanchas } from '../../catalogo-canchas/admin/admin-canchas.service';
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
    programadoInicio: null,
    programadoFin: null,
    canchaId: null,
    cancha: null,
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
    programadoInicio: null,
    programadoFin: null,
    canchaId: null,
    cancha: null,
  };

  const ARMADO: Cuadro = {
    torneoId: 5,
    torneoCategoriaId: 7,
    categoria: '4ª',
    armado: true,
    estado: 'CUADRO_ARMADO',
    rondas: 2,
    semillaSorteo: 12345,
    partidos: [semifinal(1), semifinal(2), FINAL],
  };

  const SIN_ARMAR: Cuadro = {
    torneoId: 5,
    torneoCategoriaId: 7,
    categoria: '4ª',
    armado: false,
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
    programarPartido: ReturnType<typeof vi.fn>;
    desprogramarPartido: ReturnType<typeof vi.fn>;
    fotos: ReturnType<typeof vi.fn>;
  };

  /** Una foto colgada del primer partido, para el bloque de T69. */
  const FOTOS = [
    {
      id: 7,
      partidoId: 1,
      momento: 'ANTES',
      descripcion: null,
      miniatura: '/api/torneos/fotos/7/miniatura',
      imagen: '/api/torneos/fotos/7/imagen',
    },
  ];

  const CANCHAS = [
    { id: 1, nombre: 'Cancha 1', activa: true },
    { id: 9, nombre: 'Cancha vieja', activa: false },
  ];

  const montar = async (
    cuadro: Cuadro | Error,
    {
      fotos = FOTOS,
      canchas = CANCHAS,
    }: { fotos?: typeof FOTOS | Error; canchas?: typeof CANCHAS | Error } = {},
  ) => {
    api = {
      cuadro: vi.fn(() =>
        cuadro instanceof Error ? Promise.reject(cuadro) : Promise.resolve(cuadro),
      ),
      armarCuadro: vi.fn().mockResolvedValue(ARMADO),
      deshacerCuadro: vi.fn().mockResolvedValue({ torneoId: 5 }),
      consecuencias: vi.fn().mockResolvedValue({ deshace: 0 }),
      cargarResultado: vi.fn().mockResolvedValue({ id: 1, deshechos: 0 }),
      programarPartido: vi.fn().mockResolvedValue({ id: 1, bloqueoId: 7 }),
      desprogramarPartido: vi.fn().mockResolvedValue({ id: 1 }),
      fotos: vi.fn(() =>
        fotos instanceof Error ? Promise.reject(fotos) : Promise.resolve(fotos),
      ),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Torneos, useValue: api },
        {
          provide: AdminCanchas,
          useValue: {
            canchas: () =>
              canchas instanceof Error ? Promise.reject(canchas) : Promise.resolve(canchas),
          },
        },
      ],
    });

    // El componente abre un `<dialog>` con showModal(), que jsdom no implementa.
    HTMLDialogElement.prototype.showModal = vi.fn(function (
      this: HTMLDialogElement,
    ) {
      this.open = true;
    });
    HTMLDialogElement.prototype.close = vi.fn(function (
      this: HTMLDialogElement,
    ) {
      this.open = false;
    });

    fixture = TestBed.createComponent(CuadroDelTorneo);
    fixture.componentRef.setInput('cuadroId', 5);
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

  it('se titula con un h2, como las otras pestañas de la ficha', () => {
    // En la ficha, cada pestaña cuelga del h1 con el nombre del torneo, y en
    // Ajustes sus secciones ya eran h2: con h3 se saltaba un nivel y las
    // pestañas no se oían iguales (revisión de TV7.6).
    expect(elemento().querySelector('h2')?.textContent).toContain('Cuadro');
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
    // Una mitad en blanco no dice nada; una dibujada dice a quién te toca si ganas.
    const columnas = elemento().querySelectorAll('h3');

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

  it('**cargar el resultado también va en un modal**', async () => {
    // Era un `<div role="alertdialog">` dibujado en línea: un modal de mentira, vecino
    // de los dos que sí lo son. Dos acciones contiguas de la misma pantalla no pueden
    // comportarse distinto.
    await apretar('Cargar resultado');

    const abierto = elemento().querySelector('dialog[open]');
    expect(abierto?.textContent).toContain('Quién ganó');
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

  /**
   * T67. Ponerle cancha y hora a un partido.
   *
   * Lo que este bloque cuida: que **la razón del rechazo del servidor se lea tal cual**.
   * "No se puede" obliga al admin a adivinar; "Pedro no juega los martes de 18:00 a
   * 21:00" le dice qué mover, y es la decisión entera de T67.
   */
  describe('programar el partido (T67)', () => {
    const escribir = async (name: string, valor: string) => {
      // `input`: el `name` también queda en el `app-campo-fecha` que envuelve al campo.
      const campo = elemento().querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
      campo.value = valor;
      campo.dispatchEvent(new Event('input'));
      campo.dispatchEvent(new Event('change'));
      await fixture.whenStable();
      fixture.detectChanges();
    };

    const llenarYMandar = async () => {
      const cancha = elemento().querySelector<HTMLSelectElement>('[name="cancha"]')!;
      cancha.value = '1';
      cancha.dispatchEvent(new Event('change'));
      await fixture.whenStable();
      await escribir('fecha', '2026-11-07');
      await escribir('desde', '19:00');
      await escribir('hasta', '20:30');

      elemento().querySelector('form')!.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
      fixture.detectChanges();
    };

    it('si las canchas no cargan, el formulario se abre igual', async () => {
      await montar(ARMADO, { canchas: new Error('la API no respondió') });

      await apretar('Programar');

      expect(elemento().querySelector('dialog[open]')).not.toBeNull();
    });

    it('**el formulario va en un modal**, no en un bloque más bajo el cuadro', async () => {
      // Programar es una tarea con foco: se elige cancha, día y dos horas, y el
      // servidor puede rechazarlas por la restricción de un jugador. Con el formulario
      // debajo del cuadro había que buscarlo con la vista después de cada clic.
      await apretar('Programar');

      expect(elemento().querySelector('dialog[open]')).not.toBeNull();
    });

    it('manda cancha, día y horas', async () => {
      await apretar('Programar');
      await llenarYMandar();

      expect(api.programarPartido).toHaveBeenCalledWith(5, 1, {
        canchaId: 1,
        fecha: '2026-11-07',
        horaDesde: '19:00',
        horaHasta: '20:30',
      });
    });

    it('**la razón del servidor se lee entera**: dice quién no puede y cuándo', async () => {
      api.programarPartido.mockRejectedValue({
        error: {
          message: 'Pedro Soto no juega los martes de 18:00 a 21:00.',
        },
      });

      await apretar('Programar');
      await llenarYMandar();

      expect(texto()).toContain('no juega los martes de 18:00 a 21:00');
    });

    it('**sin día no se manda**: la hora sola no ubica el partido', async () => {
      await apretar('Programar');
      const cancha = elemento().querySelector<HTMLSelectElement>('[name="cancha"]')!;
      cancha.value = '1';
      cancha.dispatchEvent(new Event('change'));
      await fixture.whenStable();

      elemento().querySelector('form')!.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(api.programarPartido).not.toHaveBeenCalled();
    });

    it('**no ofrece una cancha desactivada**: el servidor la rechaza con un 404', async () => {
      await apretar('Programar');

      const opciones = Array.from(elemento().querySelectorAll('option')).map((o) =>
        o.textContent?.trim(),
      );

      expect(opciones).toContain('Cancha 1');
      expect(opciones).not.toContain('Cancha vieja');
    });

    it('lo programado se lee **en hora del club**, no en la del navegador', async () => {
      await montar({
        ...ARMADO,
        partidos: [
          semifinal(1, {
            // 22:00 UTC son las 19:00 en Santiago. Formateado con la zona de quien
            // mira, este mismo partido dice otra hora desde otro país.
            programadoInicio: '2026-11-07T22:00:00.000Z',
            programadoFin: '2026-11-08T00:00:00.000Z',
            canchaId: 1,
            cancha: 'Cancha 1',
          }),
          semifinal(2),
          FINAL,
        ],
      });

      expect(texto()).toContain('19:00');
      expect(texto()).toContain('Cancha 1');
    });

    it('quitar la hora libera la cancha', async () => {
      await montar({
        ...ARMADO,
        partidos: [
          semifinal(1, {
            programadoInicio: '2026-11-07T22:00:00.000Z',
            programadoFin: '2026-11-08T00:00:00.000Z',
            canchaId: 1,
            cancha: 'Cancha 1',
          }),
          semifinal(2),
          FINAL,
        ],
      });

      await apretar('Quitar la hora');

      expect(api.desprogramarPartido).toHaveBeenCalledWith(5, 1);
    });
  });

  /**
   * T69. La foto del partido, desde el cuadro.
   *
   * Lo que este bloque cuida: que **las fotos se pidan una vez para todo el cuadro**.
   * Un `resource` por partido serían dieciséis peticiones para dibujarlo.
   */
  describe('la foto del partido (T69)', () => {
    it('**pide las fotos del torneo una sola vez, no una por partido**', async () => {
      expect(api.fotos).toHaveBeenCalledTimes(1);
      expect(api.fotos).toHaveBeenCalledWith(5);
    });

    it('si las fotos no cargan, el cuadro se dibuja igual', async () => {
      await montar(ARMADO, { fotos: new Error('la API no respondió') });

      expect(texto()).toContain('Semifinal');
    });

    it('cada partido muestra solo las suyas', () => {
      const miniaturas = Array.from(
        elemento().querySelectorAll('img'),
      ).map((i) => i.getAttribute('src'));

      // Una sola: la del partido 1. El partido 2 y la final no tienen.
      expect(miniaturas).toEqual(['/api/torneos/fotos/7/miniatura']);
    });

    it('**se ofrece subirla desde el partido**, no desde una lista aparte', () => {
      const campos = elemento().querySelectorAll('input[type="file"]');

      // Uno por partido con sus dos jugadores; la final vacía no lleva.
      expect(campos).toHaveLength(2);
    });
  });

  // `value()` de un resource lanza en estado de error.
  it('si el cuadro no carga, lo dice', async () => {
    await montar(new Error('la API no respondió'));

    expect(texto()).toContain('No se pudo cargar el cuadro');
  });
});
