import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PartidoMio, Ranking, Rival } from './ranking.service';
import { MisPartidos } from './mis-partidos';

/**
 * T55. Los partidos amistosos, desde la pantalla del socio.
 *
 * Lo que este archivo cuida por encima de todo: que **el botón de contestar aparezca
 * solo donde corresponde**. Si le apareciera a quien cargó el partido, podría
 * confirmarse a sí mismo con un clic y la regla entera del ranking interno se cae.
 */
describe('MisPartidos', () => {
  const ESPERANDOME: PartidoMio = {
    id: 1,
    rival: 'Ana Uno',
    ganeYo: false,
    marcador: '6-4 6-2',
    jugadoEn: '2026-08-20',
    estado: 'PENDIENTE',
    esperaMiRespuesta: true,
    resueltoPorAdmin: false,
  };

  const CARGADO_POR_MI: PartidoMio = {
    id: 2,
    rival: 'Beto Dos',
    ganeYo: true,
    marcador: '7-5 6-3',
    jugadoEn: '2026-08-18',
    estado: 'PENDIENTE',
    esperaMiRespuesta: false,
    resueltoPorAdmin: false,
  };

  const RIVALES: Rival[] = [
    { socioId: 10, numeroSocio: 'S-10', nombre: 'Ana Uno' },
    { socioId: 20, numeroSocio: 'S-20', nombre: 'Beto Dos' },
  ];

  let fixture: ComponentFixture<MisPartidos>;
  let api: {
    misPartidos: ReturnType<typeof vi.fn>;
    rivales: ReturnType<typeof vi.fn>;
    cargarPartido: ReturnType<typeof vi.fn>;
    responderPartido: ReturnType<typeof vi.fn>;
  };

  const montar = async (partidos: PartidoMio[] = [ESPERANDOME, CARGADO_POR_MI]) => {
    api = {
      misPartidos: vi.fn().mockResolvedValue(partidos),
      rivales: vi.fn().mockResolvedValue(RIVALES),
      cargarPartido: vi.fn().mockResolvedValue({ id: 9 }),
      responderPartido: vi.fn().mockResolvedValue({ id: 1 }),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: Ranking, useValue: api }],
    });

    fixture = TestBed.createComponent(MisPartidos);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const texto = () => elemento().textContent ?? '';

  /** La tarjeta de un partido, por su id. */
  const tarjeta = (id: number) => elemento().querySelector<HTMLElement>(`[data-partido="${id}"]`);

  const botonEn = (dentro: HTMLElement | null, etiqueta: string) =>
    Array.from(dentro?.querySelectorAll('button') ?? []).find((b) =>
      b.textContent?.trim().startsWith(etiqueta),
    );

  const apretar = async (boton: HTMLButtonElement | undefined) => {
    boton?.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await montar();
  });

  it('muestra cada partido con su rival y el marcador', () => {
    expect(texto()).toContain('Ana Uno');
    expect(texto()).toContain('6-4 6-2');
  });

  it('dice si gané o perdí, que es lo que se mira primero', () => {
    // 'Perdiste con' y no 'perdiste a': en español lo segundo dice otra cosa.
    expect(tarjeta(2)?.textContent).toContain('Le ganaste a Beto Dos');
    expect(tarjeta(1)?.textContent).toContain('Perdiste con Ana Uno');
  });

  it('**el botón de contestar sale solo en el que me espera a mí**', () => {
    // Es la regla entera: si apareciera en el que cargué yo, podría confirmarme a mí
    // mismo y la confirmación del rival no existiría.
    expect(botonEn(tarjeta(1), 'Confirmar')).toBeDefined();
    expect(botonEn(tarjeta(2), 'Confirmar')).toBeUndefined();
  });

  it('el que cargué yo dice que está esperando al otro', () => {
    expect(tarjeta(2)?.textContent).toContain('Esperando');
  });

  it('confirmar avisa al servidor y recarga la lista', async () => {
    await apretar(botonEn(tarjeta(1), 'Confirmar'));

    expect(api.responderPartido).toHaveBeenCalledWith(1, true);
    // Dos veces: la carga inicial y la de después de contestar. Sin recargar, la
    // tarjeta seguiría ofreciendo el botón de algo que ya se contestó.
    expect(api.misPartidos).toHaveBeenCalledTimes(2);
  });

  it('rechazar manda que no', async () => {
    await apretar(botonEn(tarjeta(1), 'No fue así'));

    expect(api.responderPartido).toHaveBeenCalledWith(1, false);
  });

  it('**un partido rechazado dice que no puntúa**', async () => {
    // Sin decirlo, alguien lo ve "rechazado" en la lista y no entiende por qué su
    // ranking no se movió.
    await montar([{ ...ESPERANDOME, estado: 'RECHAZADO', esperaMiRespuesta: false }]);

    expect(texto()).toContain('no suma');
  });

  it('un partido que resolvió el club lo dice', async () => {
    await montar([
      {
        ...ESPERANDOME,
        estado: 'CONFIRMADO',
        esperaMiRespuesta: false,
        resueltoPorAdmin: true,
      },
    ]);

    expect(texto()).toContain('el club');
  });

  it('sin partidos lo dice, en vez de quedar en blanco', async () => {
    await montar([]);

    expect(texto()).toContain('Todavía no cargaste');
  });

  describe('cargar uno nuevo', () => {
    it('**el formulario no deja elegirme a mí como rival**', () => {
      // La lista viene del servidor ya sin uno mismo; esto comprueba que la pantalla
      // usa esa lista y no arma la suya.
      const opciones = Array.from(elemento().querySelectorAll('select[name="rival"] option')).map(
        (o) => o.textContent?.trim(),
      );

      // Con el número de socio: dos que se llamen igual tienen que distinguirse.
      expect(opciones).toContain('Ana Uno · S-10');
      expect(opciones).toContain('Beto Dos · S-20');
    });

    it('manda el partido con quien ganó', async () => {
      const seleccionar = (nombre: string, valor: string) => {
        const campo = elemento().querySelector<HTMLSelectElement>(`select[name="${nombre}"]`)!;
        campo.value = valor;
        campo.dispatchEvent(new Event('change'));
      };

      seleccionar('rival', '10');
      seleccionar('ganador', 'rival');
      fixture.detectChanges();

      await apretar(botonEn(elemento(), 'Cargar el partido'));

      expect(api.cargarPartido).toHaveBeenCalledWith(
        expect.objectContaining({ rivalSocioId: 10, ganadorSocioId: 10 }),
      );
    });

    it('sin rival elegido no manda nada', async () => {
      await apretar(botonEn(elemento(), 'Cargar el partido'));

      expect(api.cargarPartido).not.toHaveBeenCalled();
    });

    it('**avisa que el partido no puntúa hasta que el rival lo confirme**', () => {
      // Quien lo carga tiene que entender por qué su ranking no se movió todavía.
      expect(texto()).toContain('confirme');
    });

    it('si el servidor rechaza la carga, lo dice en vez de callarse', async () => {
      api.cargarPartido.mockRejectedValue(new Error('no'));

      const campo = elemento().querySelector<HTMLSelectElement>('select[name="rival"]')!;
      campo.value = '10';
      campo.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      await apretar(botonEn(elemento(), 'Cargar el partido'));

      expect(texto()).toContain('No se pudo');
    });
  });
});
