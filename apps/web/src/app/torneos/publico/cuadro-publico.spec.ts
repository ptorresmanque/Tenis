import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CuadroPublico, PartidoPublico, Torneos } from '../torneos.service';
import { CuadroPublicoModal } from './cuadro-publico';

/**
 * T135. El modal de una categoría: "quiénes juegan" antes de armar, el cuadro después
 * (decisión 6 de la sexta parte). Trae lo que antes se abría bajo la categoría —el
 * cuadro, las fotos y los lives—, y desde la sexta parte va en un `<dialog>`.
 */
describe('CuadroPublicoModal', () => {
  const SEMIFINAL: PartidoPublico = {
    ronda: 1,
    ronda_nombre: 'Semifinal',
    posicion: 1,
    jugadorA: 'Ana Uno',
    jugadorB: 'Beto Dos',
    siembraA: null,
    siembraB: null,
    ganador: 'Ana Uno',
    marcador: '6-4 6-2',
    walkover: false,
    inicio: null,
    fin: null,
    cancha: null,
  };

  const ARMADO: CuadroPublico = {
    id: 7,
    torneoId: 5,
    nombre: 'Copa de verano',
    categoria: '4ª',
    estado: 'CUADRO_ARMADO',
    inscritos: [
      { nombre: 'Ana Uno', pago: 'PAGADO' },
      { nombre: 'Beto Dos', pago: 'PAGADO' },
    ],
    partidos: [
      SEMIFINAL,
      { ...SEMIFINAL, posicion: 2, ganador: null, marcador: null },
      {
        ...SEMIFINAL,
        ronda: 2,
        ronda_nombre: 'Final',
        posicion: 1,
        jugadorA: null,
        jugadorB: null,
        ganador: null,
        marcador: null,
      },
    ],
  };

  const SIN_ARMAR: CuadroPublico = {
    ...ARMADO,
    estado: 'INSCRIPCION',
    inscritos: [
      { nombre: 'Carla Primera', pago: 'PAGADO' },
      { nombre: 'Diego Segundo', pago: 'PENDIENTE' },
      { nombre: 'Elena Tercera', pago: 'PAGADO' },
    ],
    partidos: [],
  };

  const EN_VIVO = {
    id: 3,
    canchaId: 1,
    cancha: 'Cancha 1',
    url: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    miniatura: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    titulo: null,
    inicio: '2026-11-07T13:00:00.000Z',
    fin: '2026-11-07T22:00:00.000Z',
  };

  const FOTO = {
    id: 4,
    partidoId: null,
    momento: 'DURANTE',
    descripcion: 'La entrega de premios',
    miniatura: '/api/torneos/fotos/4/miniatura',
    imagen: '/api/torneos/fotos/4/imagen',
  };

  let fixture: ComponentFixture<CuadroPublicoModal>;
  let api: {
    cuadroPublico: ReturnType<typeof vi.fn>;
    transmisionesPublicas: ReturnType<typeof vi.fn>;
    fotos: ReturnType<typeof vi.fn>;
  };
  let cerrados: number;

  const responder = <T>(valor: T | Error) =>
    vi.fn(() =>
      valor instanceof Error ? Promise.reject(valor) : Promise.resolve(valor),
    );

  const montar = async (
    cuadro: CuadroPublico | Error = ARMADO,
    transmisiones: unknown[] | Error = [],
    fotos: unknown[] | Error = [],
    cuadroId: number | null = 7,
  ) => {
    api = {
      cuadroPublico: responder(cuadro),
      transmisionesPublicas: responder(transmisiones),
      fotos: responder(fotos),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: Torneos, useValue: api }],
    });

    fixture = TestBed.createComponent(CuadroPublicoModal);
    cerrados = 0;
    fixture.componentInstance.cerrar.subscribe(() => (cerrados += 1));
    fixture.componentRef.setInput('cuadroId', cuadroId);
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const texto = () => elemento().textContent ?? '';
  const dialogo = () => elemento().querySelector('dialog')!;

  beforeEach(() => {
    // jsdom no implementa `showModal` ni `close`.
    HTMLDialogElement.prototype.showModal = vi.fn(function (
      this: HTMLDialogElement,
    ) {
      this.open = true;
    });
    HTMLDialogElement.prototype.close = vi.fn(function (
      this: HTMLDialogElement,
    ) {
      this.open = false;
      this.dispatchEvent(new Event('close'));
    });
  });

  describe('antes de armar: quiénes juegan', () => {
    it('**en el orden en que se inscribieron**, numerados', async () => {
      await montar(SIN_ARMAR);

      const filas = [...elemento().querySelectorAll('ol li')].map((li) =>
        li.textContent?.replace(/\s+/g, ' ').trim(),
      );

      expect(filas[0]).toMatch(/^1 Carla Primera/);
      expect(filas[1]).toMatch(/^2 Diego Segundo/);
      expect(filas[2]).toMatch(/^3 Elena Tercera/);
    });

    it('**con el estado del pago y nada más**: ni teléfono ni procedencia', async () => {
      await montar(SIN_ARMAR);

      const filas = [...elemento().querySelectorAll('ol li')];
      expect(filas[0].textContent).toContain('Pagado');
      expect(filas[1].textContent).toContain('Pago pendiente');
      expect(texto()).not.toMatch(/\+?56\d{8}/);
    });

    it('en una categoría gratis no hay estado de pago que mostrar', async () => {
      await montar({
        ...SIN_ARMAR,
        inscritos: [{ nombre: 'Carla Primera', pago: null }],
      });

      expect(elemento().querySelector('ol li')?.textContent).not.toContain('Pag');
    });

    it('el título lo dice', async () => {
      await montar(SIN_ARMAR);

      expect(elemento().querySelector('h2')?.textContent).toContain(
        'Quiénes juegan en 4ª',
      );
    });
  });

  describe('después de armar: el cuadro', () => {
    it('**va en columnas que se desplazan, no en una tabla que se encoge**', async () => {
      // En 375px una tabla de cuatro rondas queda ilegible, y este cuadro se mira
      // sobre todo desde el teléfono, en el club.
      await montar();
      const cuadro = elemento().querySelector('[data-cuadro]');

      expect(cuadro).not.toBeNull();
      expect(cuadro?.querySelector('table')).toBeNull();
      expect(cuadro?.matches('.overflow-x-auto')).toBe(true);
    });

    it('muestra el marcador y quién ganó', async () => {
      await montar();

      expect(texto()).toContain('6-4 6-2');
      expect(
        elemento().querySelector('[data-cuadro] [data-gano]')?.textContent,
      ).toContain('Ana Uno');
    });

    it('**primero el orden de juego** (T136): cuándo y dónde se juega', async () => {
      await montar();

      const orden = elemento().querySelector('app-orden-de-juego');
      expect(orden).not.toBeNull();
      // Antes que el árbol, que queda debajo hasta que T137 lo pase a su pestaña.
      expect(
        orden!.compareDocumentPosition(elemento().querySelector('[data-cuadro]')!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('el título lo dice, con el nombre del torneo arriba', async () => {
      await montar();

      expect(elemento().querySelector('h2')?.textContent).toContain('Cuadro de 4ª');
      expect(elemento().querySelector('header')?.textContent).toContain(
        'Copa de verano',
      );
    });
  });

  describe('las pestañas: por día y el árbol (T137)', () => {
    const pestanas = () => [...elemento().querySelectorAll<HTMLElement>('[role="tab"]')];
    const panel = (id: string) =>
      elemento().querySelector<HTMLElement>(`[role="tabpanel"]#panel-${id}`)!;
    const tecla = async (key: string) => {
      (document.activeElement as HTMLElement).dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true }),
      );
      await fixture.whenStable();
      fixture.detectChanges();
    };

    it('**arranca en "Por día"**, con el árbol en la otra pestaña', async () => {
      await montar();

      expect(pestanas().map((p) => p.textContent?.trim())).toEqual(['Por día', 'El árbol']);
      expect(pestanas()[0].getAttribute('aria-selected')).toBe('true');
      expect(panel('dia').hidden).toBe(false);
      expect(panel('arbol').hidden).toBe(true);
    });

    it('cada pestaña dice qué panel controla, y el panel quién lo nombra', async () => {
      await montar();

      expect(pestanas()[1].getAttribute('aria-controls')).toBe('panel-arbol');
      expect(panel('arbol').getAttribute('aria-labelledby')).toBe('pestana-arbol');
    });

    it('apretar "El árbol" lo muestra', async () => {
      await montar();

      pestanas()[1].click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(pestanas()[1].getAttribute('aria-selected')).toBe('true');
      expect(panel('arbol').hidden).toBe(false);
      expect(panel('dia').hidden).toBe(true);
    });

    it('**con el teclado**: las flechas mueven la pestaña y el foco; Inicio y Fin van a los extremos', async () => {
      await montar();
      pestanas()[0].focus();

      await tecla('ArrowRight');
      expect(document.activeElement).toBe(pestanas()[1]);
      expect(panel('arbol').hidden).toBe(false);

      // Al final da la vuelta, como pide el patrón de pestañas de ARIA.
      await tecla('ArrowRight');
      expect(document.activeElement).toBe(pestanas()[0]);

      await tecla('End');
      expect(document.activeElement).toBe(pestanas()[1]);
      await tecla('Home');
      expect(document.activeElement).toBe(pestanas()[0]);
      await tecla('ArrowLeft');
      expect(document.activeElement).toBe(pestanas()[1]);
    });

    it('**solo la pestaña elegida entra en el orden del tabulador**', async () => {
      await montar();

      expect(pestanas().map((p) => p.tabIndex)).toEqual([0, -1]);
    });
  });

  describe('el buscador, uno para las dos pestañas (T136 y T137)', () => {
    const buscar = async (busqueda: string) => {
      const campo = elemento().querySelector<HTMLInputElement>('input[type="search"]')!;
      campo.value = busqueda;
      campo.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      fixture.detectChanges();
    };

    it('**marca en el orden de juego y en el árbol**', async () => {
      await montar();

      await buscar('beto');

      expect(elemento().querySelector('app-orden-de-juego [data-tuyo]')).not.toBeNull();
      expect(elemento().querySelector('app-arbol [data-tuyo]')).not.toBeNull();
    });

    it('**si no hay nadie con ese nombre, lo dice**', async () => {
      await montar();

      await buscar('zúñiga');

      expect(texto()).toContain('Nadie con ese nombre en esta categoría');
    });

    it('dice cuántos encontró, para el lector de pantalla', async () => {
      await montar();

      await buscar('ana');

      // Ana Uno juega los dos partidos de la primera ronda del ejemplo.
      expect(elemento().querySelector('[aria-live]')?.textContent).toContain(
        '2 partidos de "ana"',
      );
    });

    it('cada categoría empieza sin búsqueda', async () => {
      await montar();
      await buscar('ana');

      // A otra categoría y de vuelta: el mock responde siempre la 7.
      for (const id of [8, 7]) {
        fixture.componentRef.setInput('cuadroId', id);
        await fixture.whenStable();
        fixture.detectChanges();
      }

      expect(elemento().querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe('');
    });
  });

  describe('el modal', () => {
    it('**se abre al recibir un cuadro, y el foco entra al botón de cerrar**', async () => {
      await montar();

      expect(dialogo().open).toBe(true);
      expect(document.activeElement?.textContent?.trim()).toBe('Cerrar');
    });

    it('sin cuadro elegido no se abre ni pide nada', async () => {
      await montar(ARMADO, [], [], null);

      expect(dialogo().open).toBe(false);
      expect(api.cuadroPublico).not.toHaveBeenCalled();
    });

    it('**al cerrarse avisa, y el foco vuelve a quien lo abrió**', async () => {
      const abridor = document.createElement('button');
      document.body.append(abridor);
      abridor.focus();

      await montar();
      // Escape, el clic en el fondo y el botón terminan todos en el evento `close`.
      dialogo().close();
      await fixture.whenStable();

      expect(cerrados).toBe(1);
      expect(document.activeElement).toBe(abridor);
      abridor.remove();
    });

    it('**se cierra con Escape y con un clic en el fondo**', async () => {
      await montar();

      expect(dialogo().getAttribute('closedby')).toBe('any');
    });

    it('**no muestra el cuadro de otra categoría mientras carga el suyo**', async () => {
      // El `resource` conserva el valor anterior hasta que llega el nuevo: sin mirar de
      // quién es el cuadro que se tiene en la mano, se dibujaría el de la categoría
      // anterior con el título de la nueva. Acá el servidor devuelve el 7 y se pide el 99.
      await montar(ARMADO, [], [], 99);

      expect(texto()).not.toContain('6-4 6-2');
    });

    it('si el cuadro no carga, lo dice', async () => {
      await montar(new Error('la API no respondió'));

      expect(texto()).toContain('No se pudo cargar el cuadro');
    });
  });

  describe('las fotos y los lives del torneo', () => {
    it('**el live se ve acá, sin ir a YouTube ni cargar nada de Google**', async () => {
      await montar(ARMADO, [EN_VIVO]);

      expect(texto()).toContain('En vivo');
      expect(texto()).toContain('Cancha 1');
      expect(elemento().querySelector('iframe')).toBeNull();
    });

    it('sin transmisiones no aparece el bloque vacío', async () => {
      await montar(ARMADO, []);

      expect(texto()).not.toContain('En vivo');
    });

    it('**las fotos del torneo salen debajo del cuadro** (T69)', async () => {
      await montar(ARMADO, [], [FOTO]);

      expect(
        elemento().querySelector('app-galeria img')?.getAttribute('src'),
      ).toBe('/api/torneos/fotos/4/miniatura');
    });

    it('si las fotos y los lives no cargan, el cuadro se ve igual', async () => {
      await montar(ARMADO, new Error('sin lives'), new Error('sin fotos'));

      expect(texto()).toContain('6-4 6-2');
    });
  });
});
