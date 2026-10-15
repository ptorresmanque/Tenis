import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Auth, UsuarioActual } from '../../core/auth/auth';
import { Agenda, ObservacionDeReserva, ReservaDelDia } from './agenda.service';
import { ObservacionesDeReserva } from './observaciones-de-reserva';
import { responder, textoDelDialogo } from '../../testing/dialogos';

/**
 * T226. Las observaciones bajo cada reserva de la agenda (`SPEC-reservas.md` §
 * Observaciones del mesón, criterios 52–54): se anotan ahí mismo, las corrige y las borra
 * el autor o un admin, y de un socio se puede abrir lo que tiene de antes.
 */
describe('ObservacionesDeReserva', () => {
  const GESTORA: UsuarioActual = {
    id: 5,
    nombre: 'Carolina',
    apellido: 'Díaz',
    email: 'carolina@ejemplo.cl',
    telefono: null,
    esAdmin: false,
    esGestor: true,
    socioId: null,
    socioActivo: false,
    socioAlDia: false,
    profesorId: null,
  };
  const ADMIN: UsuarioActual = { ...GESTORA, id: 1, esAdmin: true, esGestor: false };

  const nota = (parche: Partial<ObservacionDeReserva>): ObservacionDeReserva => ({
    id: 1,
    texto: 'Se pasó 20 minutos de su hora.',
    autorId: 5,
    autorNombre: 'Carolina Díaz',
    // 23:15Z es 20:15 en el club.
    creadaEn: '2026-10-14T23:15:00.000Z',
    editadaEn: null,
    ...parche,
  });

  const RESERVA: ReservaDelDia = {
    id: 40,
    folio: 'AB23CDE',
    cancha: 'Cancha 1',
    canchaId: 1,
    inicio: '2026-10-14T22:00:00.000Z',
    fin: '2026-10-14T23:00:00.000Z',
    estado: 'CONFIRMADA',
    nombre: 'Matías Rojas',
    telefono: '56933333333',
    esSocio: true,
    socioId: 2,
    acompanantes: [],
    observaciones: [
      nota({}),
      nota({ id: 2, texto: 'Dejó la red baja.', autorId: 9, autorNombre: 'Otro Gestor' }),
    ],
    observacionesAnteriores: 2,
  };

  let fixture: ComponentFixture<ObservacionesDeReserva>;
  let api: {
    anotar: ReturnType<typeof vi.fn>;
    corregir: ReturnType<typeof vi.fn>;
    borrar: ReturnType<typeof vi.fn>;
    historial: ReturnType<typeof vi.fn>;
  };
  let cambios: number;

  const el = () => fixture.nativeElement as HTMLElement;
  const texto = () => el().textContent?.replace(/\s+/g, ' ') ?? '';
  const esperar = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const botones = (dentro: ParentNode = el()) => [...dentro.querySelectorAll('button')];
  const apretar = async (etiqueta: string, dentro: ParentNode = el()) => {
    botones(dentro)
      .find((b) => b.textContent?.trim().startsWith(etiqueta))!
      .click();
    await esperar();
  };
  const escribir = async (selector: string, valor: string) => {
    const campo = el().querySelector<HTMLTextAreaElement>(selector)!;
    campo.value = valor;
    campo.dispatchEvent(new Event('input'));
    await esperar();
  };
  const filaDe = (textoDeLaNota: string) =>
    [...el().querySelectorAll('li')].find((li) => li.textContent?.includes(textoDeLaNota))!;

  const montar = async (yo = GESTORA, reserva = RESERVA) => {
    api = {
      anotar: vi.fn().mockResolvedValue(nota({ id: 3 })),
      corregir: vi.fn().mockResolvedValue(nota({})),
      borrar: vi.fn().mockResolvedValue({ id: 1 }),
      historial: vi.fn().mockResolvedValue([
        {
          ...nota({ id: 7, texto: 'Llegó tarde.' }),
          reservaId: 30,
          folio: 'X',
          cancha: 'Cancha 2',
          inicio: '2026-10-02T22:00:00.000Z',
        },
        {
          ...nota({ id: 1 }),
          reservaId: 40,
          folio: 'AB23CDE',
          cancha: 'Cancha 1',
          inicio: RESERVA.inicio,
        },
      ]),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Agenda, useValue: api },
        { provide: Auth, useValue: { usuario: signal(yo).asReadonly() } },
      ],
    });

    fixture = TestBed.createComponent(ObservacionesDeReserva);
    fixture.componentRef.setInput('reserva', reserva);
    cambios = 0;
    fixture.componentInstance.cambio.subscribe(() => (cambios += 1));
    await esperar();
  };

  beforeEach(async () => {
    await montar();
  });

  it('muestra cada observación con su autor y su hora (52)', () => {
    expect(texto()).toContain('Se pasó 20 minutos de su hora.');
    expect(texto()).toContain('Carolina Díaz');
    expect(texto()).toContain('20:15');
    expect(texto()).toContain('Dejó la red baja.');
  });

  it('la que se corrigió lo dice', async () => {
    await montar(GESTORA, {
      ...RESERVA,
      observaciones: [nota({ editadaEn: '2026-10-14T23:30:00.000Z' })],
    });

    expect(texto()).toContain('corregida');
  });

  it('la gestora corrige y borra solo las suyas; el admin, todas (54)', async () => {
    const suya = filaDe('Se pasó 20 minutos');
    const ajena = filaDe('Dejó la red baja');
    expect(botones(suya).map((b) => b.textContent?.trim())).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Corregir/),
        expect.stringMatching(/^Borrar/),
      ]),
    );
    expect(botones(ajena)).toHaveLength(0);

    await montar(ADMIN);
    expect(botones(filaDe('Dejó la red baja')).length).toBeGreaterThan(0);
  });

  it('anota una observación y avisa a la agenda para que recargue (52)', async () => {
    await apretar('Anotar observación');
    await escribir('textarea[name="nueva-observacion"]', 'Se pasó de su hora.');
    await apretar('Guardar');

    expect(api.anotar).toHaveBeenCalledWith(40, 'Se pasó de su hora.');
    expect(cambios).toBe(1);
  });

  it('corrige la suya', async () => {
    await apretar('Corregir', filaDe('Se pasó 20 minutos'));
    await escribir('textarea[name="corregir-1"]', 'Se pasó 30 minutos.');
    await apretar('Guardar');

    expect(api.corregir).toHaveBeenCalledWith(1, 'Se pasó 30 minutos.');
    expect(cambios).toBe(1);
  });

  it('borrar pregunta antes', async () => {
    await apretar('Borrar', filaDe('Se pasó 20 minutos'));

    // La pregunta es un diálogo (T253), con la pregunta de título.
    expect(textoDelDialogo()).toContain('¿Borrar esta observación?');
    expect(api.borrar).not.toHaveBeenCalled();

    await responder(fixture, true);

    expect(api.borrar).toHaveBeenCalledWith(1);
    expect(cambios).toBe(1);
  });

  it('descartar el borrado no borra nada', async () => {
    await apretar('Borrar', filaDe('Se pasó 20 minutos'));
    await responder(fixture, false);

    expect(api.borrar).not.toHaveBeenCalled();
  });

  it('"2 observaciones anteriores" abre el historial, sin repetir las de esta reserva (53)', async () => {
    expect(api.historial).not.toHaveBeenCalled();

    await apretar('2 observaciones anteriores');

    expect(api.historial).toHaveBeenCalledWith(2);
    expect(texto()).toContain('Llegó tarde.');
    expect(texto()).toContain('Cancha 2');
    // La de esta reserva ya está arriba: no sale dos veces.
    expect(texto().match(/Se pasó 20 minutos de su hora\./g)).toHaveLength(1);
  });

  it('al visitante no le ofrece historial', async () => {
    await montar(GESTORA, {
      ...RESERVA,
      socioId: null,
      esSocio: false,
      observacionesAnteriores: 0,
    });

    expect(texto()).not.toContain('anteriores');
  });

  it('si el servidor rechaza, dice su mensaje y no avisa a la agenda', async () => {
    api.anotar.mockRejectedValue({
      status: 400,
      error: { message: 'La observación puede tener hasta 500 caracteres.' },
    });

    await apretar('Anotar observación');
    await escribir('textarea[name="nueva-observacion"]', 'x');
    await apretar('Guardar');

    expect(texto()).toContain('La observación puede tener hasta 500 caracteres.');
    expect(cambios).toBe(0);
  });
});
