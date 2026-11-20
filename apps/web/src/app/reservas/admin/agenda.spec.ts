import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Disponibilidad, GrillaDeCancha } from '../../catalogo-canchas/disponibilidad';
import { ClaseDelDia, Clases } from '../../clases/clases.service';
import { Auth, UsuarioActual } from '../../core/auth/auth';
import { Socios } from '../../identidad/admin/socios.service';
import { avisoDeLoHecho } from '../../testing/snackbar';
import { Agenda, ReservaDelDia } from './agenda.service';
import { AgendaDelDia } from './agenda';
import { ReservasDelAdmin } from './nueva-reserva.service';

/**
 * T26 y T390. El panel del mesón: **el mismo tablero del sitio**, con las reservas a la vista, y
 * **que se actualice solo**.
 *
 * El criterio 2 de `SPEC.md`: la reserva del visitante aparece sin que nadie recargue. Desde T390
 * (`SPEC-panel.md` § Reservas del panel, R3), la página usa los controles, el tablero, la barra y
 * el diálogo de `/disponibilidad`, y se reserva desde el tablero.
 */
describe('AgendaDelDia', () => {
  const UNA: ReservaDelDia = {
    id: 1,
    folio: 'AB23CDE',
    cancha: 'Cancha 1',
    canchaId: 1,
    // 12:00Z en agosto son las 08:00 en Santiago.
    inicio: '2026-08-17T12:00:00.000Z',
    fin: '2026-08-17T13:00:00.000Z',
    estado: 'CONFIRMADA',
    nombre: 'Camila Visitante',
    telefono: '+56955556666',
    esSocio: false,
    socioId: null,
    acompanantes: [],
    observaciones: [],
    observacionesAnteriores: 0,
    pago: 'EN_EL_MESON',
  };

  /** Una clase ocupa cancha igual que una reserva, y el mesón la mira ahí mismo. */
  const CLASE: ClaseDelDia = {
    id: 7,
    tipo: 'TENIS',
    lugar: 'Cancha 2',
    canchaId: 2,
    profesor: 'Ana Silva',
    // 14:00Z en agosto son las 10:00 en Santiago: después de la reserva de arriba.
    inicio: '2026-08-17T14:00:00.000Z',
    fin: '2026-08-17T15:00:00.000Z',
    nivel: 'INICIACION',
    estado: 'PROGRAMADA',
    cupoMaximo: 6,
    notas: null,
    serieId: null,
  };

  const ADMIN: UsuarioActual = {
    id: 1,
    nombre: 'Rodrigo',
    apellido: 'Torres',
    email: 'admin@clubdetenis.cl',
    telefono: null,
    esAdmin: true,
    esGestor: false,
    socioId: null,
    socioActivo: false,
    socioAlDia: false,
    profesorId: null,
  };
  const GESTORA: UsuarioActual = { ...ADMIN, esAdmin: false, esGestor: true };

  /** Dos canchas abiertas de 08:00 a 12:00, con bloques de una hora cada media hora. */
  const abierta = (id: number): GrillaDeCancha => ({
    cancha: { id, nombre: `Cancha ${id}`, superficie: 'CEMENTO', techada: false, iluminacion: true },
    bloques: [0, 1, 2, 3, 4, 5, 6].map((media) => {
      const inicio = new Date(Date.UTC(2026, 7, 17, 12) + media * 30 * 60 * 1000);
      return {
        inicio: inicio.toISOString(),
        fin: new Date(inicio.getTime() + 60 * 60 * 1000).toISOString(),
        canchaId: id,
        montoClp: 12_000,
        esPico: false,
        bloqueado: false,
        motivoBloqueo: null,
        reservado: false,
      };
    }),
  });

  let fixture: ComponentFixture<AgendaDelDia>;
  let delDia: ReturnType<typeof vi.fn>;
  let disponibilidadDelDia: ReturnType<typeof vi.fn>;
  let clasesDelDia: ReturnType<typeof vi.fn>;
  let avisos: Subject<{ fecha: string }>;

  const proveer = (
    reservas: ReservaDelDia[] | Error,
    clases: ClaseDelDia[] | Error,
    usuario: UsuarioActual,
  ) => {
    delDia = vi.fn(() =>
      reservas instanceof Error ? Promise.reject(reservas) : Promise.resolve(reservas),
    );
    clasesDelDia = vi.fn(() =>
      clases instanceof Error ? Promise.reject(clases) : Promise.resolve(clases),
    );
    avisos = new Subject<{ fecha: string }>();
    disponibilidadDelDia = vi.fn(() => Promise.resolve([abierta(1), abierta(2)]));

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'agenda', component: AgendaDelDia }]),
        {
          provide: Agenda,
          useValue: {
            delDia,
            avisos: avisos.asObservable(),
            pagosDe: () => Promise.resolve({ pagos: [], devolucionAlCancelar: false }),
          },
        },
        { provide: Disponibilidad, useValue: { delDia: disponibilidadDelDia } },
        { provide: Clases, useValue: { delDia: clasesDelDia } },
        { provide: Auth, useValue: { usuario: signal(usuario).asReadonly() } },
        { provide: Socios, useValue: { listado: () => Promise.resolve({ socios: [] }) } },
        { provide: ReservasDelAdmin, useValue: { cupoDe: vi.fn(), crear: vi.fn() } },
      ],
    });
  };

  const actualizar = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const montar = async (
    reservas: ReservaDelDia[] | Error,
    clases: ClaseDelDia[] | Error = [],
    usuario: UsuarioActual = ADMIN,
  ) => {
    proveer(reservas, clases, usuario);
    fixture = TestBed.createComponent(AgendaDelDia);
    await actualizar();
  };

  const raiz = () => fixture.nativeElement as HTMLElement;
  const texto = () => (raiz().textContent ?? '').replace(/\s+/g, ' ');
  const componente = (nombre: string) => fixture.debugElement.query((nodo) => nodo.name === nombre);

  /** La ficha se abre en el overlay del diálogo, fuera del componente. */
  const ficha = () => document.querySelector('mat-dialog-container');
  const abrirLaFicha = async (nombre = 'Camila Visitante') => {
    [...raiz().querySelectorAll<HTMLButtonElement>('app-marcador button[data-reserva]')]
      .find((boton) => boton.textContent?.includes(nombre))!
      .click();
    await actualizar();
  };

  /** Las libres que el tablero deja tomar: los botones que no son una reserva. */
  const libres = () => [
    ...raiz().querySelectorAll<HTMLButtonElement>('app-marcador tbody button:not([data-reserva])'),
  ];

  const reservarLaPrimeraLibre = async () => {
    libres()[0].click();
    await actualizar();
    [...raiz().querySelectorAll<HTMLButtonElement>('app-barra-fija button')]
      .find((boton) => boton.textContent?.includes('Reservar'))!
      .click();
    await actualizar();
  };

  beforeEach(async () => {
    // Las 07:00 del club el lunes 17 de agosto: el día de los datos, con todo por delante.
    vi.setSystemTime('2026-08-17T11:00:00.000Z');
    await montar([UNA]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('**se reserva desde el tablero, como en el sitio: sin el FAB de antes** (T390)', async () => {
    const fabs = await TestbedHarnessEnvironment.loader(fixture).getAllHarnesses(
      MatButtonHarness.with({ variant: 'fab' }),
    );

    expect(fabs).toHaveLength(0);
    // El título vive en la pantalla madre (panel-de-la-agenda), con las pestañas.
    expect(raiz().querySelector('h1')).toBeNull();
  });

  it('**el día es el tablero del sitio, con la reserva en sus filas y lo que dice de ella**', () => {
    expect(raiz().querySelector('app-tablero-de-la-agenda')).toBeNull();
    const tablero = raiz().querySelector('app-marcador')!;
    const columnas = [...tablero.querySelectorAll('thead th')].map((th) =>
      th.textContent?.replace(/\s+/g, ' ').trim(),
    );

    expect(columnas).toEqual(['Hora', 'Cancha 1', 'Cancha 2']);
    const primera = tablero.querySelector('tbody tr')!.textContent ?? '';
    expect(primera).toContain('08:00');
    expect(primera).toContain('Camila Visitante');
    expect(primera).toContain('Paga en el mesón');
  });

  it('**los controles del día son los de disponibilidad: el día, la duración y las canchas**', async () => {
    expect(componente('app-controles-del-dia')).not.toBeNull();
    expect(disponibilidadDelDia).toHaveBeenCalledWith('2026-08-17', 60);

    componente('app-selector-de-dia').componentInstance.fecha.set('2026-08-20');
    await actualizar();
    expect(delDia).toHaveBeenLastCalledWith('2026-08-20');
    expect(disponibilidadDelDia).toHaveBeenLastCalledWith('2026-08-20', 60);
    // El día queda en la dirección: el enlace desde Finanzas y recargar lo conservan.
    expect(TestBed.inject(Router).url).toContain('fecha=2026-08-20');

    componente('app-controles-del-dia').componentInstance.cambiarDuracion.emit('90');
    await actualizar();
    expect(disponibilidadDelDia).toHaveBeenLastCalledWith('2026-08-20', 90);
  });

  it('**al admin, la libre se elige y la barra la muestra; «Reservar» abre el diálogo con esa hora**', async () => {
    // La Cancha 1 a las 08:00 es de Camila: la primera libre es la Cancha 2.
    libres()[0].click();
    await actualizar();
    expect(raiz().querySelector('app-barra-fija')?.textContent).toContain('Cancha 2 · 08:00–09:00');

    await reservarLaPrimeraLibre();

    const dialogo = componente('app-nueva-reserva').componentInstance;
    expect(dialogo.cancha().id).toBe(2);
    expect(dialogo.bloque().inicio).toBe('2026-08-17T12:00:00.000Z');
  });

  it('la barra va dentro del panel, pegada abajo, y no tapa el menú lateral', async () => {
    libres()[0].click();
    await actualizar();

    const caja = raiz().querySelector('app-barra-fija > div')!;
    expect(caja.classList.contains('sticky')).toBe(true);
    expect(caja.classList.contains('fixed')).toBe(false);
  });

  it('**la hora tomada se confirma con el snackbar y la barra se va** (T283)', async () => {
    await reservarLaPrimeraLibre();

    componente('app-nueva-reserva').componentInstance.creada.emit('AB23CDE');
    await actualizar();

    expect(avisoDeLoHecho()).toBe('Hora tomada. Folio AB23CDE.');
    expect(raiz().querySelector('app-barra-fija')).toBeNull();
  });

  it('a la gestora le muestra el día, reservas y clases, y lo libre no le ofrece nada (T221)', async () => {
    await montar([UNA], [CLASE], GESTORA);

    expect(texto()).toContain('Camila Visitante');
    expect(texto()).toContain('Ana Silva');
    expect(libres()).toHaveLength(0);
  });

  it('**baja el CSV del día que se está mirando, también la gestora** (T273)', async () => {
    const enlace = () => raiz().querySelector<HTMLAnchorElement>('app-descargar-csv a');

    expect(enlace()?.getAttribute('href')).toBe('/api/admin/agenda.csv?fecha=2026-08-17');

    fixture.componentInstance.fechaActual.set('2026-08-20');
    fixture.detectChanges();
    expect(enlace()?.getAttribute('href')).toBe('/api/admin/agenda.csv?fecha=2026-08-20');

    await montar([UNA], [], GESTORA);
    expect(enlace()).not.toBeNull();
  });

  it('**tocar la reserva abre su ficha: la hora, la cancha y su teléfono**', async () => {
    await abrirLaFicha();

    const enLaFicha = ficha()?.textContent ?? '';
    expect(enLaFicha).toContain('08:00–09:00');
    expect(enLaFicha).toContain('Cancha 1');
    expect(enLaFicha).toContain('Camila Visitante');
    // El teléfono es para lo que existe el panel: si llueve, el club llama.
    expect(ficha()?.querySelector('a[href^="tel:"]')).not.toBeNull();
  });

  it('**`?fecha` y `?reserva` en la dirección abren ese día con esa ficha** (R10)', async () => {
    proveer([UNA], [], ADMIN);
    const harness = await RouterTestingHarness.create('/agenda?fecha=2026-08-20&reserva=1');
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(delDia).toHaveBeenCalledWith('2026-08-20');
    expect(ficha()?.textContent).toContain('Camila Visitante');
  });

  it('en la ficha van sus observaciones, y anotar una recarga el día sin vaciarlo (T226)', async () => {
    await abrirLaFicha();
    expect(ficha()?.querySelector('app-observaciones-de-reserva')).not.toBeNull();

    componente('app-ficha-de-la-reserva').componentInstance.cambio.emit();
    await actualizar();

    expect(delDia).toHaveBeenCalledTimes(2);
    expect(texto()).toContain('Camila Visitante');
    // La ficha sigue abierta, con la reserva al día.
    expect(ficha()?.textContent).toContain('Camila Visitante');
  });

  it('**cancelada desde la ficha, la cierra y vuelve a pedir el día al tiro** (R6)', async () => {
    await abrirLaFicha();
    delDia.mockClear();
    disponibilidadDelDia.mockClear();

    componente('app-ficha-de-la-reserva').componentInstance.cancelada.emit({
      folio: 'AB23CDE',
      huboDevolucion: true,
      motivo: null,
    });
    await actualizar();

    // El snackbar lo pone la ficha: puede irse antes de que llegue la respuesta.
    expect(componente('app-ficha-de-la-reserva')).toBeNull();
    expect(delDia).toHaveBeenCalled();
    expect(disponibilidadDelDia).toHaveBeenCalled();
  });

  it('a la ficha le dice si quien mira es el admin: el gestor no ve el pago ni cancela', async () => {
    await abrirLaFicha();
    expect(componente('app-ficha-de-la-reserva').componentInstance.esAdmin()).toBe(true);

    await montar([UNA], [], GESTORA);
    await abrirLaFicha();
    expect(componente('app-ficha-de-la-reserva').componentInstance.esAdmin()).toBe(false);
  });

  it('distingue al socio del visitante, y la ficha dice con quién juega', async () => {
    await montar([
      { ...UNA, esSocio: true, nombre: 'Socia', pago: 'SIN_COBRO', acompanantes: ['Ana Invitada'] },
    ]);

    expect(texto()).toContain('Socia');
    expect(texto()).toContain('Sin cobro');
    await abrirLaFicha('Socia');
    expect(ficha()?.textContent).toContain('Ana Invitada');
  });

  it('marca la que todavía está pagando', async () => {
    // Ocupa la cancha pero puede caerse: el club necesita distinguirla de una vendida.
    await montar([{ ...UNA, estado: 'PENDIENTE_PAGO', pago: 'ESPERANDO' }]);

    expect(texto()).toContain('Esperando el pago');
  });

  it('cuando el día está vacío lo dice', async () => {
    await montar([]);

    expect(texto()).toContain('No hay nada agendado');
  });

  it('**un aviso del servidor repuebla el panel sin recargar la página**, el tablero incluido', async () => {
    // El criterio 2 de `SPEC.md`, que es lo que se muestra en la demo.
    delDia.mockResolvedValue([
      UNA,
      { ...UNA, id: 2, folio: 'NUEVA99', nombre: 'Recién llegada', cancha: 'Cancha 2', canchaId: 2 },
    ]);
    disponibilidadDelDia.mockClear();

    avisos.next({ fecha: '2026-08-17' });
    await actualizar();

    expect(texto()).toContain('Recién llegada');
    // La hora tomada deja de estar libre en el tablero: también se vuelve a pedir.
    expect(disponibilidadDelDia).toHaveBeenCalledWith('2026-08-17', 60);
  });

  it('**las clases del día van en una lista bajo el tablero, con su hora, su lugar y su profesor**', async () => {
    await montar([UNA], [CLASE]);

    const lista =
      raiz().querySelector('[data-clases-del-dia]')?.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(lista).toContain('10:00–11:00');
    expect(lista).toContain('Cancha 2');
    expect(lista).toContain('Ana Silva');
  });

  it('la clase se distingue de una reserva sin depender del color', async () => {
    // El criterio 7 del spec de clases: quien no ve el color tiene que poder saber
    // cuál de las dos cosas ocupa esa cancha.
    await montar([UNA], [CLASE]);

    expect(texto()).toContain('Clase');
    expect(texto()).toContain('Iniciación');
  });

  it('**la del gimnasio dice "Gimnasio", "Preparación física" y si es individual** (T234)', async () => {
    await montar([], [
      { ...CLASE, tipo: 'PREPARACION_FISICA', lugar: 'Gimnasio', canchaId: null, nivel: null, cupoMaximo: 1 },
    ]);

    expect(texto()).toContain('Gimnasio');
    expect(texto()).toContain('Clase · Preparación física · Individual');
    expect(texto()).toContain('Ana Silva · un alumno');
  });

  it('**un día con clases y sin reservas no se anuncia como vacío**', async () => {
    // Se veía "No hay reservas para este día" justo encima de la clase agendada.
    await montar([], [CLASE]);

    expect(texto()).toContain('Ana Silva');
    expect(texto()).not.toContain('No hay nada agendado');
  });

  it('el resumen que se lee en voz alta cuenta las dos cosas', async () => {
    await montar([UNA], [CLASE]);

    expect(texto()).toContain('1 reserva y 1 clase este día.');
  });

  it('un aviso de otro día no interrumpe lo que se está mirando', async () => {
    // Quien mira el sábado no quiere que la pantalla se repueble porque entró una
    // reserva para el martes.
    delDia.mockClear();

    avisos.next({ fecha: '2030-01-01' });
    await fixture.whenStable();

    expect(delDia).not.toHaveBeenCalled();
  });

  // `value()` de un resource lanza en estado de error aunque tenga `defaultValue`.
  it('si la API no responde, lo dice en vez de reventar', async () => {
    await montar(new Error('la API no respondió'), new Error('la API no respondió'));

    expect(texto()).toContain('No se pudo cargar la agenda');
  });

  it('si solo las clases no cargan, no anuncia el día como vacío', async () => {
    // Diría "No hay nada agendado" con una clase ocupando la cancha.
    await montar([], new Error('la API no respondió'));

    expect(texto()).toContain('No se pudo cargar la agenda');
    expect(texto()).not.toContain('No hay nada agendado');
  });
});
