import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReportesDelSocio } from '../../reservas/reportes.service';
import { ReservasPublicas } from '../../reservas/reserva-publica.service';
import { Reservas } from '../../reservas/reservas.service';
import { Auth } from '../../core/auth/auth';
import { Disponibilidad, GrillaDeCancha } from '../disponibilidad';
import { Grilla } from './grilla';
import { alternar, opcionesDelGrupo } from '../../testing/alternar';

/** El grupo de la duración, entre los varios grupos de opciones de la pantalla. */
const DURACION = 'mat-button-toggle-group[aria-label="Duración"]';

/**
 * La pantalla principal de la demo. Lo que se prueba acá es lo que el master
 * marca como no negociable: el precio visible en el bloque antes de hacer clic, y
 * el estado distinguible por texto y no solo por color.
 */
describe('Grilla', () => {
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
          bloqueado: true,
          motivoBloqueo: 'MANTENCION',
        reservado: false,
        },
        {
          inicio: '2026-08-17T22:00:00.000Z',
          fin: '2026-08-17T23:00:00.000Z',
          canchaId: 1,
          montoClp: 20000,
          esPico: true,
          bloqueado: false,
          motivoBloqueo: null,
        reservado: false,
        },
      ],
    },
  ];

  let fixture: ComponentFixture<Grilla>;
  let mover: ReturnType<typeof vi.fn>;
  let pedirDiaParaMover: ReturnType<typeof vi.fn>;
  let delEnlace: {
    porToken: ReturnType<typeof vi.fn>;
    grillaParaMover: ReturnType<typeof vi.fn>;
    mover: ReturnType<typeof vi.fn>;
    pagarDiferencia: ReturnType<typeof vi.fn>;
  };
  let navegar: ReturnType<typeof vi.fn>;
  let reportables: ReturnType<typeof vi.fn>;
  let reportar: ReturnType<typeof vi.fn>;
  let pedirDia: ReturnType<typeof vi.fn>;

  /** `mover` es el id que llega por query string cuando se viene de "mis reservas". */
  const montar = async (
    dia: GrillaDeCancha[] | Error,
    parametros: Record<string, string> = {},
    opciones: {
      socioId?: number | null;
      reportables?:
        | {
            reservaId: number;
            canchaId: number;
            inicio: string;
            yaReportada: boolean;
          }[]
        | Error;
      /** Lo pagado que trae el enlace; por omisión, $16.000. Un `Error` la hace fallar. */
      reservaDelEnlace?: { pagadoClp: number; cancha?: string } | Error;
    } = {},
  ) => {
    mover = vi.fn().mockResolvedValue({});
    navegar = vi.fn().mockResolvedValue(true);
    reportables = vi.fn(() =>
      opciones.reportables instanceof Error
        ? Promise.reject(opciones.reportables)
        : Promise.resolve(opciones.reportables ?? []),
    );
    // El mensaje textual del servidor: la pantalla no inventa uno propio, así que
    // un doble con otro texto probaría algo que no existe.
    reportar = vi.fn().mockResolvedValue({
      mensaje:
        'Gracias. Tu reporte es anónimo y lo revisa la administración del club.',
    });

    pedirDia = vi.fn(() => (dia instanceof Error ? Promise.reject(dia) : Promise.resolve(dia)));
    // Al mover, el día viene de la grilla que no cuenta la reserva que se mueve (T87).
    // El no-socio que cambia desde el enlace de su reserva (T88): pagó $16.000.
    delEnlace = {
      // El rechazo se crea al llamar y no antes, como en `reportables`: uno creado de
      // antemano queda sin manejar hasta que alguien lo pide, y Vitest lo cuenta como error.
      porToken: vi.fn(() =>
        opciones.reservaDelEnlace instanceof Error
          ? Promise.reject(opciones.reservaDelEnlace)
          : Promise.resolve(opciones.reservaDelEnlace ?? { pagadoClp: 16000 }),
      ),
      grillaParaMover: vi.fn(() =>
        dia instanceof Error ? Promise.reject(dia) : Promise.resolve(dia),
      ),
      mover: vi.fn().mockResolvedValue({}),
      pagarDiferencia: vi.fn().mockRejectedValue({
        status: 409,
        error: { motivo: 'BLOQUE_TOMADO', message: 'Esa hora ya está tomada. Elige otra.' },
      }),
    };
    pedirDiaParaMover = vi.fn(() =>
      dia instanceof Error ? Promise.reject(dia) : Promise.resolve(dia),
    );

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Disponibilidad, useValue: { delDia: pedirDia } },
        { provide: Reservas, useValue: { mover, grillaParaMover: pedirDiaParaMover } },
        { provide: ReservasPublicas, useValue: delEnlace },
        { provide: ReportesDelSocio, useValue: { reportables, reportar } },
        {
          provide: Auth,
          useValue: {
            usuario: signal(
              opciones.socioId === undefined
                ? null
                : { id: 1, socioId: opciones.socioId },
            ).asReadonly(),
          },
        },
        { provide: Router, useValue: { navigate: navegar } },
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: of(convertToParamMap(parametros)) },
        },
      ],
    });

    fixture = TestBed.createComponent(Grilla);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const el = () => fixture.nativeElement as HTMLElement;
  const texto = () => el().textContent as string;
  const enTexto = (nodo: Element) => nodo.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  /** Las celdas que se pueden elegir: en la tabla, solo las que tienen canchas libres son botón. */
  const celdas = () => [...el().querySelectorAll<HTMLButtonElement>('table button')];
  const etiquetas = () => celdas().map((celda) => celda.getAttribute('aria-label') ?? '');
  /** Las filas a la vista, con la hora de inicio que dice su encabezado. */
  const filas = () => [...el().querySelectorAll('table tbody tr')];
  const inicios = () =>
    filas().map((fila) => enTexto(fila.querySelector('th[scope="row"]')!).slice(0, 5));
  const filaDe = (inicio: string) =>
    filas().find((fila) => fila.querySelector('th')?.textContent?.includes(inicio))!;
  /** Los encabezados de columna sin el ícono, que en el DOM es una palabra: "roofing". */
  const columnas = () =>
    [...el().querySelectorAll('table thead th[scope="col"]')]
      .map((th) => {
        const copia = th.cloneNode(true) as Element;
        copia.querySelectorAll('mat-icon').forEach((icono) => icono.remove());
        return enTexto(copia);
      })
      .slice(1);
  /** El nombre de cada cancha del tablero, sin el ", techada" que se le dice al lector. */
  const nombres = () => columnas().map((columna) => columna.split(',')[0].trim());
  /** La celda de una cancha (1, 2…, en el orden del tablero) a una hora. */
  const celdaDe = (inicio: string, columna: number) =>
    filaDe(inicio).querySelectorAll('td')[columna - 1] as HTMLElement;

  beforeEach(async () => {
    // Las 07:00 del club el día del fixture, antes de todos sus bloques: la grilla
    // no ofrece horas que ya empezaron, y con el reloj real el fixture ya pasó.
    vi.setSystemTime('2026-08-17T11:00:00.000Z');
    await montar(DIA);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * T265. Disponibilidad dibuja el tablero de la portada (SPEC-revision-qa.md, A1): una
   * columna por cancha, y la celda libre elige esa cancha. Reemplaza a la tabla por tipo de
   * cancha de T103, con el precio una vez arriba y en la barra.
   */
  it('se titula «Reserva tu cancha» (P3)', async () => {
    await montar([]);

    expect(el().querySelector('h1')?.textContent?.trim()).toBe('Reserva tu cancha');
  });

  /**
   * T345 (SPEC-sitio.md, Decimoséptima parte, M2 y B3): en el teléfono los controles quedan
   * arriba y se pierden al bajar por el tablero, y había quien no sabía que podía cambiar el
   * día o la duración. Una línea pegada dice lo elegido, y «Cambiar» trae los controles.
   */
  describe('los controles a mano en el teléfono (T345)', () => {
    const resumen = () =>
      enTexto(el().querySelector('[data-resumen-de-controles]') as HTMLElement);
    const hoja = () => document.querySelector('mat-bottom-sheet-container') as HTMLElement | null;
    const abrir = async () => {
      [...el().querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Cambiar')!.click();
      await fixture.whenStable();
      fixture.detectChanges();
    };

    it('**la línea dice el día, la duración y las canchas que se miran**', async () => {
      expect(resumen()).toContain('Lun 17 ago · 1 hora · Todas');

      await montar(DIA, { duracion: '90' });
      expect(resumen()).toContain('Lun 17 ago · 1 hora y media · Todas');
    });

    it('va pegada bajo el encabezado y solo en el teléfono', () => {
      const linea = el().querySelector('[data-resumen-de-controles]') as HTMLElement;

      expect(linea.className).toContain('sticky');
      expect(linea.className).toContain('sm:hidden');
    });

    it('**«Cambiar» abre los controles en una hoja inferior, y cambiar ahí cambia la grilla**', async () => {
      await abrir();

      expect(hoja()?.querySelector('app-controles-del-dia')).not.toBeNull();
      [...hoja()!.querySelectorAll<HTMLButtonElement>('mat-button-toggle button')]
        .find((b) => b.textContent?.trim() === 'Con iluminación')!
        .click();
      await fixture.whenStable();
      fixture.detectChanges();

      // La del fixture tiene luz: el tablero sigue, y la línea dice el filtro nuevo.
      expect(resumen()).toContain('Lun 17 ago · 1 hora · Con iluminación');
    });

    it('**con la hoja abierta no se repite ningún id**: cada etiqueta nombra su campo', async () => {
      await abrir();
      const ids = [...document.querySelectorAll('[id]')].map((nodo) => nodo.id);

      expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    });

    it('«Listo» cierra la hoja', async () => {
      await abrir();
      [...hoja()!.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Listo')!.click();
      await fixture.whenStable();
      await new Promise((listo) => setTimeout(listo, 400));
      fixture.detectChanges();

      expect(hoja()).toBeNull();
    });
  });

  describe('el tablero de la portada (T265)', () => {
    const DOS: GrillaDeCancha[] = [
      {
        cancha: { ...DIA[0].cancha, id: 3, nombre: 'Cancha 3', techada: true },
        bloques: DIA[0].bloques.map((b) => ({ ...b, canchaId: 3, montoClp: 14000 })),
      },
      DIA[0],
    ];
    const barra = () => el().querySelector('app-barra-fija') as HTMLElement;

    it('**una columna por cancha, en el orden del club**, sobre la banda de la portada', async () => {
      await montar(DOS);

      expect(el().querySelector('app-marcador')).not.toBeNull();
      expect(nombres()).toEqual(['Cancha 3', 'Cancha 1']);
    });

    it('**la celda elige su cancha: la barra la nombra con su precio, sin chips**', async () => {
      await montar(DOS);

      filaDe('08:00').querySelectorAll('button')[1].click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(enTexto(barra())).toContain('Cancha 1');
      expect(enTexto(barra())).toContain('$12.000');
      expect(barra().querySelector('mat-button-toggle')).toBeNull();
      expect(filaDe('08:00').querySelectorAll('button')[1].getAttribute('aria-pressed')).toBe(
        'true',
      );
    });

    it('la etiqueta empieza con lo que se ve y dice cancha, hora y arriendo', () => {
      expect(etiquetas()[0]).toBe('Libre: elegir la Cancha 1 de 08:00 a 09:00, arriendo $12.000');
    });

    it('al visitante, el arriendo una vez arriba del tablero, y "desde" si varía', async () => {
      expect(enTexto(el().querySelector('[data-tarifas]')!)).toContain(
        'Arriendo de 1 hora por cancha: $12.000 · socio sin costo',
      );
      expect(enTexto(el().querySelector('tbody')!)).not.toContain('$');

      await montar(DOS);
      expect(enTexto(el().querySelector('[data-tarifas]')!)).toContain('desde $12.000');
    });

    it('si no queda ninguna libre, la línea de arriba no inventa un monto', async () => {
      // La API manda en 0 el monto de una hora tomada: con todas tomadas, "desde $0" o un
      // "$∞" de un mínimo sin montos.
      await montar([
        {
          cancha: DIA[0].cancha,
          bloques: DIA[0].bloques.map((b) => ({ ...b, reservado: true, montoClp: 0 })),
        },
      ]);

      const arriba = enTexto(el().querySelector('[data-tarifas]')!);
      expect(arriba).toBe('Arriendo de 1 hora por cancha · socio sin costo');
    });

    it('al socio, ningún monto: ni arriba, ni en el tablero, ni en la leyenda', async () => {
      await montar(DIA, {}, { socioId: 7 });

      expect(enTexto(el().querySelector('[data-tarifas]')!)).toContain('Socio sin costo');
      expect(enTexto(el().querySelector('app-marcador')!)).not.toContain('$');
    });
  });

  /**
   * T266. La celda que se tocó en la portada llega en la URL y la disponibilidad la marca:
   * quien llega no tiene que volver a buscarla entre ocho canchas.
   */
  describe('la celda que viene de la portada (T266)', () => {
    const barra = () => el().querySelector('app-barra-fija') as HTMLElement | null;

    it('**marca esa cancha a esa hora y abre la barra para reservar**', async () => {
      await montar(DIA, { fecha: '2026-08-17', cancha: '1', inicio: '18:00' });

      const marcada = el().querySelector('app-marcador button[aria-pressed="true"]');
      expect(marcada?.getAttribute('aria-label')).toContain('de 18:00 a 19:00');
      expect(enTexto(barra()!)).toContain('Cancha 1');
      expect(enTexto(barra()!)).toContain('Reservar');
    });

    it('si ya no está libre, no marca nada y lo dice', async () => {
      await montar(DIA, { fecha: '2026-08-17', cancha: '1', inicio: '10:00' });

      expect(barra()).toBeNull();
      expect(texto()).toContain('La hora que elegiste ya no está libre');

      // Elegir otra lo da por resuelto.
      celdas()[0].click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(texto()).not.toContain('ya no está libre');
    });

    it('una cancha o una hora mal escrita no marca nada y no dice nada', async () => {
      await montar(DIA, { fecha: '2026-08-17', cancha: 'uno', inicio: '18' });

      expect(barra()).toBeNull();
      expect(texto()).not.toContain('ya no está libre');
    });

    it('cambiar de día la suelta y no la vuelve a marcar', async () => {
      await montar(DIA, { fecha: '2026-08-17', cancha: '1', inicio: '18:00' });

      const dia = fixture.debugElement.query((nodo) => nodo.name === 'app-controles-del-dia');
      // set() del model emite el cambio, como el selector de días.
      dia.componentInstance.fecha.set('2026-08-18');
      await fixture.whenStable();
      fixture.detectChanges();

      expect(barra()).toBeNull();
    });
  });

  /** T268. Si hoy ya no queda ninguna libre, la disponibilidad abre en mañana. */
  describe('sin horas hoy, mañana (T268)', () => {
    const LLENO: GrillaDeCancha[] = [
      {
        cancha: DIA[0].cancha,
        bloques: DIA[0].bloques.map((b) => ({ ...b, reservado: true, montoClp: 0 })),
      },
    ];

    it('**sin fecha en la URL y con hoy lleno, pasa a mañana y lo dice**', async () => {
      await montar(LLENO);

      expect(pedirDia).toHaveBeenCalledWith('2026-08-18', 60);
      expect(texto()).toContain('Hoy ya no quedan horas libres: te mostramos mañana.');
    });

    it('con la fecha en la URL no se mueve, aunque ese día esté lleno', async () => {
      await montar(LLENO, { fecha: '2026-08-17' });

      expect(pedirDia).not.toHaveBeenCalledWith('2026-08-18', 60);
    });

    it('con horas hoy, no pide mañana', () => {
      expect(pedirDia).toHaveBeenCalledTimes(1);
      expect(texto()).not.toContain('te mostramos mañana');
    });
  });

  it('si todavía no pasó ninguna hora, no hay grupo plegado', () => {
    expect((fixture.nativeElement as HTMLElement).querySelector('mat-expansion-panel')).toBeNull();
  });

  /** T104. La barra dice qué quedó elegido y con cuánto, antes de "Reservar". */
  describe('la barra de la celda elegida', () => {
    const TRES: GrillaDeCancha[] = [
      {
        cancha: { ...DIA[0].cancha, id: 3, nombre: 'Cancha 3' },
        bloques: DIA[0].bloques.map((b) => ({ ...b, canchaId: 3, montoClp: 14000 })),
      },
      DIA[0],
    ];
    const barra = () => el().querySelector('app-barra-fija') as HTMLElement;

    it('**la hora elegida se marca entera**: con 1 hora, dos celdas (T344)', async () => {
      // Inicios cada media hora, como los manda la API: una hora ocupa dos filas.
      const SEGUIDAS: GrillaDeCancha[] = [
        {
          cancha: DIA[0].cancha,
          bloques: ['12:00', '12:30', '13:00'].map((hora) => {
            const inicio = `2026-08-17T${hora}:00.000Z`;
            return {
              ...DIA[0].bloques[0],
              inicio,
              fin: new Date(Date.parse(inicio) + 60 * 60 * 1000).toISOString(),
            };
          }),
        },
      ];
      await montar(SEGUIDAS);

      celdaDe('08:00', 1).querySelector('button')!.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(el().querySelectorAll('app-marcador [data-en-la-eleccion]')).toHaveLength(2);
      expect(celdaDe('08:30', 1).textContent).toContain('Parte de tu elección');
    });

    const elegirLaDeLas8 = async (columna = 1) => {
      celdaDe('08:00', columna).querySelector('button')!.click();
      await fixture.whenStable();
      fixture.detectChanges();
    };

    it('lo que se reserva es la cancha que se tocó en el tablero', async () => {
      await montar(TRES);
      await elegirLaDeLas8(2);

      [...barra().querySelectorAll('button')]
        .find((boton) => boton.textContent?.trim() === 'Reservar')!
        .click();
      await fixture.whenStable();
      fixture.detectChanges();

      const formulario = fixture.debugElement.query((nodo) => nodo.name === 'app-reservar');
      expect(formulario.componentInstance.cancha().nombre).toBe('Cancha 1');
    });

    it('al visitante, el arriendo en grande; al socio, "sin costo" y ningún monto', async () => {
      await elegirLaDeLas8();
      expect(enTexto(barra().querySelector('[data-precio]')!)).toBe('$12.000');

      await montar(DIA, {}, { socioId: 7 });
      await elegirLaDeLas8();
      expect(enTexto(barra())).toContain('Socio sin costo');
      expect(enTexto(barra())).not.toContain('$');
    });
  });
  it('cada fila es una hora de inicio, en la hora del club', () => {
    // 12:00Z en agosto son las 08:00 en Santiago. Con la hora del navegador o un
    // desfase fijo, el socio vería una hora que no es a la que juega.
    expect(inicios()).toEqual(['08:00', '10:00', '18:00']);
  });

  it('al socio la etiqueta le dice "socio sin costo", sin un arriendo que no paga', async () => {
    await montar(DIA, {}, { socioId: 7 });

    expect(etiquetas()[0]).toContain('socio sin costo');
    expect(etiquetas()[0]).not.toContain('arriendo');
  });

  it('la etiqueta también avisa que es hora prime', () => {
    // El `aria-label` reemplaza al contenido del botón, así que lo que no esté acá
    // no existe para quien usa lector de pantalla. Y la hora prime no es decoración:
    // le gasta al socio un cupo semanal del que solo tiene dos.
    //
    // De los tres bloques del fixture solo son botón los dos que se pueden tomar: el de
    // las 08:00 y el de las 18:00, que es el de hora prime.
    expect(etiquetas()[1]).toContain('hora prime');
    expect(etiquetas()[0]).not.toContain('hora prime');
  });

  it('solo es botón la celda libre, y se ve clickeable', () => {
    // Lo que no se puede tomar dice por qué con palabras, y no es un botón que no hace
    // nada: la celda de las 10:00, en mantención, no se aprieta.
    expect(celdas()).toHaveLength(2);
    for (const celda of celdas()) {
      expect(celda.classList.contains('cursor-pointer')).toBe(true);
      // 44px de alto: el mínimo táctil del master. La celda los da y el botón la llena.
      expect(celda.closest('td')?.classList.contains('h-11')).toBe(true);
      expect(celda.classList.contains('h-full')).toBe(true);
    }
    expect(filaDe('10:00').querySelector('button')).toBeNull();
  });

  it('el tablero dice qué es cada columna y cada fila', async () => {
    // `th` con `scope`: el lector de pantalla anuncia "Cancha 1, 08:00" al entrar a la
    // celda, en vez de un "Libre" suelto.
    expect(el().querySelectorAll('thead th[scope="col"]')).toHaveLength(2);
    expect(filaDe('08:00').querySelector('th[scope="row"]')).not.toBeNull();
  });

  describe('a media mañana', () => {
    // A las 16:40 la grilla ofrecía "Elegir Cancha 1 de 08:00 a 09:00", y un
    // visitante podía pagar una hora que ya había pasado. Acá son las 10:40 del
    // club: la de las 08:00 ya pasó y la de las 18:00 sigue libre.
    beforeEach(async () => {
      vi.setSystemTime('2026-08-17T14:40:00.000Z');
      await montar(DIA);
    });

    it('no ofrece una hora que ya empezó', () => {
      expect(etiquetas()).toEqual([expect.stringContaining('de 18:00 a 19:00')]);
    });

    it('dice que esa hora ya pasó, en vez de que no quedan canchas', () => {
      // "Sin libres" en cada hora de la mañana se lee como un club lleno.
      expect(texto()).toContain('Ya pasó');
    });

    // Decisión 9 del plan (TV5.1): a las 18:00 la grilla abría con diez filas
    // "Ya pasó" antes de la primera hora tomable. Se pliegan, sin quitarlas.
    it('las horas que ya pasaron se pliegan en un grupo que dice de cuándo a cuándo', () => {
      // Desde T103 hay una fila por inicio, cada media hora: "20 horas que ya pasaron" a las
      // 18:00 serían diez horas del reloj. El rango no se presta a esa confusión.
      const grupo = el().querySelector('mat-expansion-panel');
      const cabecera = grupo!.querySelector('mat-expansion-panel-header')!;

      // Un panel de Material (T281): el lector anuncia que está cerrado.
      expect(cabecera.getAttribute('aria-expanded')).toBe('false');
      expect(enTexto(cabecera)).toContain(
        'Horas que ya pasaron, de 08:00 a 10:00',
      );
      expect(grupo?.textContent).toContain('Ya pasó');
      // Fuera de la tabla: dentro serían filas enteras que dicen lo mismo en cada celda.
      expect(grupo?.querySelector('table')).toBeNull();
    });

    it('la primera fila a la vista es una que todavía se puede tomar', () => {
      expect(inicios()[0]).toBe('18:00');
      expect(filas()[0].querySelector('button')).not.toBeNull();
    });

    it('el resumen tampoco la cuenta', () => {
      const resumen = (fixture.nativeElement as HTMLElement).querySelector(
        '[role="status"] .sr-only',
      );

      expect(resumen?.textContent).toBe('1 hora disponible en 1 cancha.');
    });
  });

  /**
   * T83a y T103. Con inicios cada media hora, cada inicio es una fila de la tabla: la
   * opción C cabe en tres pantallas de teléfono sin juntarlos por hora, que es lo que
   * hacían las bandas de T83a. Nada se esconde.
   */
  describe('una fila por inicio', () => {
    const CANCHA = DIA[0].cancha;
    const bloque = (
      inicio: string,
      fin: string,
      parche: Partial<GrillaDeCancha['bloques'][number]> = {},
    ) => ({
      inicio,
      fin,
      canchaId: 1,
      montoClp: 12000,
      esPico: false,
      bloqueado: false,
      motivoBloqueo: null,
      reservado: false,
      ...parche,
    });
    // 12:00Z es las 08:00 del club en agosto.
    const MEDIAS_HORAS: GrillaDeCancha[] = [
      {
        cancha: CANCHA,
        bloques: [
          bloque('2026-08-17T12:00:00.000Z', '2026-08-17T13:00:00.000Z'),
          bloque('2026-08-17T12:30:00.000Z', '2026-08-17T13:30:00.000Z'),
          bloque('2026-08-17T13:00:00.000Z', '2026-08-17T14:00:00.000Z'),
          // 17:00 en normal y 17:30 ya en la franja prime, que empieza a las 17:30.
          bloque('2026-08-17T21:00:00.000Z', '2026-08-17T22:00:00.000Z'),
          bloque('2026-08-17T21:30:00.000Z', '2026-08-17T22:30:00.000Z', {
            montoClp: 20000,
            esPico: true,
          }),
        ],
      },
    ];

    beforeEach(async () => {
      await montar(MEDIAS_HORAS);
    });

    it('**el inicio de y media es su propia fila, en orden** (reemplaza a la banda por hora)', () => {
      expect(inicios()).toEqual(['08:00', '08:30', '09:00', '17:00', '17:30']);
    });

    it('**"socio sin costo" se dice una vez, arriba del tablero** (reemplaza al precio común de la banda)', () => {
      expect(texto().match(/socio sin costo/gi)).toHaveLength(1);
    });

    it('**la fila de prime lo dice en su encabezado, y la de normal no** (reemplaza a la marca prime de la banda)', () => {
      expect(enTexto(filaDe('17:00').querySelector('th')!)).not.toMatch(/prime/i);
      expect(enTexto(filaDe('17:30').querySelector('th')!)).toMatch(/prime/i);
    });

    it('la cancha en mantención lo dice en su celda, y la de al lado sigue libre', async () => {
      await montar([
        ...MEDIAS_HORAS,
        {
          cancha: { ...CANCHA, id: 2, nombre: 'Cancha 2' },
          bloques: [
            bloque('2026-08-17T12:00:00.000Z', '2026-08-17T13:00:00.000Z', {
              bloqueado: true,
              motivoBloqueo: 'MANTENCION',
            }),
          ],
        },
      ]);

      expect(celdaDe('08:00', 1).querySelector('button')).not.toBeNull();
      expect(enTexto(celdaDe('08:00', 2))).toContain('En mantención');
    });

    it('la cancha en mantención no es un botón y lo dice', async () => {
      await montar([
        {
          cancha: CANCHA,
          bloques: [
            bloque('2026-08-17T12:00:00.000Z', '2026-08-17T13:00:00.000Z', {
              bloqueado: true,
              motivoBloqueo: 'MANTENCION',
            }),
          ],
        },
      ]);

      expect(celdaDe('08:00', 1).querySelector('button')).toBeNull();
      expect(enTexto(celdaDe('08:00', 1))).toContain('En mantención');
    });

    it('una cancha tomada dice "Ocupada"', async () => {
      await montar([
        { cancha: CANCHA, bloques: [bloque('2026-08-17T12:00:00.000Z', '2026-08-17T13:00:00.000Z', { reservado: true })] },
      ]);

      expect(enTexto(celdaDe('08:00', 1))).toContain('Ocupada');
    });

    /**
     * T97. Una hora cerrada por una clase o por un torneo se contaba como mantención: quien
     * llegaba nuevo veía "en mantención" justo donde había una clase que le podía servir.
     */
    describe('las clases y los torneos se nombran (T97)', () => {
      const conCancha2 = (parche: Partial<GrillaDeCancha['bloques'][number]>) =>
        montar([
          ...MEDIAS_HORAS,
          {
            cancha: { ...CANCHA, id: 2, nombre: 'Cancha 2' },
            bloques: [
              bloque('2026-08-17T12:00:00.000Z', '2026-08-17T13:00:00.000Z', parche),
              bloque('2026-08-17T12:30:00.000Z', '2026-08-17T13:30:00.000Z'),
            ],
          },
        ]);

      it('**una clase se dice clase y enlaza a las clases**, no "en mantención"', async () => {
        await conCancha2({ bloqueado: true, motivoBloqueo: 'CLASE' });

        const celda = celdaDe('08:00', 2);
        expect(enTexto(celda)).toContain('Clase');
        expect(enTexto(celda)).not.toContain('mantención');
        // El destino declarado y no el href: el Router de este spec es un doble con solo
        // `navigate`, y con él RouterLink no arma la URL. El href se vio en el navegador.
        expect(celda.querySelector('a')?.getAttribute('routerlink')).toBe('/clases');
      });

      it('un partido de torneo se dice torneo', async () => {
        await conCancha2({ bloqueado: true, motivoBloqueo: 'TORNEO' });

        expect(enTexto(celdaDe('08:00', 2))).toContain('Torneo');
        expect(enTexto(celdaDe('08:00', 2))).not.toContain('mantención');
      });

      it('la clase va en su fila: el inicio de y media no la tiene', async () => {
        await conCancha2({ bloqueado: true, motivoBloqueo: 'CLASE' });

        expect(enTexto(celdaDe('08:30', 2))).not.toContain('Clase');
      });

      it('un cierre por otro motivo dice "No disponible", ni clase ni torneo', async () => {
        await montar([
          {
            cancha: CANCHA,
            bloques: [
              bloque('2026-08-17T12:00:00.000Z', '2026-08-17T13:00:00.000Z', {
                bloqueado: true,
                motivoBloqueo: 'OTRO',
              }),
            ],
          },
        ]);

        expect(enTexto(celdaDe('08:00', 1))).toContain('No disponible');
      });
    });

    it('a las 08:10, el inicio de las 08:00 se pliega y el de las 08:30 abre la tabla', async () => {
      // Reemplaza a "la banda queda a la vista y marca el pasado": sin bandas, cada inicio
      // se pliega solo cuando empieza.
      vi.setSystemTime('2026-08-17T12:10:00.000Z');
      await montar(MEDIAS_HORAS);

      expect(inicios()[0]).toBe('08:30');
      expect(enTexto(el().querySelector('mat-expansion-panel-header')!)).toContain(
        'La hora de las 08:00 ya pasó',
      );
    });
  });

  /**
   * T83b. Se reserva 1 hora o 1 hora y media. La duración vive en la URL —como el modo
   * "mover"— para que recargar o compartir el enlace no la pierda.
   */
  describe('la duración', () => {
    /** Si la duración con ese valor está elegida (T251: es un mat-button-toggle-group). */
    const elegida = (valor: string) =>
      opcionesDelGrupo(fixture, DURACION).find((o) => o.valor === valor)?.elegida;
    const SIN_HORA_Y_MEDIA: GrillaDeCancha[] = [
      {
        cancha: DIA[0].cancha,
        bloques: [
          {
            inicio: '2026-08-17T21:00:00.000Z',
            fin: '2026-08-17T22:30:00.000Z',
            canchaId: 1,
            montoClp: null,
            esPico: false,
            bloqueado: false,
            motivoBloqueo: null,
            reservado: false,
          },
          {
            inicio: '2026-08-17T12:00:00.000Z',
            fin: '2026-08-17T13:30:00.000Z',
            canchaId: 1,
            montoClp: 16000,
            esPico: false,
            bloqueado: false,
            motivoBloqueo: null,
            reservado: false,
          },
        ],
      },
    ];

    it('sin duración en la URL pide la grilla de 1 hora', () => {
      expect(pedirDia).toHaveBeenCalledWith(expect.any(String), 60);
      expect(elegida('60')).toBe(true);
    });

    it('**con ?duracion=90 pide la grilla de 1 hora y media**', async () => {
      await montar(DIA, { duracion: '90' });

      expect(pedirDia).toHaveBeenCalledWith(expect.any(String), 90);
      expect(elegida('90')).toBe(true);
    });

    it('elegir 1 hora y media la deja en la URL, y volver a 1 hora la saca', async () => {
      await alternar(fixture, '90', DURACION);
      expect(navegar).toHaveBeenLastCalledWith(
        [],
        expect.objectContaining({
          queryParams: { duracion: 90 },
          queryParamsHandling: 'merge',
        }),
      );

      await alternar(fixture, '60', DURACION);
      expect(navegar).toHaveBeenLastCalledWith(
        [],
        expect.objectContaining({ queryParams: { duracion: null } }),
      );
    });

    it('**al visitante no se le ofrece un inicio sin precio de 1 hora y media**', async () => {
      // Sin `montoClp90` la franja no le vende la hora y media a quien no es socio (T79).
      await montar(SIN_HORA_Y_MEDIA, { duracion: '90' });

      expect(etiquetas()).toEqual([expect.stringContaining('de 08:00 a 09:30')]);
      // Y la celda no dice "ocupada", que sería falso: la cancha está libre.
      expect(enTexto(celdaDe('17:00', 1))).toContain('No se arrienda por 1 hora y media');
      expect(enTexto(el().querySelector('table')!)).not.toContain('Ocupada');
    });

    it('si en todo el día no hay hora y media para el visitante, lo dice una vez y ofrece la salida', async () => {
      // Sin esto eran 27 filas con el mismo "no se arrienda": un callejón, como el filtro
      // que no deja canchas.
      const SIN_NINGUNA: GrillaDeCancha[] = [
        {
          cancha: DIA[0].cancha,
          bloques: SIN_HORA_Y_MEDIA[0].bloques.map((b) => ({ ...b, montoClp: null })),
        },
      ];
      await montar(SIN_NINGUNA, { duracion: '90' });

      expect(texto()).toContain('Este día no se arrienda 1 hora y media');
      expect(texto()).not.toContain('No se arrienda por 1 hora y media');

      const salida = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === 'Ver horas de 1 hora',
      )!;
      salida.click();
      expect(navegar).toHaveBeenLastCalledWith(
        [],
        expect.objectContaining({ queryParams: { duracion: null } }),
      );
    });

    it('al socio sí, porque no paga: y la etiqueta no le inventa un arriendo', async () => {
      await montar(SIN_HORA_Y_MEDIA, { duracion: '90' }, { socioId: 7 });

      expect(etiquetas()).toHaveLength(2);
      const sinPrecio = etiquetas().find((e) => e.includes('de 17:00 a 18:30'))!;
      expect(sinPrecio).not.toMatch(/arriendo/i);
    });

    it('**al socio no se le ofrece la duración que el club no le permite en prime** (T213)', async () => {
      // La API marca `socioPuede: false` donde la hora y media toca prime y el club solo le
      // deja 1 hora. La celda dice por qué, y no "sin libres".
      const PRIME: GrillaDeCancha[] = [
        {
          cancha: DIA[0].cancha,
          bloques: SIN_HORA_Y_MEDIA[0].bloques.map((b, i) => ({
            ...b,
            montoClp: 16000,
            socioPuede: i !== 0,
          })),
        },
      ];
      await montar(PRIME, { duracion: '90' }, { socioId: 7 });

      expect(etiquetas()).toEqual([expect.stringContaining('de 08:00 a 09:30')]);
      expect(enTexto(celdaDe('17:00', 1))).toContain('En horario prime, solo 1 hora');
    });

    it('al visitante, `socioPuede` no le cambia nada', async () => {
      const PRIME: GrillaDeCancha[] = [
        {
          cancha: DIA[0].cancha,
          bloques: SIN_HORA_Y_MEDIA[0].bloques.map((b) => ({
            ...b,
            montoClp: 16000,
            socioPuede: false,
          })),
        },
      ];
      await montar(PRIME, { duracion: '90' });

      expect(etiquetas()).toHaveLength(2);
    });

    it('**al mover, el selector parte en la duración de la reserva y se puede cambiar** (T87)', async () => {
      // "Mis reservas" manda `duracion=90` cuando la reserva es de 1 hora y media.
      await montar(DIA, { mover: '5', duracion: '90' });

      expect(elegida('90')).toBe(true);
      // De la grilla que no cuenta la reserva que se mueve, no de la pública: si no, la
      // hora y media en el mismo lugar sale ocupada por ella misma.
      expect(pedirDiaParaMover).toHaveBeenCalledWith(5, expect.any(String), 90);
      expect(pedirDia).not.toHaveBeenCalled();

      await alternar(fixture, '60', DURACION);
      // Sin soltar el modo mover: la URL conserva `mover` y solo cambia la duración.
      expect(navegar).toHaveBeenLastCalledWith(
        [],
        expect.objectContaining({
          queryParams: { duracion: null },
          queryParamsHandling: 'merge',
        }),
      );
    });
  });

  it('el selector de día también se anuncia como clickeable', () => {
    // Desde T244, la manito y el borde que responde los pone `abre-al-tocar` en su
    // mat-form-field (tema-material.scss).
    const fecha = (fixture.nativeElement as HTMLElement).querySelector(
      'input[placeholder="dd-mm-aaaa"]',
    );

    expect(fecha?.closest('mat-form-field')?.classList.contains('abre-al-tocar')).toBe(true);
  });

  it('avisa cuál es hora prime, en la fila y en la leyenda', () => {
    expect(enTexto(filaDe('18:00').querySelector('th')!)).toMatch(/prime/i);
    expect(enTexto(el().querySelector('app-marcador ul')!)).toContain('Hora prime');
  });

  it('dice el estado con palabras, no solo con color', () => {
    // El par verde/rojo es justo el que no distingue quien tiene daltonismo
    // rojo-verde: si el estado solo estuviera en el color, la pantalla mentiría.
    const leyenda = enTexto(el().querySelector('app-marcador ul')!);
    expect(leyenda).toContain('Libre');
    expect(leyenda).toContain('Ocupada');
    // Y nunca el enum crudo de la base, que se lee como una falla del sistema.
    expect(texto()).not.toContain('MANTENCION');
  });

  it('una celda que no se puede tomar dice por qué con palabras, no con un color', () => {
    // Antes eso se resolvía con un borde punteado sobre la tarjeta; en el tablero, la celda
    // rayada lleva el ícono de su motivo y lo dice al lector.
    expect(enTexto(celdaDe('10:00', 1))).toContain('En mantención');
  });

  it('no ofrece precio de un bloque que no se puede tomar', () => {
    // Un precio junto a "En mantención" invita a intentar reservarlo.
    expect(enTexto(filaDe('10:00'))).not.toContain('$');
  });

  describe('filtros de cancha', () => {
    const DOS_CANCHAS: GrillaDeCancha[] = [
      DIA[0],
      {
        cancha: {
          id: 2,
          nombre: 'Cancha techada',
          superficie: 'CEMENTO',
          techada: true,
          iluminacion: false,
        },
        bloques: DIA[0].bloques,
      },
    ];

    const elegirFiltro = async (valor: string) => {
      await alternar(fixture, valor, '[aria-label="Filtrar canchas"]');
      await fixture.whenStable();
      fixture.detectChanges();
    };

    it('deja solo las canchas techadas', async () => {
      await montar(DOS_CANCHAS);
      await elegirFiltro('techadas');

      expect(nombres()).toEqual(['Cancha techada']);
    });

    it('"al aire libre" es lo contrario de techada, no un campo aparte', async () => {
      await montar(DOS_CANCHAS);
      await elegirFiltro('aire-libre');

      expect(nombres()).toEqual(['Cancha 1']);
    });

    it('el resumen cuenta lo que se ve, no lo que quedó filtrado', async () => {
      // Anunciar las horas de las canchas escondidas le diría a quien usa lector
      // de pantalla que hay el doble de lo que la pantalla muestra.
      await montar(DOS_CANCHAS);
      await elegirFiltro('techadas');

      expect(texto()).toContain('en 1 cancha');
    });

    it('si el filtro no deja nada, ofrece la salida', async () => {
      await montar(DIA);
      await elegirFiltro('techadas');

      expect(texto()).toContain('Ninguna cancha cumple ese filtro');

      [
        ...(fixture.nativeElement as HTMLElement).querySelectorAll('button'),
      ]
        .find((boton) => boton.textContent?.trim() === 'Ver todas las canchas')!
        .click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(nombres()).toEqual(['Cancha 1']);
    });
  });

  it('anuncia el resultado a quien no ve la grilla', async () => {
    // Sin esto, un lector de pantalla dice "buscando" y después se queda callado:
    // nadie se entera de si la grilla se repobló ni con cuánto. Dos libres de
    // tres bloques, porque el del medio está en mantención.
    const resumen = (fixture.nativeElement as HTMLElement).querySelector(
      '[role="status"] .sr-only',
    );

    expect(resumen?.textContent).toBe('2 horas disponibles en 1 cancha.');
  });

  it('cuando una cancha no abre ese día lo dice, en vez de quedar vacía', async () => {
    await montar([{ cancha: DIA[0].cancha, bloques: [] }]);

    expect(texto()).toContain('no abre este día');
  });

  it('cuando el club no tiene canchas publicadas lo dice', async () => {
    await montar([]);

    expect(texto()).toContain('no tiene canchas publicadas');
  });

  // `value()` de un resource lanza en estado de error aunque tenga `defaultValue`.
  it('si la disponibilidad no carga, lo dice', async () => {
    await montar(new Error('la API no respondió'));

    expect(texto()).toContain('No se pudo cargar la disponibilidad');
  });

  describe('reportar una hora no usada (T35)', () => {
    const RESERVADO: GrillaDeCancha[] = [
      {
        cancha: DIA[0].cancha,
        bloques: [
          {
            ...DIA[0].bloques[0],
            reservado: true,
            montoClp: 0,
          },
        ],
      },
    ];

    const laReportable = [
      {
        reservaId: 25,
        canchaId: 1,
        inicio: '2026-08-17T12:00:00.000Z',
        yaReportada: false,
      },
    ];

    // Las 09:10 del club: la hora tomada de las 08:00 ya terminó, que es cuando el servidor
    // la lista. Desde T103 el botón vive entre las horas que ya pasaron: una fila de la
    // tabla es para elegir, y lo que se reporta ya no se puede elegir.
    beforeEach(() => {
      vi.setSystemTime('2026-08-17T13:10:00.000Z');
    });

    it('el socio ve el botón sobre la hora tomada que ya pasó', async () => {
      await montar(RESERVADO, {}, { socioId: 7, reportables: laReportable });

      expect(texto()).toContain('Reportar hora no usada');
    });

    it('plegada, la hora reportable sigue a un toque y el grupo lo anuncia', async () => {
      // A las 10:40 la hora tomada de las 08:00 ya pasó y queda en el grupo.
      vi.setSystemTime('2026-08-17T14:40:00.000Z');
      await montar(RESERVADO, {}, { socioId: 7, reportables: laReportable });
      const grupo = (fixture.nativeElement as HTMLElement).querySelector('mat-expansion-panel');

      expect(grupo?.querySelector('mat-expansion-panel-header')?.textContent).toContain('reportar');
      expect(
        [...(grupo?.querySelectorAll('button') ?? [])].some((b) =>
          b.textContent?.includes('Reportar hora no usada'),
        ),
      ).toBe(true);
    });

    it('a quien no tiene ficha de socio no se lo ofrece', async () => {
      // Ni siquiera se le pregunta al servidor: el endpoint es `@SoloSocio()` y
      // pedirlo sería un 403 en la consola de cada visitante.
      await montar(RESERVADO, {}, { socioId: null });

      expect(reportables).not.toHaveBeenCalled();
      expect(texto()).not.toContain('Reportar hora no usada');
    });

    it('si la lista de reportables no carga, la grilla se pinta igual y sin el botón', async () => {
      await montar(RESERVADO, {}, {
        socioId: 7,
        reportables: new Error('la API no respondió'),
      });

      expect(texto()).toContain('08:00');
      expect(texto()).not.toContain('Reportar hora no usada');
    });

    it('tampoco sobre una hora que el servidor no listó como reportable', async () => {
      // La lista la arma el servidor —lo transcurrido, ajeno y dentro del plazo—;
      // la grilla no vuelve a decidirlo por su cuenta.
      await montar(RESERVADO, {}, { socioId: 7, reportables: [] });

      expect(texto()).not.toContain('Reportar hora no usada');
    });

    it('al reportar dice que es anónimo, sin prometer una sanción', async () => {
      await montar(RESERVADO, {}, { socioId: 7, reportables: laReportable });

      Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
      )
        .find((b) => b.textContent?.includes('Reportar'))
        ?.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(reportar).toHaveBeenCalledWith(25);
      expect(texto()).toContain('anónimo');
      // Decidir es del club: prometer castigo haría de esto un arma.
      expect(texto()).not.toMatch(/sancion/i);
    });

    it('la que ya reportó lo dice, en vez de ofrecer un botón que falla', async () => {
      await montar(
        RESERVADO,
        {},
        {
          socioId: 7,
          reportables: [{ ...laReportable[0], yaReportada: true }],
        },
      );

      expect(texto()).toContain('Ya reportaste esta hora');
    });
  });

  describe('cambiando la hora de una reserva (T24)', () => {
    // La grilla es el selector de bloques que ya existe, con las canchas, los
    // bloqueos y lo que está tomado. Traer aquí a quien viene de "mis reservas" es
    // más barato —y más consistente— que un segundo selector dentro de la tarjeta.
    const elegirPrimerBloque = async () => {
      celdas()[0].click();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const barra = () => el().querySelector('app-barra-fija') as HTMLElement;
    const botonDeLaBarra = (texto: string) =>
      [...barra().querySelectorAll('button')].find((b) => b.textContent?.trim() === texto)!;
    const apretar = async (boton: HTMLElement) => {
      boton.click();
      await fixture.whenStable();
      fixture.detectChanges();
    };

    it('avisa que se está cambiando una hora ya reservada', async () => {
      await montar(DIA, { mover: '7' });

      expect(texto()).toContain('Elige la nueva hora');
    });

    it('**abre en el día de la reserva que se mueve, no en hoy**', async () => {
      // El enlace de mover lleva la fecha: alargar una reserva de otro día obligaba a
      // buscar su día antes de poder elegir.
      await montar(DIA, { mover: '7', fecha: '2037-09-14' });

      expect(pedirDiaParaMover).toHaveBeenCalledWith(7, '2037-09-14', 60);
    });

    it('**desde el enlace también: abre en el día de la reserva**', async () => {
      await montar(DIA, { moverToken: 'tok-123', fecha: '2037-09-14', duracion: '90' });

      expect(delEnlace.grillaParaMover).toHaveBeenCalledWith('tok-123', '2037-09-14', 90);
    });

    it('una fecha pasada o mal escrita en la URL cae en hoy', async () => {
      // La grilla no vende horas que ya pasaron, y un enlace roto no puede dejarla vacía.
      await montar(DIA, { fecha: '2020-01-01' });
      await montar(DIA, { fecha: 'mañana' });

      const hoy = pedirDia.mock.calls[0][0] as string;
      expect(hoy).not.toBe('2020-01-01');
      expect(hoy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(pedirDia).toHaveBeenCalledWith(hoy, 60);
    });

    it('**el socio elige la celda, la barra confirma el cambio y vuelve a mis reservas** (T104)', async () => {
      // Antes el clic movía al tiro. Con la barra, el clic marca la cancha y la barra dice
      // cuál quedó antes de mover.
      await montar(DIA, { mover: '7' });

      await elegirPrimerBloque();

      expect(mover).not.toHaveBeenCalled();
      expect(barra().textContent).toContain('Cancha 1');
      expect(barra().textContent).toContain('Socio sin costo');

      await apretar(botonDeLaBarra('Cambiar a esta hora'));

      expect(mover).toHaveBeenCalledWith(7, {
        canchaId: 1,
        inicio: '2026-08-17T12:00:00.000Z',
        // La del bloque elegido: el que se movió a 1 hora y media la alarga (T87).
        duracionMin: 60,
      });
      // Vuelve a sus reservas, que son una pestaña de Mi cuenta desde T318.
      expect(navegar).toHaveBeenCalledWith(['/mi-cuenta/reservas']);
    });

    it('**al mover con 1 hora y media, manda 90: la reserva se alarga** (T87)', async () => {
      // Bloques de 90 minutos, como los pide la grilla con `duracion=90`.
      const DE_90: GrillaDeCancha[] = [
        {
          cancha: DIA[0].cancha,
          bloques: DIA[0].bloques.map((b) => ({
            ...b,
            fin: new Date(new Date(b.inicio).getTime() + 90 * 60 * 1000).toISOString(),
          })),
        },
      ];
      await montar(DE_90, { mover: '7', duracion: '90' });

      await elegirPrimerBloque();
      await apretar(botonDeLaBarra('Cambiar a esta hora'));

      expect(mover).toHaveBeenCalledWith(7, expect.objectContaining({ duracionMin: 90 }));
    });

    /** Dos abiertas libres a las 08:00, la 3 primero en el orden del club. */
    const DOS_ABIERTAS: GrillaDeCancha[] = [
      {
        cancha: { ...DIA[0].cancha, id: 3, nombre: 'Cancha 3' },
        bloques: DIA[0].bloques.map((b) => ({ ...b, canchaId: 3 })),
      },
      DIA[0],
    ];

    it('al mover, la cancha que se toca es a la que se mueve', async () => {
      // Desde T265 cada cancha tiene su columna: alargar una hora sin cambiarla de cancha es
      // tocar la celda de la suya, sin preelegir nada.
      await montar(DOS_ABIERTAS, { mover: '7' });

      await apretar(celdaDe('08:00', 2).querySelector('button')!);
      await apretar(botonDeLaBarra('Cambiar a esta hora'));

      expect(mover).toHaveBeenCalledWith(7, expect.objectContaining({ canchaId: 1 }));
    });

    describe('desde el enlace de la reserva, sin sesión (T88)', () => {
      it('pide la grilla del enlace, que no cuenta la reserva, y no la pública', async () => {
        await montar(DIA, { moverToken: 'tok-123' });

        expect(delEnlace.grillaParaMover).toHaveBeenCalledWith(
          'tok-123',
          expect.any(String),
          60,
        );
        expect(pedirDia).not.toHaveBeenCalled();
      });

      it('**dice cuánto pagó y que no se devuelve la diferencia, antes de elegir**', async () => {
        await montar(DIA, { moverToken: 'tok-123' });

        expect(texto()).toContain('Pagaste $16.000');
        expect(texto()).toContain('no se devuelve la diferencia');
      });


      it('**el clic no mueve al tiro: antes de confirmar dice que no se devuelve la diferencia** (T91)', async () => {
        // Pagó $16.000 y la de las 08:00 vale $12.000: el cambio pierde $4.000, y eso se
        // dice antes del clic que lo hace.
        await montar(DIA, { moverToken: 'tok-123' });

        await elegirPrimerBloque();

        expect(delEnlace.mover).not.toHaveBeenCalled();
        expect(barra().textContent).toContain('no se devuelve la diferencia de $4.000');
        expect(botonDeLaBarra('Cambiar a esta hora')).toBeDefined();
      });

      it('**sin saber cuánto pagó, el clic no ofrece reservar una hora nueva** (revisión de T91)', async () => {
        // La barra caía en la de reservar si lo pagado no llegaba —cargando, o la consulta
        // falló—, y "Reservar" abría una reserva nueva en vez de cambiar la suya.
        await montar(DIA, { moverToken: 'tok-123' }, {
          reservaDelEnlace: new Error('la API no respondió'),
        });

        await elegirPrimerBloque();

        // Ni la barra de reservar ni una vacía: la hora no queda marcada.
        expect((fixture.nativeElement as HTMLElement).querySelector('app-barra-fija')).toBeNull();
      });

      it('al confirmar, mueve por el enlace y vuelve a la página de la reserva con el resultado', async () => {
        await montar(DIA, { moverToken: 'tok-123' });
        await elegirPrimerBloque();

        await apretar(botonDeLaBarra('Cambiar a esta hora'));

        expect(delEnlace.mover).toHaveBeenCalledWith('tok-123', {
          canchaId: 1,
          inicio: '2026-08-17T12:00:00.000Z',
          duracionMin: 60,
        });
        expect(mover).not.toHaveBeenCalled();
        expect(navegar).toHaveBeenCalledWith(['/r', 'tok-123'], {
          queryParams: { cambio: 'hecho' },
        });
      });

      it('**si vale más, dice cuánto paga y el botón lleva a pagar la diferencia** (T91)', async () => {
        const CARA: GrillaDeCancha[] = DIA.map((grilla) => ({
          ...grilla,
          bloques: grilla.bloques.map((b) => ({ ...b, montoClp: 20000 })),
        }));
        await montar(CARA, { moverToken: 'tok-123' });
        await elegirPrimerBloque();

        expect(barra().textContent).toContain('Pagas $4.000 de diferencia');

        await apretar(botonDeLaBarra('Pagar $4.000'));

        // Pagar, no mover: la reserva se mueve recién cuando Webpay autoriza (T89).
        expect(delEnlace.pagarDiferencia).toHaveBeenCalledWith('tok-123', {
          canchaId: 1,
          inicio: '2026-08-17T12:00:00.000Z',
          duracionMin: 60,
        });
        expect(delEnlace.mover).not.toHaveBeenCalled();
        // El servidor manda: si rechaza, lo dice y la persona sigue en la grilla.
        expect(texto()).toContain('Esa hora ya está tomada');
      });

      it('la etiqueta de cada hora ya dice lo que costaría el cambio', async () => {
        await montar(DIA, { moverToken: 'tok-123' });

        expect(etiquetas()[0]).toContain('no se devuelve la diferencia de $4.000');
      });
    });

    it('sin el parámetro, el clic elige el bloque en vez de mover nada', async () => {
      // El flujo del rediseño (plan § 5.8) tiene dos pasos: el clic marca la hora
      // y muestra la barra de abajo con su precio; el formulario lo abre recién
      // "Reservar". El clic-que-abre-el-diálogo saltaba ese paso intermedio.
      await elegirPrimerBloque();

      expect(mover).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('app-barra-fija')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('app-reservar')).toBeNull();
    });

    it('la barra muestra lo elegido y su precio, y de ahí sale el formulario', async () => {
      await elegirPrimerBloque();

      const barra = (fixture.nativeElement as HTMLElement).querySelector(
        'app-barra-fija',
      ) as HTMLElement;

      expect(barra.textContent).toContain('Cancha 1');
      expect(barra.textContent).toContain('08:00–09:00');
      expect(barra.textContent).toContain('$12.000');

      [...barra.querySelectorAll('button')]
        .find((boton) => boton.textContent?.trim() === 'Reservar')!
        .click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('app-reservar')).not.toBeNull();
    });

    it('al confirmar, el token viaja con el folio a la pantalla de confirmación', async () => {
      // Sin el token, el socio llegaba a una confirmación con un número y nada
      // más: el resumen y el QR salen de él.
      await elegirPrimerBloque();

      const barra = (fixture.nativeElement as HTMLElement).querySelector(
        'app-barra-fija',
      ) as HTMLElement;
      [...barra.querySelectorAll('button')]
        .find((boton) => boton.textContent?.trim() === 'Reservar')!
        .click();
      await fixture.whenStable();
      fixture.detectChanges();

      const formulario = fixture.debugElement.query(
        (nodo) => nodo.name === 'app-reservar',
      );
      formulario.componentInstance.reservado.emit({
        folio: 'ABC1234',
        token: 'un-token-largo-y-aleatorio',
      });

      expect(navegar).toHaveBeenCalledWith(['/reservas/confirmacion'], {
        queryParams: { folio: 'ABC1234', t: 'un-token-largo-y-aleatorio' },
      });
    });

    it('soltar la elección esconde la barra sin reservar nada', async () => {
      await elegirPrimerBloque();

      const barra = (fixture.nativeElement as HTMLElement).querySelector(
        'app-barra-fija',
      ) as HTMLElement;

      [...barra.querySelectorAll('button')]
        .find((boton) => boton.textContent?.trim() === 'Soltar')!
        .click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('app-barra-fija')).toBeNull();
      expect(fixture.nativeElement.querySelector('app-reservar')).toBeNull();
    });

    it('cambiar la duración suelta lo elegido: su fin y su precio eran de la otra', async () => {
      await elegirPrimerBloque();

      await alternar(fixture, '90', DURACION);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('app-barra-fija')).toBeNull();
    });

    it('**cambiar de día suelta lo elegido: la barra no dice la fecha** (revisión de T104)', async () => {
      // Con la celda de hoy marcada y la tabla de mañana a la vista, "Reservar" tomaba la
      // hora de hoy sin que nada en pantalla lo dijera.
      await elegirPrimerBloque();

      el()
        .querySelector<HTMLButtonElement>('app-controles-del-dia button[role="radio"][aria-checked="false"]')!
        .click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(el().querySelector('app-barra-fija')).toBeNull();
    });

    it('si la reserva ya no existe, lo dice con las palabras del servidor', async () => {
      // Un 404 al mover significa "no encontramos esa reserva" —la cancelaron desde
      // otro dispositivo, o el enlace quedó viejo—, no que el bloque haya dejado de
      // existir. El texto fijo de la grilla mandaba a mirar el horario de la cancha.
      await montar(DIA, { mover: '7' });
      mover.mockRejectedValueOnce({
        status: 404,
        error: { message: 'No encontramos esa reserva.' },
      });

      await elegirPrimerBloque();
      await apretar(botonDeLaBarra('Cambiar a esta hora'));

      expect(texto()).toContain('No encontramos esa reserva');
      expect(texto()).not.toContain('horario de la cancha');
    });

    it('dos clics seguidos mueven la reserva una sola vez', async () => {
      // Con la red lenta la persona vuelve a tocar otro bloque al no ver reacción.
      // Sin un estado de envío salen dos PATCH y la hora final es la del que responda
      // último, que no tiene por qué ser el que eligió último.
      await montar(DIA, { mover: '7' });
      let resolver: (valor: unknown) => void = () => undefined;
      mover.mockReturnValueOnce(
        new Promise((cumplir) => {
          resolver = cumplir;
        }),
      );

      // Con la red lenta, quien no ve reacción vuelve a apretar.
      await elegirPrimerBloque();
      const confirmar = botonDeLaBarra('Cambiar a esta hora');
      confirmar.click();
      confirmar.click();

      expect(mover).toHaveBeenCalledTimes(1);

      resolver({});
      await fixture.whenStable();
    });

    it('si la hora se tomó entre medio, lo dice y no se va de la página', async () => {
      await montar(DIA, { mover: '7' });
      mover.mockRejectedValueOnce({
        error: { motivo: 'BLOQUE_TOMADO', message: 'Esa hora la acaban de tomar.' },
      });

      await elegirPrimerBloque();
      await apretar(botonDeLaBarra('Cambiar a esta hora'));

      expect(texto()).toContain('acaban de tomar');
      expect(navegar).not.toHaveBeenCalled();
    });
  });
});
