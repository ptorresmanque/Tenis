import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Disponibilidad, GrillaDeCancha } from '../../catalogo-canchas/disponibilidad';
import { Socios } from '../../identidad/admin/socios.service';
import { NuevaReserva } from './nueva-reserva';
import { ReservasDelAdmin } from './nueva-reserva.service';

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

  const horasOfrecidas = () =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLOptionElement>(
        'select[name="hora"] option',
      ),
    )
      .filter((opcion) => opcion.value)
      .map((opcion) => opcion.textContent?.trim());

  beforeEach(async () => {
    // jsdom no implementa el diálogo nativo, y el constructor lo abre en un
    // microtask: sin esto, el error salta después del test y no dentro de él.
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });

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

  it('no ofrece una hora que ya terminó', () => {
    // La ofrecía, y la API la rechazaba con "Esa hora ya terminó." recién al crear.
    expect(horasOfrecidas()).not.toContain('08:00–09:00');
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

    const raiz = () => fixture.nativeElement as HTMLElement;
    const actualizar = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const elegirDuracion = async (valor: '60' | '90') => {
      raiz().querySelector<HTMLInputElement>(`input[type="radio"][value="${valor}"]`)!.click();
      await actualizar();
    };
    const elegirHora = async (inicio: string) => {
      const hora = raiz().querySelector<HTMLSelectElement>('select[name="hora"]')!;
      hora.value = inicio;
      hora.dispatchEvent(new Event('change'));
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

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
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

    const socio = (fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>(
      'select[name="socio"]',
    )!;
    socio.value = '3';
    socio.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
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

    const socio = (fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>(
      'select[name="socio"]',
    )!;
    socio.value = '3';
    socio.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    const texto = ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');
    expect(texto).toContain('Reservas de ese día: 1 de 1');
    expect(texto).toContain('Reservas pico de la semana: 0 de 2');
    // El cupo cuenta reservas con invitados, no personas (A5, T105).
    expect(texto).toContain('Reservas con invitados del mes: 0 de 4');
    expect(texto).not.toMatch(/Horas (de ese día|pico)/);
  });
});
