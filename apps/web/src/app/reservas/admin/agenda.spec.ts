import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Disponibilidad, GrillaDeCancha } from '../../catalogo-canchas/disponibilidad';
import { ClaseDelDia, Clases } from '../../clases/clases.service';
import { Auth, UsuarioActual } from '../../core/auth/auth';
import { avisoDeLoHecho } from '../../testing/snackbar';
import { Agenda, ReservaDelDia } from './agenda.service';
import { AgendaDelDia } from './agenda';

/**
 * T26. El panel del mesón, y sobre todo **que se actualice solo**.
 *
 * El criterio 2 de `SPEC.md`: la reserva del visitante aparece sin que nadie recargue.
 * Es lo que se muestra en la demo con dos ventanas lado a lado.
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
  let bloqueosDelDia: ReturnType<typeof vi.fn>;
  let clasesDelDia: ReturnType<typeof vi.fn>;
  let avisos: Subject<{ fecha: string }>;

  const montar = async (
    reservas: ReservaDelDia[] | Error,
    clases: ClaseDelDia[] | Error = [],
    usuario: UsuarioActual = ADMIN,
  ) => {
    delDia = vi.fn(() =>
      reservas instanceof Error ? Promise.reject(reservas) : Promise.resolve(reservas),
    );
    clasesDelDia = vi.fn(() =>
      clases instanceof Error ? Promise.reject(clases) : Promise.resolve(clases),
    );
    avisos = new Subject<{ fecha: string }>();
    disponibilidadDelDia = vi.fn(() => Promise.resolve([abierta(1), abierta(2)]));
    bloqueosDelDia = vi.fn(() => Promise.resolve([]));

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Agenda,
          useValue: { delDia, bloqueosDelDia, avisos: avisos.asObservable() },
        },
        { provide: Disponibilidad, useValue: { delDia: disponibilidadDelDia } },
        { provide: Clases, useValue: { delDia: clasesDelDia } },
        { provide: Auth, useValue: { usuario: signal(usuario).asReadonly() } },
      ],
    });

    fixture = TestBed.createComponent(AgendaDelDia);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  /** La ficha se abre en el overlay del diálogo, fuera del componente. */
  const ficha = () => document.querySelector('mat-dialog-container');
  const abrirLaFicha = async (nombre = 'Camila Visitante') => {
    [...(fixture.nativeElement as HTMLElement).querySelectorAll('app-tablero-de-la-agenda button')]
      .find((boton) => boton.textContent?.includes(nombre))!
      .dispatchEvent(new MouseEvent('click'));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await montar([UNA]);
  });

  /** Los FAB de la pantalla: la acción que crea (SPEC-panel.md D15). */
  const fabs = () =>
    TestbedHarnessEnvironment.loader(fixture).getAllHarnesses(
      MatButtonHarness.with({ variant: 'fab' }),
    );

  it('**«Nueva reserva» es el FAB extendido de la pantalla, el único** (T285, D15)', async () => {
    // El título vive en la pantalla madre (panel-de-la-agenda), con las pestañas.
    const [nueva, ...otros] = await fabs();

    expect(otros).toHaveLength(0);
    expect(await nueva.getText()).toContain('Nueva reserva');
    expect(await (await nueva.host()).hasClass('mdc-fab--extended')).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('h1')).toBeNull();
  });

  it('a la gestora le muestra el día, reservas y clases, sin "Nueva reserva" (T221)', async () => {
    await montar([UNA], [CLASE], GESTORA);

    expect(await fabs()).toHaveLength(0);
    expect(texto()).not.toContain('Nueva reserva');
    expect(texto()).toContain('Camila Visitante');
    expect(texto()).toContain('Ana Silva');
  });

  it('**baja el CSV del día que se está mirando, también la gestora** (T273)', async () => {
    const enlace = () =>
      (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
        'app-descargar-csv a',
      );

    expect(enlace()?.getAttribute('href')).toBe(
      `/api/admin/agenda.csv?fecha=${fixture.componentInstance.fechaActual()}`,
    );

    fixture.componentInstance.fechaActual.set('2026-08-20');
    fixture.detectChanges();
    expect(enlace()?.getAttribute('href')).toBe('/api/admin/agenda.csv?fecha=2026-08-20');

    await montar([UNA], [], GESTORA);
    expect(enlace()).not.toBeNull();
  });

  /**
   * T271. La agenda se ve como disponibilidad (D2): los mismos controles del día y el
   * tablero de hora por cancha, con la reserva en su celda y su ficha al tocarla.
   */
  it('**el día es un tablero: una columna por cancha y la reserva en su franja**', () => {
    const tablero = (fixture.nativeElement as HTMLElement).querySelector('app-tablero-de-la-agenda');
    const columnas = [...tablero!.querySelectorAll('thead th')].map((th) => th.textContent?.trim());

    expect(columnas).toEqual(['Hora', 'Cancha 1', 'Cancha 2']);
    expect(tablero!.querySelector('tbody tr')?.textContent).toContain('08:00');
    expect(tablero!.querySelector('tbody tr')?.textContent).toContain('Camila Visitante');
  });

  it('pide la disponibilidad y los cierres del día que se mira', () => {
    const fecha = fixture.componentInstance.fechaActual();

    expect(disponibilidadDelDia).toHaveBeenCalledWith(fecha);
    expect(bloqueosDelDia).toHaveBeenCalledWith(fecha);
  });

  it('**los controles del día son los de disponibilidad**', async () => {
    const selector = fixture.debugElement.query((nodo) => nodo.name === 'app-selector-de-dia');
    expect(selector).not.toBeNull();

    selector.componentInstance.fecha.set('2026-08-20');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(delDia).toHaveBeenLastCalledWith('2026-08-20');
    expect(disponibilidadDelDia).toHaveBeenLastCalledWith('2026-08-20');
  });

  it('**al admin, la franja libre abre «Nueva reserva» con esa cancha y esa hora** (T272)', async () => {
    const tablero = fixture.debugElement.query((nodo) => nodo.name === 'app-tablero-de-la-agenda');
    tablero.componentInstance.tomar.emit({ canchaId: 2, inicio: '2026-08-17T13:00:00.000Z' });
    await fixture.whenStable();
    fixture.detectChanges();

    const formulario = fixture.debugElement.query((nodo) => nodo.name === 'app-nueva-reserva');
    expect(formulario.componentInstance.cancha()).toBe(2);
    expect(formulario.componentInstance.inicio()).toBe('2026-08-17T13:00:00.000Z');
  });

  it('**la hora tomada se confirma con el snackbar, no con un aviso que se queda** (T283)', async () => {
    const tablero = fixture.debugElement.query((nodo) => nodo.name === 'app-tablero-de-la-agenda');
    tablero.componentInstance.tomar.emit({ canchaId: 2, inicio: '2026-08-17T13:00:00.000Z' });
    await fixture.whenStable();
    fixture.detectChanges();

    fixture.debugElement
      .query((nodo) => nodo.name === 'app-nueva-reserva')
      .componentInstance.creada.emit('AB23CDE');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(avisoDeLoHecho()).toBe('Hora tomada. Folio AB23CDE.');
    // El tablero ya la muestra: un aviso fijo arriba solo empujaba la tabla.
    expect(texto()).not.toContain('Hora tomada');
  });

  it('el FAB la abre sin cancha ni hora', async () => {
    await (await fabs())[0].click();
    await fixture.whenStable();
    fixture.detectChanges();

    const formulario = fixture.debugElement.query((nodo) => nodo.name === 'app-nueva-reserva');
    expect(formulario.componentInstance.cancha()).toBeNull();
    expect(formulario.componentInstance.inicio()).toBeNull();
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

  it('en la ficha van sus observaciones, y anotar una recarga el día sin vaciarlo (T226)', async () => {
    await abrirLaFicha();
    expect(ficha()?.querySelector('app-observaciones-de-reserva')).not.toBeNull();

    const laFicha = fixture.debugElement.query((nodo) => nodo.name === 'app-ficha-de-la-reserva');
    laFicha.componentInstance.cambio.emit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(delDia).toHaveBeenCalledTimes(2);
    expect(texto()).toContain('Camila Visitante');
    // La ficha sigue abierta, con la reserva al día.
    expect(ficha()?.textContent).toContain('Camila Visitante');
  });

  it('distingue al socio del visitante, y la ficha dice con quién juega', async () => {
    await montar([
      { ...UNA, esSocio: true, nombre: 'Socia', acompanantes: ['Ana Invitada'] },
    ]);

    expect(texto()).toContain('Socia');
    await abrirLaFicha('Socia');
    expect(ficha()?.textContent).toContain('Ana Invitada');
  });

  it('marca la que todavía está pagando', async () => {
    // Ocupa la cancha pero puede caerse: el club necesita distinguirla de una vendida.
    await montar([{ ...UNA, estado: 'PENDIENTE_PAGO' }]);

    expect(texto()).toContain('Esperando el pago');
  });

  it('cuando el día está vacío lo dice', async () => {
    await montar([]);

    expect(texto()).toContain('No hay nada agendado');
  });

  it('**un aviso del servidor repuebla el panel sin recargar la página**', async () => {
    // El criterio 2 de `SPEC.md`, que es lo que se muestra en la demo.
    delDia.mockResolvedValue([
      UNA,
      { ...UNA, id: 2, folio: 'NUEVA99', nombre: 'Recién llegada', cancha: 'Cancha 2', canchaId: 2 },
    ]);

    avisos.next({ fecha: fixture.componentInstance.fechaActual() });
    await fixture.whenStable();
    fixture.detectChanges();

    // En la franja de al lado no cabe: va a la Cancha 2, que está libre a esa hora.
    expect(texto()).toContain('Recién llegada');
  });

  it('**las clases se ven en la misma agenda que las reservas**', async () => {
    await montar([UNA], [CLASE]);

    // En su franja y en su cancha: la de las 10:00 de la Cancha 2.
    const filas = [...(fixture.nativeElement as HTMLElement).querySelectorAll('app-tablero-de-la-agenda tbody tr')];
    const deLas10 = filas.find((fila) => fila.querySelector('th')?.textContent?.includes('10:00'));
    expect(deLas10?.textContent).toContain('Ana Silva');
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

    const fila = texto().replace(/\s+/g, ' ');
    expect(fila).toContain('Gimnasio');
    expect(fila).toContain('Clase · Preparación física · Individual');
    expect(fila).toContain('Ana Silva · un alumno');
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
