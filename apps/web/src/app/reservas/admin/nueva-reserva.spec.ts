import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatAutocompleteHarness } from '@angular/material/autocomplete/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BloqueDisponible, Cancha } from '../../catalogo-canchas/disponibilidad';
import { Socios } from '../../identidad/admin/socios.service';
import { alternar } from '../../testing/alternar';
import { NuevaReserva } from './nueva-reserva';
import { ReservasDelAdmin } from './nueva-reserva.service';

/**
 * La hora que el club toma en el mesón (T390): la cancha y la hora vienen del tablero, como en el
 * sitio, y el diálogo pide para quién es. Lo que se prueba acá es que mande esa hora tal cual, el
 * cupo del socio y con quién juega.
 */
describe('NuevaReserva', () => {
  const CANCHA: Cancha = {
    id: 1,
    nombre: 'Cancha 1',
    superficie: 'ARCILLA',
    techada: false,
    iluminacion: true,
  };

  /** De 12:00 a 13:00 del club (16:00Z en agosto). */
  const BLOQUE: BloqueDisponible = {
    inicio: '2026-08-17T16:00:00.000Z',
    fin: '2026-08-17T17:00:00.000Z',
    canchaId: 1,
    montoClp: 12000,
    esPico: false,
    bloqueado: false,
    motivoBloqueo: null,
    reservado: false,
  };

  const SOCIOS = [
    { id: 3, numeroSocio: '002', estado: 'ACTIVO', usuario: { nombre: 'Matías', apellido: 'Rojas' } },
  ];

  let fixture: ComponentFixture<NuevaReserva> | undefined;
  let crear: ReturnType<typeof vi.fn>;
  let cupoDe: ReturnType<typeof vi.fn>;

  /** Es un MatDialog (T252): su contenido está en el contenedor de overlays. */
  const dialogo = () => document.querySelector('mat-dialog-container') as HTMLElement;
  const texto = () => (dialogo()?.textContent ?? '').replace(/\s+/g, ' ');
  const actualizar = async () => {
    await fixture!.whenStable();
    fixture!.detectChanges();
  };
  const enviar = async () => {
    dialogo().querySelector('form')!.dispatchEvent(new Event('submit'));
    await actualizar();
  };

  /**
   * El titular, como lo elige quien atiende el mesón: escribe parte del nombre y toca la
   * sugerencia (T388). Con cientos de socios, un `mat-select` no se recorre.
   */
  const elegirTitular = async (nombre: RegExp) => {
    const campo = await TestbedHarnessEnvironment.documentRootLoader(fixture!).getHarness(
      MatAutocompleteHarness.with({ selector: '#titular' }),
    );
    await campo.focus();
    await campo.selectOption({ text: nombre });
    await actualizar();
  };

  const montar = async (
    cambios: { bloque?: BloqueDisponible; socios?: unknown; cupo?: unknown } = {},
  ) => {
    // El anterior se cierra: los dos diálogos estarían en el mismo overlay.
    fixture?.destroy();
    await new Promise((listo) => setTimeout(listo));
    crear = vi.fn().mockResolvedValue({ id: 1, folio: 'MESON1' });
    cupoDe = vi.fn(() =>
      cambios.cupo instanceof Error
        ? Promise.reject(cambios.cupo)
        : Promise.resolve(cambios.cupo),
    );
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Socios,
          useValue: {
            listado: () =>
              cambios.socios instanceof Promise
                ? cambios.socios
                : Promise.resolve({ socios: cambios.socios ?? SOCIOS }),
          },
        },
        { provide: ReservasDelAdmin, useValue: { cupoDe, crear } },
      ],
    });

    fixture = TestBed.createComponent(NuevaReserva);
    fixture.componentRef.setInput('cancha', CANCHA);
    fixture.componentRef.setInput('bloque', cambios.bloque ?? BLOQUE);
    await actualizar();
  };

  beforeEach(async () => {
    // Las 10:40 del club: la hora de las 12:00 todavía no empieza.
    vi.setSystemTime('2026-08-17T14:40:00.000Z');
    await montar();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('**dice la cancha y la hora que se eligieron en el tablero, como el diálogo del sitio**', () => {
    expect(texto()).toContain('Cancha 1 · 12:00–13:00');
    // Ya no las elige: no hay selects de cancha ni de hora.
    expect(dialogo().querySelector('mat-select')).toBeNull();
  });

  it('**manda la cancha, el inicio y la duración del bloque elegido**', async () => {
    await montar({ bloque: { ...BLOQUE, fin: '2026-08-17T17:30:00.000Z' } });
    await elegirTitular(/Matías Rojas/);
    await enviar();

    expect(crear).toHaveBeenCalledWith(
      expect.objectContaining({
        canchaId: 1,
        inicio: BLOQUE.inicio,
        duracionMin: 90,
        socioId: 3,
      }),
    );
  });

  it('**creada la reserva, avisa con el folio y el diálogo se cierra** (T252)', async () => {
    const avisos: string[] = [];
    fixture!.componentInstance.creada.subscribe((folio) => avisos.push(folio));
    fixture!.componentInstance.cerrar.subscribe(() => avisos.push('cerrar'));

    await elegirTitular(/Matías Rojas/);
    await enviar();

    expect(avisos).toEqual(['MESON1', 'cerrar']);
    expect(document.querySelector('mat-dialog-container')).toBeNull();
  });

  it('**al socio no le manda la duración que el club no le permite en prime, y le dice por qué** (T213)', async () => {
    await montar({ bloque: { ...BLOQUE, esPico: true, socioPuede: false } });

    expect(texto()).toContain('En horario prime, el socio solo puede reservar 1 hora y media.');

    await elegirTitular(/Matías Rojas/);
    await enviar();
    expect(crear).not.toHaveBeenCalled();
  });

  it('esa misma hora sí se le toma a un visitante, que paga en el mesón', async () => {
    await montar({ bloque: { ...BLOQUE, esPico: true, socioPuede: false } });
    await alternar(fixture!, 'visitante', 'mat-button-toggle-group[aria-label="Para quién es la hora"]');
    await actualizar();

    expect(texto()).not.toContain('En horario prime');

    const nombre = dialogo().querySelector<HTMLInputElement>('input[name="nombre"]')!;
    nombre.value = 'Quien llamó';
    nombre.dispatchEvent(new Event('input'));
    await enviar();

    expect(crear).toHaveBeenCalledWith(expect.objectContaining({ nombre: 'Quien llamó' }));
  });

  it('**el teléfono del visitante llega a la API**, con el 56 del país', async () => {
    // La referencia `#telefono` de la plantilla tapaba la propiedad del mismo nombre: el campo
    // recibía el NgModel en vez del texto, y el teléfono del visitante no viajaba (T390).
    await alternar(fixture!, 'visitante', 'mat-button-toggle-group[aria-label="Para quién es la hora"]');
    await actualizar();
    const escribir = (nombre: string, valor: string) => {
      const campo = dialogo().querySelector<HTMLInputElement>(`input[name="${nombre}"]`)!;
      campo.value = valor;
      campo.dispatchEvent(new Event('input'));
    };
    escribir('nombre', 'Quien llamó');
    escribir('telefono', '9 1234 5678');
    await actualizar();
    await enviar();

    expect(crear).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: 'Quien llamó', telefono: '56912345678' }),
    );
  });

  it('si el cupo del socio no carga, lo dice', async () => {
    await montar({ cupo: new Error('la API no respondió') });
    await elegirTitular(/Matías Rojas/);

    expect(texto()).toContain('No se pudo cargar el cupo');
  });

  it('**la ficha del cupo cuenta reservas, no horas, y es la del día de la hora elegida** (T84)', async () => {
    // Una hora y media es una reserva: "Horas de ese día: 1 de 1" le diría al mesón que
    // el socio se pasó, cuando gastó exactamente su cupo.
    await montar({
      cupo: {
        socioId: 3,
        nombre: 'Matías Rojas',
        numeroSocio: '002',
        estado: 'ACTIVO',
        alDia: true,
        graciaHasta: null,
        reservasDelDia: 1,
        cupoDiarioSocioReservas: 1,
        reservasPicoDeLaSemana: 0,
        cupoPicoSemanalReservas: 2,
        reservasConInvitadosDelMes: 0,
        invitadosPorMes: 4,
      },
    });
    await elegirTitular(/Matías Rojas/);

    expect(cupoDe).toHaveBeenCalledWith(3, '2026-08-17');
    expect(texto()).toContain('Reservas de ese día: 1 de 1');
    expect(texto()).toContain('Reservas prime de la semana: 0 de 2');
    // El cupo cuenta reservas con invitados, no personas (A5, T105).
    expect(texto()).toContain('Reservas con invitados del mes: 0 de 4');
    expect(texto()).not.toMatch(/Horas (de ese día|prime)/);
  });

  it('**el socio en gracia sale «En gracia hasta…», no «Cuota vencida»** (T382)', async () => {
    // El mesón le toma la hora a quien está en gracia: «Cuota vencida» a secas lo haría
    // decirle que no a alguien que sí puede reservar (SPEC-cuotas.md § Días de gracia).
    await montar({
      cupo: {
        socioId: 3,
        nombre: 'Matías Rojas',
        numeroSocio: '002',
        estado: 'ACTIVO',
        alDia: false,
        graciaHasta: '2026-11-05',
        reservasDelDia: 0,
        cupoDiarioSocioReservas: 1,
        reservasPicoDeLaSemana: 0,
        cupoPicoSemanalReservas: 2,
        reservasConInvitadosDelMes: 0,
        invitadosPorMes: 4,
      },
    });
    await elegirTitular(/Matías Rojas/);

    expect(texto()).toContain('En gracia hasta el jueves, 5 de noviembre');
    expect(texto()).not.toContain('Cuota vencida');
    // La insignia lleva dos palabras, como «Al día» y «Cuota vencida», y la fecha va al lado
    // como texto: un chip es para una o dos palabras (lineamientos de Angular Material, chips).
    const insignia = dialogo().querySelector('mat-chip.insignia.aviso');
    expect(
      insignia?.textContent?.replace('schedule', '').replace(/\s+/g, ' ').trim(),
    ).toBe('En gracia');
  });

  it('mientras llegan los socios, el titular lo dice (T153)', async () => {
    // Sin `whenStable`: lo que se carga no llega nunca, y esperarlo no terminaría.
    fixture?.destroy();
    await new Promise((listo) => setTimeout(listo));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Socios, useValue: { listado: () => new Promise<never>(() => undefined) } },
        { provide: ReservasDelAdmin, useValue: { cupoDe: vi.fn(), crear: vi.fn() } },
      ],
    });
    fixture = TestBed.createComponent(NuevaReserva);
    fixture.componentRef.setInput('cancha', CANCHA);
    fixture.componentRef.setInput('bloque', BLOQUE);
    fixture.detectChanges();
    await new Promise((listo) => setTimeout(listo));
    fixture.detectChanges();

    expect(texto()).toContain('Cargando los socios…');
  });

  /**
   * T388 (`SPEC-panel.md` § Reservas del panel, R1 y R2). «Con quién juega» es el campo del
   * sitio: sugiere a los socios del club, y el que se elige sale como socio y no gasta una
   * reserva con invitados del titular.
   */
  describe('con quién juega el socio (T388)', () => {
    const PADRON = [
      { id: 3, numeroSocio: '002', estado: 'ACTIVO', usuario: { nombre: 'Matías', apellido: 'Rojas' } },
      { id: 4, numeroSocio: '008', estado: 'ACTIVO', usuario: { nombre: 'Ana', apellido: 'Fuentes' } },
      { id: 5, numeroSocio: '010', estado: 'SUSPENDIDO', usuario: { nombre: 'Pedro', apellido: 'Suspendido' } },
      { id: 6, numeroSocio: '011', estado: 'RETIRADO', usuario: { nombre: 'Rita', apellido: 'Retirada' } },
    ];

    const cargador = () => TestbedHarnessEnvironment.documentRootLoader(fixture!);
    const acompanantes = () =>
      cargador().getHarness(MatAutocompleteHarness.with({ selector: '#acompanante' }));
    const textos = async (campo: MatAutocompleteHarness) =>
      Promise.all((await campo.getOptions()).map((opcion) => opcion.getText()));

    beforeEach(async () => {
      await montar({ socios: PADRON });
    });

    it('**el titular se elige entre los socios activos**', async () => {
      const titular = await cargador().getHarness(
        MatAutocompleteHarness.with({ selector: '#titular' }),
      );
      await titular.focus();

      expect(await textos(titular)).toEqual(['002 · Matías Rojas', '008 · Ana Fuentes']);
    });

    it('**sugiere a los otros socios activos, sin el titular**', async () => {
      await elegirTitular(/Matías Rojas/);
      const campo = await acompanantes();
      await campo.focus();

      expect(await textos(campo)).toEqual(['Ana Fuentes · N.º 008 · Socio del club']);
    });

    it('**el socio elegido sale como socio; un nombre suelto, como invitado**', async () => {
      await elegirTitular(/Matías Rojas/);
      const campo = await acompanantes();
      await campo.enterText('ana');
      await campo.selectOption({ text: /Ana Fuentes/ });
      await campo.enterText('Juan Pérez');
      [...dialogo().querySelectorAll('button')]
        .find((boton) => boton.textContent?.trim() === 'Agregar')!
        .click();
      await actualizar();
      await enviar();

      expect(crear).toHaveBeenCalledWith(
        expect.objectContaining({
          socioId: 3,
          acompanantes: [{ numeroSocio: '008' }, { nombre: 'Juan Pérez' }],
        }),
      );
    });

    it('lo escrito sin apretar «Agregar» también cuenta al crear', async () => {
      await elegirTitular(/Matías Rojas/);
      await (await acompanantes()).enterText('Juan Pérez');
      await enviar();

      expect(crear).toHaveBeenCalledWith(
        expect.objectContaining({ acompanantes: [{ nombre: 'Juan Pérez' }] }),
      );
    });
  });
});
