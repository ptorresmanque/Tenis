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
        elemento().querySelector('[data-cuadro] li .font-semibold')?.textContent,
      ).toContain('Ana Uno');
    });

    it('el título lo dice, con el nombre del torneo arriba', async () => {
      await montar();

      expect(elemento().querySelector('h2')?.textContent).toContain('Cuadro de 4ª');
      expect(elemento().querySelector('header')?.textContent).toContain(
        'Copa de verano',
      );
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
