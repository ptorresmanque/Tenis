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
        copia.querySelectorAll('.icono').forEach((icono) => icono.remove());
        return enTexto(copia);
      })
      .slice(1);

  beforeEach(async () => {
    // Las 07:00 del club el día del fixture, antes de todos sus bloques: la grilla
    // no ofrece horas que ya empezaron, y con el reloj real el fixture ya pasó.
    vi.setSystemTime('2026-08-17T11:00:00.000Z');
    await montar(DIA);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('si todavía no pasó ninguna hora, no hay grupo plegado', () => {
    expect((fixture.nativeElement as HTMLElement).querySelector('details')).toBeNull();
  });

  /**
   * T104. Elegir una celda elige un tipo y una hora; la cancha puntual se elige en la barra,
   * entre las libres de esa celda (A8 del plan).
   */
  describe('la barra de la celda elegida', () => {
    const TRES: GrillaDeCancha[] = [
      {
        cancha: { ...DIA[0].cancha, id: 3, nombre: 'Cancha 3' },
        bloques: DIA[0].bloques.map((b) => ({ ...b, canchaId: 3, montoClp: 14000 })),
      },
      DIA[0],
    ];
    const barra = () => el().querySelector('app-barra-fija') as HTMLElement;
    const chips = () => [...barra().querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    const nombreDelChip = (chip: HTMLInputElement) => enTexto(chip.closest('label')!);
    const elegirLaDeLas8 = async () => {
      filaDe('08:00').querySelector('button')!.click();
      await fixture.whenStable();
      fixture.detectChanges();
    };

    it('**ofrece las canchas libres de la celda como chips, con la primera marcada**', async () => {
      await montar(TRES);
      await elegirLaDeLas8();

      expect(chips().map(nombreDelChip)).toEqual(['Cancha 3', 'Cancha 1']);
      expect(chips()[0].checked).toBe(true);
    });

    it('**cambiar de cancha en la barra cambia la cancha y el precio que se paga**', async () => {
      // "desde $12.000" en la celda: la 3 cuesta $14.000 y la 1, $12.000. Lo que se paga
      // es lo de la cancha marcada, y la barra lo dice antes de "Reservar".
      await montar(TRES);
      await elegirLaDeLas8();
      expect(enTexto(barra())).toContain('$14.000');

      chips()[1].click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(enTexto(barra())).toContain('Cancha 1');
      expect(enTexto(barra())).toContain('$12.000');
      expect(enTexto(barra())).not.toContain('$14.000');
    });

    it('lo que se reserva es la cancha que quedó marcada', async () => {
      HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
        this.open = true;
      });
      await montar(TRES);
      await elegirLaDeLas8();
      chips()[1].click();
      await fixture.whenStable();
      fixture.detectChanges();

      [...barra().querySelectorAll('button')]
        .find((boton) => boton.textContent?.trim() === 'Reservar')!
        .click();
      await fixture.whenStable();
      fixture.detectChanges();

      const formulario = fixture.debugElement.query((nodo) => nodo.name === 'app-reservar');
      expect(formulario.componentInstance.cancha().nombre).toBe('Cancha 1');
    });

    it('con una sola cancha libre no hay chips: la barra la nombra y basta', async () => {
      await elegirLaDeLas8();

      expect(chips()).toHaveLength(0);
      expect(enTexto(barra())).toContain('Cancha 1');
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

  it('**muestra el precio en la celda, antes de hacer clic**', () => {
    // Lo que el club pidió para la opción C (T103): el precio a la vista en cada celda,
    // no en un encabezado que hay que ir a buscar.
    expect(enTexto(celdas()[0])).toContain('$12.000');
    expect(enTexto(celdas()[1])).toContain('$20.000');
  });

  it('al visitante, cada celda le dice el arriendo, y lo del socio una vez arriba', () => {
    // Un monto suelto no dice a quién le toca: el visitante no sabía si ese precio era el
    // suyo. "sin costo" y no "$0" desde el rediseño (plan § 5.1): un cero con signo de
    // pesos se lee como un precio que alguien todavía no calculó.
    const arriba = el().querySelector('[data-tarifas]');

    expect(enTexto(arriba!)).toContain('Arriendo de 1 hora por cancha');
    expect(enTexto(arriba!)).toContain('socio sin costo');
    expect(enTexto(el().querySelector('table')!)).not.toContain('sin costo');
  });

  it('**al socio, "sin costo" una vez arriba y en cada celda cuántas libres** (A8)', async () => {
    // El socio no paga la hora: un precio en cada celda le diría ocho veces algo que no es
    // para él, y le escondería lo único que busca, que es dónde queda lugar.
    await montar(DIA, {}, { socioId: 7 });

    expect(enTexto(el().querySelector('[data-tarifas]')!)).toContain('Socio sin costo');
    expect(enTexto(el().querySelector('table')!)).not.toContain('$');
    expect(enTexto(celdas()[0])).toContain('1 libre');
  });

  it('la etiqueta de la celda dice el tipo, la hora, cuántas libres y el precio', () => {
    // La etiqueta es lo único que oye quien no ve la tabla: si no dice el tipo, "08:00,
    // $12.000" no le cuenta de qué columna es.
    expect(etiquetas()[0]).toBe(
      'Elegir cancha al aire libre de 08:00 a 09:00, 1 libre, arriendo $12.000',
    );
  });

  it('al socio la etiqueta le dice "socio sin costo", sin un arriendo que no paga', async () => {
    await montar(DIA, {}, { socioId: 7 });

    expect(etiquetas()[0]).toContain('socio sin costo');
    expect(etiquetas()[0]).not.toContain('arriendo');
  });

  it('la etiqueta también avisa que es hora pico', () => {
    // El `aria-label` reemplaza al contenido del botón, así que lo que no esté acá
    // no existe para quien usa lector de pantalla. Y la hora pico no es decoración:
    // le gasta al socio un cupo semanal del que solo tiene dos.
    //
    // De los tres bloques del fixture solo son botón los dos que se pueden tomar: el de
    // las 08:00 y el de las 18:00, que es el de hora pico.
    expect(etiquetas()[1]).toContain('hora pico');
    expect(etiquetas()[0]).not.toContain('hora pico');
  });

  it('solo es botón la celda que tiene canchas libres, y se ve clickeable', () => {
    // Lo que no se puede tomar dice por qué con palabras, y no es un botón que no hace
    // nada: la celda de las 10:00, en mantención, no se aprieta.
    expect(celdas()).toHaveLength(2);
    for (const celda of celdas()) {
      expect(celda.classList.contains('cursor-pointer')).toBe(true);
      // 44px de alto: el mínimo táctil del master.
      expect(celda.classList.contains('min-h-11')).toBe(true);
    }
    expect(filaDe('10:00').querySelector('button')).toBeNull();
  });

  /**
   * T103. La opción C: una columna por tipo de cancha que el club tenga (A8), para comparar
   * techada con abierta de un vistazo.
   */
  describe('una columna por tipo de cancha', () => {
    const TECHADA = {
      id: 2,
      nombre: 'Cancha techada',
      superficie: 'CEMENTO' as const,
      techada: true,
      iluminacion: true,
    };
    const DOS_TIPOS: GrillaDeCancha[] = [
      DIA[0],
      {
        cancha: TECHADA,
        bloques: DIA[0].bloques.map((b) => ({
          ...b,
          canchaId: 2,
          montoClp: b.montoClp === null ? null : b.montoClp + 3000,
        })),
      },
    ];

    it('si todas las canchas son al aire libre, la tabla tiene una sola columna', () => {
      expect(columnas()).toEqual(['Al aire libre']);
    });

    it('**con techadas, una columna para cada tipo, las abiertas primero**', async () => {
      await montar(DOS_TIPOS);

      expect(columnas()).toEqual(['Al aire libre', 'Techada']);
    });

    it('cada celda dice el precio de su tipo: la techada puede costar distinto (T98)', async () => {
      await montar(DOS_TIPOS);

      const ocho = [...filaDe('08:00').querySelectorAll('td')].map(enTexto);
      expect(ocho[0]).toContain('$12.000');
      expect(ocho[1]).toContain('$15.000');
    });

    it('si las canchas de un tipo cuestan distinto, la celda dice "desde"', async () => {
      await montar([
        DIA[0],
        {
          cancha: { ...DIA[0].cancha, id: 3, nombre: 'Cancha 3' },
          bloques: DIA[0].bloques.map((b) => ({ ...b, canchaId: 3, montoClp: 14000 })),
        },
      ]);

      expect(enTexto(celdas()[0])).toContain('desde $12.000');
      expect(enTexto(celdas()[0])).toContain('2 libres');
    });

    it('**elegir la celda marca la primera cancha libre de ese tipo, en el orden del club** (A8)', async () => {
      // El orden del club es el de la lista que manda la API, no el del id ni el del nombre.
      await montar([
        {
          cancha: { ...DIA[0].cancha, id: 3, nombre: 'Cancha 3' },
          bloques: DIA[0].bloques.map((b) => ({ ...b, canchaId: 3 })),
        },
        DOS_TIPOS[1],
        DIA[0],
      ]);

      filaDe('08:00').querySelectorAll('button')[0].click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(enTexto(el().querySelector('app-barra-fija')!)).toContain('Cancha 3');
    });

    it('la celda elegida se marca, también para el lector de pantalla', async () => {
      await montar(DOS_TIPOS);
      const [abierta, techada] = filaDe('08:00').querySelectorAll('button');

      techada.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(techada.getAttribute('aria-pressed')).toBe('true');
      expect(abierta.getAttribute('aria-pressed')).toBe('false');
    });

    it('la tabla dice qué es cada columna y cada fila', async () => {
      // `th` con `scope`: el lector de pantalla anuncia "Techada, 08:00" al entrar a la
      // celda, en vez de un monto suelto.
      await montar(DOS_TIPOS);

      expect(el().querySelectorAll('thead th[scope="col"]')).toHaveLength(3);
      expect(filaDe('08:00').querySelector('th[scope="row"]')).not.toBeNull();
    });
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
      const grupo = el().querySelector('details');

      expect(grupo?.open).toBe(false);
      expect(enTexto(grupo!.querySelector('summary')!)).toContain(
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
          // 17:00 en valle y 17:30 ya en la franja pico, que empieza a las 17:30.
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

    it('**"socio sin costo" se dice una vez, arriba de la tabla** (reemplaza al precio común de la banda)', () => {
      expect(texto().match(/socio sin costo/gi)).toHaveLength(1);
    });

    it('**la fila de pico lo dice en su encabezado, y la de valle no** (reemplaza al pico de la banda)', () => {
      expect(enTexto(filaDe('17:00'))).toContain('$12.000');
      expect(enTexto(filaDe('17:00').querySelector('th')!)).not.toContain('pico');
      expect(enTexto(filaDe('17:30'))).toContain('$20.000');
      expect(enTexto(filaDe('17:30').querySelector('th')!)).toContain('pico');
    });

    it('con canchas libres, la mantención de otra no ocupa la celda (reemplaza a la mantención de la banda)', async () => {
      // La decisión del club del 2026-10-03 era no repetir "2 en mantención" fila por fila.
      // En la tabla va más lejos: si hay libres, lo que importa es cuántas, no por qué las
      // otras no están.
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

      expect(enTexto(filaDe('08:00'))).toContain('1 libre');
      expect(enTexto(filaDe('08:00'))).not.toContain('mantención');
    });

    it('si toda la columna está en mantención, la celda lo dice (reemplaza a la mantención por fila)', async () => {
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

      expect(enTexto(filaDe('08:00').querySelector('td')!)).toBe('En mantención');
    });

    it('una celda sin libres porque está todo tomado dice "Sin libres"', async () => {
      await montar([
        { cancha: CANCHA, bloques: [bloque('2026-08-17T12:00:00.000Z', '2026-08-17T13:00:00.000Z', { reservado: true })] },
      ]);

      expect(enTexto(filaDe('08:00').querySelector('td')!)).toBe('Sin libres');
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

        const celda = filaDe('08:00').querySelector('td')!;
        expect(enTexto(celda)).toContain('1 en clase');
        expect(enTexto(celda)).not.toContain('mantención');
        // El destino declarado y no el href: el Router de este spec es un doble con solo
        // `navigate`, y con él RouterLink no arma la URL. El href se vio en el navegador.
        // Fuera del botón de la celda: un enlace dentro de un botón no se puede apretar.
        const enlace = celda.querySelector('a');
        expect(enlace?.getAttribute('routerlink')).toBe('/clases');
        expect(enlace?.closest('button')).toBeNull();
      });

      it('una celda llena por una clase dice "Sin libres" y enlaza igual', async () => {
        await montar([
          {
            cancha: CANCHA,
            bloques: [
              bloque('2026-08-17T12:00:00.000Z', '2026-08-17T13:00:00.000Z', {
                bloqueado: true,
                motivoBloqueo: 'CLASE',
              }),
            ],
          },
        ]);

        const celda = filaDe('08:00').querySelector('td')!;
        expect(enTexto(celda)).toContain('Sin libres');
        expect(celda.querySelector('a')?.getAttribute('routerlink')).toBe('/clases');
      });

      it('un partido de torneo se dice torneo', async () => {
        await conCancha2({ bloqueado: true, motivoBloqueo: 'TORNEO' });

        expect(enTexto(filaDe('08:00'))).toContain('1 en torneo');
        expect(enTexto(filaDe('08:00'))).not.toContain('mantención');
      });

      it('la clase va en su fila: el inicio de y media no la tiene', async () => {
        await conCancha2({ bloqueado: true, motivoBloqueo: 'CLASE' });

        expect(enTexto(filaDe('08:30'))).not.toContain('en clase');
      });

      it('un cierre por otro motivo se dice mantención, ni clase ni torneo', async () => {
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

        expect(enTexto(filaDe('08:00').querySelector('td')!)).toBe('En mantención');
      });
    });

    it('a las 08:10, el inicio de las 08:00 se pliega y el de las 08:30 abre la tabla', async () => {
      // Reemplaza a "la banda queda a la vista y marca el pasado": sin bandas, cada inicio
      // se pliega solo cuando empieza.
      vi.setSystemTime('2026-08-17T12:10:00.000Z');
      await montar(MEDIAS_HORAS);

      expect(inicios()[0]).toBe('08:30');
      expect(enTexto(el().querySelector('details summary')!)).toContain(
        'La hora de las 08:00 ya pasó',
      );
    });
  });

  /**
   * T83b. Se reserva 1 hora o 1 hora y media. La duración vive en la URL —como el modo
   * "mover"— para que recargar o compartir el enlace no la pierda.
   */
  describe('la duración', () => {
    const radio = (valor: string) =>
      (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
        `input[type="radio"][value="${valor}"]`,
      );
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
      expect(radio('60')?.checked).toBe(true);
    });

    it('**con ?duracion=90 pide la grilla de 1 hora y media**', async () => {
      await montar(DIA, { duracion: '90' });

      expect(pedirDia).toHaveBeenCalledWith(expect.any(String), 90);
      expect(radio('90')?.checked).toBe(true);
    });

    it('elegir 1 hora y media la deja en la URL, y volver a 1 hora la saca', () => {
      radio('90')!.click();
      expect(navegar).toHaveBeenLastCalledWith(
        [],
        expect.objectContaining({
          queryParams: { duracion: 90 },
          queryParamsHandling: 'merge',
        }),
      );

      radio('60')!.click();
      expect(navegar).toHaveBeenLastCalledWith(
        [],
        expect.objectContaining({ queryParams: { duracion: null } }),
      );
    });

    it('**al visitante no se le ofrece un inicio sin precio de 1 hora y media**', async () => {
      // Sin `montoClp90` la franja no le vende la hora y media a quien no es socio (T79).
      await montar(SIN_HORA_Y_MEDIA, { duracion: '90' });

      expect(etiquetas()).toEqual([expect.stringContaining('de 08:00 a 09:30')]);
      // Y la celda no dice "sin libres", que sería falso: la cancha está libre.
      expect(enTexto(filaDe('17:00').querySelector('td')!)).toBe(
        'No se arrienda por 1 hora y media',
      );
      expect(enTexto(el().querySelector('table')!)).not.toContain('Sin libres');
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

    it('**al mover, el selector parte en la duración de la reserva y se puede cambiar** (T87)', async () => {
      // "Mis reservas" manda `duracion=90` cuando la reserva es de 1 hora y media.
      await montar(DIA, { mover: '5', duracion: '90' });

      expect(radio('90')?.checked).toBe(true);
      // De la grilla que no cuenta la reserva que se mueve, no de la pública: si no, la
      // hora y media en el mismo lugar sale ocupada por ella misma.
      expect(pedirDiaParaMover).toHaveBeenCalledWith(5, expect.any(String), 90);
      expect(pedirDia).not.toHaveBeenCalled();

      radio('60')!.click();
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
    const fecha = (fixture.nativeElement as HTMLElement).querySelector(
      'input[type="date"]',
    );

    expect(fecha?.classList.contains('cursor-pointer')).toBe(true);
  });

  it('avisa cuál es hora pico, en la fila y en la leyenda', () => {
    expect(enTexto(filaDe('18:00').querySelector('th')!)).toContain('pico');
    expect(enTexto(el().querySelector('app-controles-del-dia')!)).toContain('Hora pico');
  });

  it('dice el estado con palabras, no solo con color', () => {
    // El par verde/rojo es justo el que no distingue quien tiene daltonismo
    // rojo-verde: si el estado solo estuviera en el color, la pantalla mentiría.
    const leyenda = enTexto(el().querySelector('app-controles-del-dia ul')!);
    expect(leyenda).toContain('Libre');
    expect(leyenda).toContain('Sin libres');
    // Y nunca el enum crudo de la base, que se lee como una falla del sistema.
    expect(texto()).not.toContain('MANTENCION');
  });

  it('una celda que no se puede tomar dice por qué con palabras, no con un color', () => {
    // Antes eso se resolvía con un borde punteado sobre la tarjeta; en la tabla, la celda
    // gris dice la razón.
    expect(enTexto(filaDe('10:00').querySelector('td')!)).toBe('En mantención');
  });

  it('no ofrece precio de un bloque que no se puede tomar', () => {
    // Un precio junto a "En mantención" invita a intentar reservarlo.
    expect(enTexto(filaDe('10:00'))).not.toContain('$');
  });

  it('numera las celdas por fila para el stagger, sin pasar del tope', () => {
    // El `--i` es lo que escalona la entrada. El tope vive en el CSS; acá se fija
    // que el índice llegue, porque sin él todos entran a la vez. Va por fila: las celdas
    // de una misma hora entran juntas.
    expect(celdas().map((celda) => celda.getAttribute('style'))).toEqual([
      expect.stringContaining('--i: 0'),
      expect.stringContaining('--i: 2'),
    ]);
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
      const radio = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
        `input[type=radio][value="${valor}"]`,
      )!;

      radio.click();
      await fixture.whenStable();
      fixture.detectChanges();
    };

    it('deja solo las canchas techadas', async () => {
      await montar(DOS_CANCHAS);
      await elegirFiltro('techadas');

      // La tabla no nombra canchas: lo que el filtro deja se ve en las columnas.
      expect(columnas()).toEqual(['Techada']);
    });

    it('"al aire libre" es lo contrario de techada, no un campo aparte', async () => {
      await montar(DOS_CANCHAS);
      await elegirFiltro('aire-libre');

      expect(columnas()).toEqual(['Al aire libre']);
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

      expect(columnas()).toEqual(['Al aire libre']);
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
      const grupo = (fixture.nativeElement as HTMLElement).querySelector('details');

      expect(grupo?.querySelector('summary')?.textContent).toContain('reportar');
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
      // Antes el clic movía al tiro. Con la tabla, el clic elige un tipo de cancha y no una
      // cancha: la barra dice cuál quedó marcada y deja cambiarla antes de mover.
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
      expect(navegar).toHaveBeenCalledWith(['/mis-reservas']);
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

    it('**al mover, la barra preelige la cancha de la reserva si está libre en la celda** (T104)', async () => {
      // Alargar una hora a 1 hora y media tiene que dejarla donde estaba: con la primera
      // libre, el socio terminaba en otra cancha sin haberlo pedido.
      await montar(DOS_ABIERTAS, { mover: '7', cancha: 'Cancha 1' });

      await elegirPrimerBloque();
      await apretar(botonDeLaBarra('Cambiar a esta hora'));

      expect(mover).toHaveBeenCalledWith(7, expect.objectContaining({ canchaId: 1 }));
    });

    it('si su cancha no está libre en esa celda, preelige la primera del club', async () => {
      await montar(DOS_ABIERTAS, { mover: '7', cancha: 'Cancha 9' });

      await elegirPrimerBloque();

      expect(barra().textContent).toContain('Cancha 3');
    });

    it('desde el enlace, la cancha de la reserva la dice la reserva misma', async () => {
      await montar(DOS_ABIERTAS, { moverToken: 'tok-123' }, {
        reservaDelEnlace: { pagadoClp: 16000, cancha: 'Cancha 1' },
      });

      await elegirPrimerBloque();

      expect(barra().textContent).toContain('Cancha 1');
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
      // jsdom no implementa el diálogo nativo que abre `app-reservar`. Se apuntala
      // acá y no con un guardia en el componente, por lo mismo que en `reservar.spec`:
      // el que está roto es el entorno de prueba, no el código.
      HTMLDialogElement.prototype.showModal = vi.fn(function (
        this: HTMLDialogElement,
      ) {
        this.open = true;
      });

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
      HTMLDialogElement.prototype.showModal = vi.fn(function (
        this: HTMLDialogElement,
      ) {
        this.open = true;
      });

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

      (fixture.nativeElement as HTMLElement)
        .querySelector<HTMLInputElement>('input[type="radio"][value="90"]')!
        .click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('app-barra-fija')).toBeNull();
    });

    it('**cambiar de día suelta lo elegido: la barra no dice la fecha** (revisión de T104)', async () => {
      // Con la celda de hoy marcada y la tabla de mañana a la vista, "Reservar" tomaba la
      // hora de hoy sin que nada en pantalla lo dijera.
      await elegirPrimerBloque();

      el()
        .querySelector<HTMLInputElement>('app-controles-del-dia input[type="radio"]:not(:checked)')!
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
