import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

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

  /** Es un MatDialog (T252): su contenido está en el contenedor de overlays. */
  const dialogo = () => document.querySelector<HTMLElement>('mat-dialog-container');
  const elemento = () => dialogo() ?? (fixture.nativeElement as HTMLElement);
  const texto = () => elemento().textContent ?? '';

  /** El árbol está en la segunda pestaña: Material dibuja solo la elegida (T262). */
  const verElArbol = async () => {
    elemento().querySelectorAll<HTMLElement>('[role="tab"]')[1].click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

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

    it('**con la lista oculta dice que se publica más adelante, sin un nombre** (T375)', async () => {
      // Bajo el umbral (80 % del cupo o 16 inscritos) la API no manda la lista: dos nombres
      // desmotivan. Sin «hay cupos»: el modal también se abre con la inscripción cerrada.
      await montar({ ...SIN_ARMAR, inscritos: null });

      expect(texto()).toContain('La lista de quienes juegan se publica más adelante.');
      expect(texto()).not.toContain('hay cupos');
      expect(elemento().querySelector('ol')).toBeNull();
    });

    it('una lista a la vista pero vacía dice que todavía no hay inscritos', async () => {
      // Pasa si todo el cupo está ofrecido a la lista de espera: cuenta para el umbral, pero
      // la lista es de los inscritos.
      await montar({ ...SIN_ARMAR, inscritos: [] });

      expect(texto()).toContain('Todavía no hay inscritos.');
      expect(elemento().querySelector('ol')).toBeNull();
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
      await verElArbol();
      const cuadro = elemento().querySelector('[data-cuadro]');

      expect(cuadro).not.toBeNull();
      expect(cuadro?.querySelector('table')).toBeNull();
      expect(cuadro?.matches('.overflow-x-auto')).toBe(true);
    });

    it('muestra el marcador y quién ganó', async () => {
      await montar();
      // El marcador, en el orden de juego; quién ganó, también en el árbol.
      expect(texto()).toContain('6-4 6-2');
      await verElArbol();

      expect(
        elemento().querySelector('[data-cuadro] [data-gano]')?.textContent,
      ).toContain('Ana Uno');
    });

    it('**primero el orden de juego** (T136): cuándo y dónde se juega', async () => {
      await montar();

      // Es la primera pestaña y la elegida; el árbol, la segunda (T137, T262).
      const primera = elemento().querySelector('[role="tab"]');
      expect(primera?.textContent?.trim()).toBe('Por día');
      expect(primera?.getAttribute('aria-selected')).toBe('true');
      expect(elemento().querySelector('app-orden-de-juego')).not.toBeNull();
    });

    it('el título lo dice, con el nombre del torneo arriba', async () => {
      await montar();

      expect(elemento().querySelector('h2')?.textContent).toContain('Cuadro de 4ª');
      expect(elemento().querySelector('header')?.textContent).toContain(
        'Copa de verano',
      );
    });
  });

  describe('las pestañas: por día y el árbol (T137, de Material desde T262)', () => {
    const pestanas = () => [...elemento().querySelectorAll<HTMLElement>('[role="tab"]')];
    const paneles = () => [...elemento().querySelectorAll<HTMLElement>('[role="tabpanel"]')];
    const enPantalla = (selector: string) => elemento().querySelector(selector) !== null;
    /** CDK lee `keyCode`, que jsdom deja en 0 si el evento solo trae `key`. */
    const tecla = async (key: string, keyCode: number) => {
      const evento = new KeyboardEvent('keydown', { key, bubbles: true });
      Object.defineProperty(evento, 'keyCode', { get: () => keyCode });
      (document.activeElement as HTMLElement).dispatchEvent(evento);
      await fixture.whenStable();
      fixture.detectChanges();
    };

    it('**arranca en "Por día"**, con el árbol en la otra pestaña', async () => {
      await montar();

      expect(pestanas().map((p) => p.textContent?.trim())).toEqual(['Por día', 'El árbol']);
      expect(pestanas()[0].getAttribute('aria-selected')).toBe('true');
      expect(enPantalla('app-orden-de-juego')).toBe(true);
      expect(enPantalla('app-arbol')).toBe(false);
    });

    it('cada pestaña dice qué panel controla, y el panel quién lo nombra', async () => {
      await montar();

      expect(pestanas()[1].getAttribute('aria-controls')).toBe(paneles()[1].id);
      expect(paneles()[1].getAttribute('aria-labelledby')).toBe(pestanas()[1].id);
    });

    it('apretar "El árbol" lo muestra', async () => {
      await montar();

      pestanas()[1].click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(pestanas()[1].getAttribute('aria-selected')).toBe('true');
      expect(enPantalla('app-arbol')).toBe(true);
      expect(enPantalla('app-orden-de-juego')).toBe(false);
    });

    it('**con el teclado**: las flechas mueven el foco y dan la vuelta, Inicio y Fin van a los extremos, y Enter elige', async () => {
      await montar();
      pestanas()[0].focus();

      await tecla('ArrowRight', 39);
      expect(document.activeElement).toBe(pestanas()[1]);
      // Al final da la vuelta, como pide el patrón de pestañas de ARIA.
      await tecla('ArrowRight', 39);
      expect(document.activeElement).toBe(pestanas()[0]);
      await tecla('End', 35);
      expect(document.activeElement).toBe(pestanas()[1]);
      await tecla('Home', 36);
      expect(document.activeElement).toBe(pestanas()[0]);
      await tecla('ArrowLeft', 37);
      expect(document.activeElement).toBe(pestanas()[1]);

      await tecla('Enter', 13);
      expect(pestanas()[1].getAttribute('aria-selected')).toBe('true');
      expect(enPantalla('app-arbol')).toBe(true);
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
      await verElArbol();
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

      // Ana Uno juega los dos partidos de la primera ronda del ejemplo. `p`: el campo de
      // Material también tiene su aviso vivo, el de la ayuda y el error (T246).
      expect(elemento().querySelector('p[aria-live]')?.textContent).toContain(
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

      expect(dialogo()).not.toBeNull();
      // MatDialog enfoca primero su contenedor y después el botón, un turno más tarde.
      await new Promise((listo) => setTimeout(listo));
      expect(document.activeElement?.textContent?.trim()).toBe('Cerrar');
    });

    it('sin cuadro elegido no se abre ni pide nada', async () => {
      await montar(ARMADO, [], [], null);

      expect(dialogo()).toBeNull();
      expect(api.cuadroPublico).not.toHaveBeenCalled();
    });

    it('**al cerrarse avisa, y el foco vuelve a quien lo abrió**', async () => {
      const abridor = document.createElement('button');
      document.body.append(abridor);
      abridor.focus();

      await montar();
      [...dialogo()!.querySelectorAll('button')]
        .find((boton) => boton.textContent?.trim() === 'Cerrar')!
        .click();
      await fixture.whenStable();

      expect(cerrados).toBe(1);
      expect(document.activeElement).toBe(abridor);
      abridor.remove();
    });

    it('**se cierra con Escape**, y avisa igual que con el botón', async () => {
      await montar();

      // Material mira el keyCode (27), que jsdom no llena desde `key`.
      const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      Object.defineProperty(escape, 'keyCode', { value: 27 });
      document.body.dispatchEvent(escape);
      await fixture.whenStable();

      expect(dialogo()).toBeNull();
      expect(cerrados).toBe(1);
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
