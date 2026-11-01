import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Disponibilidad, GrillaDeCancha } from '../../catalogo-canchas/disponibilidad';
import { Socios } from '../../identidad/admin/socios.service';
import { NuevaReserva } from './nueva-reserva';
import { ReservasDelAdmin } from './nueva-reserva.service';
import { elegidoEn, elegir, opcionesDe } from '../../testing/elegir';
import { alternar } from '../../testing/alternar';

/**
 * La hora que el club toma en el mesón. Lo que se prueba acá es qué horas ofrece:
 * la API le deja tomar la que está corriendo —alguien llega a jugar ahora—, pero
 * no una que ya terminó (`BLOQUE_EN_EL_PASADO`).
 */
describe('NuevaReserva', () => {
  const DIA: GrillaDeCancha[] = [
    {
      cancha: {
        id: 1,
        nombre: 'Cancha 1',
        superficie: 'ARCILLA',
        techada: false,
        iluminacion: true,
      },
      bloques: [
        {
          inicio: '2026-08-17T12:00:00.000Z',
          fin: '2026-08-17T13:00:00.000Z',
          canchaId: 1,
          montoClp: 12000,
          esPico: false,
          bloqueado: false,
          motivoBloqueo: null,
          reservado: false,
        },
        {
          inicio: '2026-08-17T14:00:00.000Z',
          fin: '2026-08-17T15:00:00.000Z',
          canchaId: 1,
          montoClp: 12000,
          esPico: false,
          bloqueado: false,
          motivoBloqueo: null,
          reservado: false,
        },
        {
          inicio: '2026-08-17T16:00:00.000Z',
          fin: '2026-08-17T17:00:00.000Z',
          canchaId: 1,
          montoClp: 12000,
          esPico: false,
          bloqueado: false,
          motivoBloqueo: null,
          reservado: false,
        },
      ],
    },
  ];

  let fixture: ComponentFixture<NuevaReserva>;

  /** Es un MatDialog (T252): su contenido está en el contenedor de overlays. */
  const dialogo = () => document.querySelector('mat-dialog-container') as HTMLElement;

  const horasOfrecidas = () =>
    opcionesDe(fixture, 'mat-select[name="hora"]')
      .filter((opcion) => opcion.valor)
      .map((opcion) => opcion.texto);

  beforeEach(async () => {
    // Las 10:40 del club: la de las 08:00 ya terminó, la de las 10:00 está
    // corriendo y la de las 12:00 no empieza.
    vi.setSystemTime('2026-08-17T14:40:00.000Z');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Disponibilidad, useValue: { delDia: () => Promise.resolve(DIA) } },
        { provide: Socios, useValue: { listado: () => Promise.resolve({ socios: [] }) } },
        { provide: ReservasDelAdmin, useValue: { cupoDe: vi.fn(), crear: vi.fn() } },
      ],
    });

    fixture = TestBed.createComponent(NuevaReserva);
    fixture.componentRef.setInput('fecha', '2026-08-17');
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('**con la cancha y la hora de la franja que se tocó, parte con ellas** (T272)', async () => {
    // El de beforeEach se cierra: los dos diálogos están en el mismo overlay, y se leería el suyo.
    fixture.destroy();
    await new Promise((listo) => setTimeout(listo));
    fixture = TestBed.createComponent(NuevaReserva);
    fixture.componentRef.setInput('fecha', '2026-08-17');
    fixture.componentRef.setInput('cancha', 1);
    fixture.componentRef.setInput('inicio', DIA[0].bloques[2].inicio);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(elegidoEn(fixture, 'mat-select[name="cancha"]')).toBe('1');
    expect(elegidoEn(fixture, 'mat-select[name="hora"]')).toBe(DIA[0].bloques[2].inicio);
  });

  it('una hora que no está entre las libres no se manda: se pide elegir otra', async () => {
    // La última media hora del día no abre una hora entera, y la API la rechazaría.
    fixture.destroy();
    await new Promise((listo) => setTimeout(listo));
    fixture = TestBed.createComponent(NuevaReserva);
    fixture.componentRef.setInput('fecha', '2026-08-17');
    fixture.componentRef.setInput('cancha', 1);
    fixture.componentRef.setInput('inicio', '2026-08-17T23:30:00.000Z');
    await fixture.whenStable();
    fixture.detectChanges();

    [...dialogo().querySelectorAll('button')]
      .find((boton) => boton.textContent?.includes('Crear reserva'))!
      .click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(TestBed.inject(ReservasDelAdmin).crear).not.toHaveBeenCalled();
    expect(dialogo().textContent).toContain('Elige la hora de la reserva.');
  });

  it('sin ellas, la hora se elige: no parte con ninguna', () => {
    expect(elegidoEn(fixture, 'mat-select[name="hora"]')).toBe('');
  });

  it('no ofrece una hora que ya terminó', () => {
    // La ofrecía, y la API la rechazaba con "Esa hora ya terminó." recién al crear.
    expect(horasOfrecidas()).not.toContain('08:00–09:00');
  });

  it('**una hora sin cupo de luz se ve deshabilitada y dice por qué** (T207)', async () => {
    // La API la marca tomada para la grilla pública, que no explica nada; el mesón tiene
    // que entender por qué una cancha vacía no se puede vender.
    const conTope: GrillaDeCancha[] = [
      {
        ...DIA[0],
        bloques: DIA[0].bloques.map((bloque, i) =>
          i === 2 ? { ...bloque, reservado: true, topeDeLuz: true, montoClp: 0 } : bloque,
        ),
      },
    ];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Disponibilidad, useValue: { delDia: () => Promise.resolve(conTope) } },
        { provide: Socios, useValue: { listado: () => Promise.resolve({ socios: [] }) } },
        { provide: ReservasDelAdmin, useValue: { cupoDe: vi.fn(), crear: vi.fn() } },
      ],
    });
    fixture = TestBed.createComponent(NuevaReserva);
    fixture.componentRef.setInput('fecha', '2026-08-17');
    await fixture.whenStable();
    fixture.detectChanges();

    const opcion = opcionesDe(fixture, 'mat-select[name="hora"]').find((una) =>
      una.texto.includes('12:00–13:00'),
    );

    expect(opcion?.deshabilitada).toBe(true);
    expect(opcion?.texto).toContain('Tope de luz');
  });

  it('al socio no le ofrece la duración que el club no le permite en prime (T213)', async () => {
    const conPrime: GrillaDeCancha[] = [
      {
        ...DIA[0],
        bloques: DIA[0].bloques.map((bloque, i) =>
          i === 2 ? { ...bloque, socioPuede: false } : bloque,
        ),
      },
    ];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Disponibilidad, useValue: { delDia: () => Promise.resolve(conPrime) } },
        { provide: Socios, useValue: { listado: () => Promise.resolve({ socios: [] }) } },
        { provide: ReservasDelAdmin, useValue: { cupoDe: vi.fn(), crear: vi.fn() } },
      ],
    });
    fixture = TestBed.createComponent(NuevaReserva);
    fixture.componentRef.setInput('fecha', '2026-08-17');
    await fixture.whenStable();
    fixture.detectChanges();

    // El mesón parte reservando para un socio.
    expect(horasOfrecidas()).toEqual(['10:00–11:00']);
  });

  it('sí ofrece la hora que está corriendo', () => {
    // A diferencia de la grilla pública: en el mesón está la persona que llega a
    // jugar ahora, y esa hora todavía se puede vender.
    expect(horasOfrecidas()).toEqual(['10:00–11:00', '12:00–13:00']);
  });

  describe('la duración (T85)', () => {
    /** El mismo día, pedido de 1 hora y media: cada bloque termina 30 minutos después. */
    const DIA_90: GrillaDeCancha[] = DIA.map((grilla) => ({
      ...grilla,
      bloques: grilla.bloques.map((bloque) => ({
        ...bloque,
        fin: new Date(new Date(bloque.fin).getTime() + 30 * 60 * 1000).toISOString(),
        // Sin precio de 1 hora y media: el mesón la ofrece igual, porque cobra en el
        // mostrador y el socio no paga.
        montoClp: null,
      })),
    }));

    let pedirDia: ReturnType<typeof vi.fn>;
    let crear: ReturnType<typeof vi.fn>;

    const raiz = dialogo;
    const actualizar = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const elegirDuracion = async (valor: '60' | '90') => {
      await alternar(fixture, valor, 'mat-button-toggle-group[aria-label="Duración"]');
      await actualizar();
    };
    const elegirHora = async (inicio: string) => {
      await elegir(fixture, 'mat-select[name="hora"]', inicio);
      await actualizar();
    };
    const enviar = async () => {
      raiz().querySelector('form')!.dispatchEvent(new Event('submit'));
      await actualizar();
    };

    beforeEach(async () => {
      pedirDia = vi.fn((_fecha: string, duracion?: number) =>
        Promise.resolve(duracion === 90 ? DIA_90 : DIA),
      );
      crear = vi.fn().mockResolvedValue({ id: 1, folio: 'MESON1' });

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: Disponibilidad, useValue: { delDia: pedirDia } },
          { provide: Socios, useValue: { listado: () => Promise.resolve({ socios: [] }) } },
          { provide: ReservasDelAdmin, useValue: { cupoDe: vi.fn(), crear } },
        ],
      });

      fixture = TestBed.createComponent(NuevaReserva);
      fixture.componentRef.setInput('fecha', '2026-08-17');
      await actualizar();
    });

    it('por omisión es 1 hora, y así la pide', () => {
      expect(pedirDia).toHaveBeenLastCalledWith('2026-08-17', 60);
      expect(horasOfrecidas()).toEqual(['10:00–11:00', '12:00–13:00']);
    });

    it('**con 1 hora y media ofrece esas horas, aunque la franja no tenga su precio**', async () => {
      await elegirDuracion('90');

      expect(pedirDia).toHaveBeenLastCalledWith('2026-08-17', 90);
      expect(horasOfrecidas()).toEqual(['10:00–11:30', '12:00–13:30']);
    });

    it('manda la duración elegida', async () => {
      await elegirDuracion('90');
      await elegirHora(DIA[0].bloques[2].inicio);
      await enviar();

      expect(crear).toHaveBeenCalledWith(expect.objectContaining({ duracionMin: 90 }));
    });

    it('**creada la reserva, avisa con el folio y el diálogo se cierra** (T252)', async () => {
      const avisos: string[] = [];
      fixture.componentInstance.creada.subscribe((folio) => avisos.push(folio));
      fixture.componentInstance.cerrar.subscribe(() => avisos.push('cerrar'));

      await elegirHora(DIA[0].bloques[2].inicio);
      await enviar();

      expect(avisos).toEqual(['MESON1', 'cerrar']);
      expect(document.querySelector('mat-dialog-container')).toBeNull();
    });

    it('cambiar la duración suelta la hora elegida: era de la otra lista', async () => {
      await elegirHora(DIA[0].bloques[2].inicio);
      await elegirDuracion('90');
      await enviar();

      expect(crear).not.toHaveBeenCalled();
      expect(raiz().textContent).toContain('Elige la hora de la reserva.');
    });
  });

  // `value()` de un resource lanza en estado de error aunque tenga `defaultValue`.
  it('si la disponibilidad no carga, lo dice', async () => {
    const caida = () => Promise.reject(new Error('la API no respondió'));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Disponibilidad, useValue: { delDia: caida } },
        { provide: Socios, useValue: { listado: caida } },
        { provide: ReservasDelAdmin, useValue: { cupoDe: vi.fn(), crear: vi.fn() } },
      ],
    });

    fixture = TestBed.createComponent(NuevaReserva);
    fixture.componentRef.setInput('fecha', '2026-08-17');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(dialogo().textContent).toContain(
      'No se pudo cargar la disponibilidad',
    );
  });

  it('si el cupo del socio no carga, lo dice', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Disponibilidad, useValue: { delDia: () => Promise.resolve(DIA) } },
        {
          provide: Socios,
          useValue: {
            listado: () =>
              Promise.resolve({
                socios: [{ id: 3, numeroSocio: '002', usuario: { nombre: 'Matías', apellido: 'Rojas' } }],
              }),
          },
        },
        {
          provide: ReservasDelAdmin,
          useValue: { cupoDe: () => Promise.reject(new Error('la API no respondió')), crear: vi.fn() },
        },
      ],
    });

    fixture = TestBed.createComponent(NuevaReserva);
    fixture.componentRef.setInput('fecha', '2026-08-17');
    await fixture.whenStable();
    fixture.detectChanges();

    await elegir(fixture, 'mat-select[name="socio"]', 3);

    expect(dialogo().textContent).toContain(
      'No se pudo cargar el cupo',
    );
  });

  it('**la ficha del cupo cuenta reservas, no horas** (T84)', async () => {
    // Una hora y media es una reserva: "Horas de ese día: 1 de 1" le diría al mesón que
    // el socio se pasó, cuando gastó exactamente su cupo.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Disponibilidad, useValue: { delDia: () => Promise.resolve(DIA) } },
        {
          provide: Socios,
          useValue: {
            listado: () =>
              Promise.resolve({
                socios: [{ id: 3, numeroSocio: '002', usuario: { nombre: 'Matías', apellido: 'Rojas' } }],
              }),
          },
        },
        {
          provide: ReservasDelAdmin,
          useValue: {
            cupoDe: () =>
              Promise.resolve({
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
              }),
            crear: vi.fn(),
          },
        },
      ],
    });

    fixture = TestBed.createComponent(NuevaReserva);
    fixture.componentRef.setInput('fecha', '2026-08-17');
    await fixture.whenStable();
    fixture.detectChanges();

    await elegir(fixture, 'mat-select[name="socio"]', 3);

    const texto = (dialogo().textContent ?? '').replace(/\s+/g, ' ');
    expect(texto).toContain('Reservas de ese día: 1 de 1');
    expect(texto).toContain('Reservas prime de la semana: 0 de 2');
    // El cupo cuenta reservas con invitados, no personas (A5, T105).
    expect(texto).toContain('Reservas con invitados del mes: 0 de 4');
    expect(texto).not.toMatch(/Horas (de ese día|prime)/);
  });

  it('**el socio en gracia sale «En gracia hasta…», no «Cuota vencida»** (T382)', async () => {
    // El mesón le toma la hora a quien está en gracia: «Cuota vencida» a secas lo haría
    // decirle que no a alguien que sí puede reservar (SPEC-cuotas.md § Días de gracia).
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Disponibilidad, useValue: { delDia: () => Promise.resolve(DIA) } },
        {
          provide: Socios,
          useValue: {
            listado: () =>
              Promise.resolve({
                socios: [{ id: 3, numeroSocio: '002', usuario: { nombre: 'Matías', apellido: 'Rojas' } }],
              }),
          },
        },
        {
          provide: ReservasDelAdmin,
          useValue: {
            cupoDe: () =>
              Promise.resolve({
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
              }),
            crear: vi.fn(),
          },
        },
      ],
    });

    fixture = TestBed.createComponent(NuevaReserva);
    fixture.componentRef.setInput('fecha', '2026-11-02');
    await fixture.whenStable();
    fixture.detectChanges();

    await elegir(fixture, 'mat-select[name="socio"]', 3);

    const texto = (dialogo().textContent ?? '').replace(/\s+/g, ' ');
    expect(texto).toContain('En gracia hasta el jueves, 5 de noviembre');
    expect(texto).not.toContain('Cuota vencida');
  });

  it('mientras llegan las horas y los socios, los selectores lo dicen (T153)', async () => {
    const nunca = () => new Promise<never>(() => undefined);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Disponibilidad, useValue: { delDia: nunca } },
        { provide: Socios, useValue: { listado: nunca } },
        { provide: ReservasDelAdmin, useValue: { cupoDe: vi.fn(), crear: vi.fn() } },
      ],
    });

    const pendiente = TestBed.createComponent(NuevaReserva);
    pendiente.componentRef.setInput('fecha', '2026-08-17');
    pendiente.detectChanges();
    // El mat-select muestra la opción elegida un momento después (T248). Sin `whenStable`: lo
    // que se carga no llega nunca, y esperarlo no terminaría.
    await new Promise((listo) => setTimeout(listo));
    pendiente.detectChanges();

    expect(dialogo().textContent).toContain(
      'Cargando las horas libres…',
    );
  });
});
