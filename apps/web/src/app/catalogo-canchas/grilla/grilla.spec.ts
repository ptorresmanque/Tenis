import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReportesDelSocio } from '../../reservas/reportes.service';
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
  let navegar: ReturnType<typeof vi.fn>;
  let reportables: ReturnType<typeof vi.fn>;
  let reportar: ReturnType<typeof vi.fn>;

  /** `mover` es el id que llega por query string cuando se viene de "mis reservas". */
  const montar = async (
    dia: GrillaDeCancha[],
    parametros: Record<string, string> = {},
    opciones: {
      socioId?: number | null;
      reportables?: {
        reservaId: number;
        canchaId: number;
        inicio: string;
        yaReportada: boolean;
      }[];
    } = {},
  ) => {
    mover = vi.fn().mockResolvedValue({});
    navegar = vi.fn().mockResolvedValue(true);
    reportables = vi.fn().mockResolvedValue(opciones.reportables ?? []);
    // El mensaje textual del servidor: la pantalla no inventa uno propio, así que
    // un doble con otro texto probaría algo que no existe.
    reportar = vi.fn().mockResolvedValue({
      mensaje:
        'Gracias. Tu reporte es anónimo y lo revisa la administración del club.',
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Disponibilidad, useValue: { delDia: () => Promise.resolve(dia) } },
        { provide: Reservas, useValue: { mover } },
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

  const texto = () => fixture.nativeElement.textContent as string;
  const bloques = () =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.bloque'),
    );

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

  it('muestra la hora de cada franja en la hora del club', () => {
    // 12:00Z en agosto son las 08:00 en Santiago. Con la hora del navegador o un
    // desfase fijo, el socio vería una hora que no es a la que juega.
    expect(texto()).toContain('08:00–09:00');
  });

  it('muestra el precio en el bloque, antes de hacer clic', () => {
    expect(texto()).toContain('$12.000');
    expect(texto()).toContain('$20.000');
  });

  it('separa lo que paga el socio de lo que paga quien arrienda', () => {
    // Un monto suelto no dice a quién le toca. El socio leía "$12.000" en una hora
    // que para él es gratis, y el visitante no sabía si ese precio era el suyo.
    //
    // "sin costo" y no "$0" desde el rediseño (plan § 5.1): un cero con signo de
    // pesos se lee como un precio que alguien todavía no calculó.
    //
    // Desde que la grilla se agrupa por hora, las dos tarifas viven en el
    // encabezado de la franja y no en cada chip: el precio es de la hora, no de
    // la cancha, y repetirlo en cada una de las ocho era decir ocho veces lo
    // mismo. Lo que este test protege sigue siendo lo mismo: que las dos se vean
    // antes de hacer clic.
    const franja = (fixture.nativeElement as HTMLElement).querySelector('section');
    const texto = franja?.textContent ?? '';

    expect(texto).toContain('Socio');
    expect(texto).toContain('sin costo');
    expect(texto).toContain('Arriendo');
    expect(texto).toContain('$12.000');
  });

  it('dice las dos tarifas también a quien navega por teclado', () => {
    const etiqueta = bloques()[0]
      .querySelector('button')
      ?.getAttribute('aria-label');

    // La etiqueta es lo único que oye quien no ve el bloque: si trae un solo monto,
    // le llega justo la mitad que la tarea vino a arreglar.
    expect(etiqueta).toContain('socio sin costo');
    expect(etiqueta).toContain('arriendo $12.000');
  });

  it('la etiqueta también avisa que es hora pico', () => {
    // El `aria-label` reemplaza al contenido del botón, así que lo que no esté acá
    // no existe para quien usa lector de pantalla. Y la hora pico no es decoración:
    // le gasta al socio un cupo semanal del que solo tiene dos.
    //
    // Los chips son ahora uno por cancha libre, así que de los tres bloques del
    // fixture solo llegan los dos que se pueden tomar: el de las 08:00 y el de
    // las 10:00, que es el de hora pico.
    const etiquetas = bloques().map((b) =>
      b.querySelector('button')?.getAttribute('aria-label'),
    );

    expect(etiquetas[1]).toContain('hora pico');
    expect(etiquetas[0]).not.toContain('hora pico');
  });

  it('solo se lista lo que se puede tomar, y se ve clickeable', () => {
    // Antes la grilla pintaba también lo ocupado y lo bloqueado como tarjetas, y
    // el test comprobaba que esas no tuvieran cursor. Agrupada por hora, lo que
    // no se puede tomar dejó de ser un elemento y pasó a ser una cuenta, así que
    // el caso negativo desapareció por construcción: **lo único que se lista es
    // lo que se puede apretar.**
    const chips = bloques();

    expect(chips.length).toBe(2);
    for (const chip of chips) {
      expect(chip.querySelector('button')?.classList.contains('cursor-pointer')).toBe(true);
    }
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
      const etiquetas = bloques().map((b) =>
        b.querySelector('button')?.getAttribute('aria-label'),
      );

      expect(etiquetas).toEqual([expect.stringContaining('de 18:00 a 19:00')]);
    });

    it('dice que esa hora ya pasó, en vez de que no quedan canchas', () => {
      // "Sin canchas libres" en cada hora de la mañana se lee como un club lleno.
      expect(texto()).toContain('Ya pasó');
    });

    // Decisión 9 del plan (TV5.1): a las 18:00 la grilla abría con diez filas
    // "Ya pasó" antes de la primera hora tomable. Se pliegan, sin quitarlas.
    it('las horas que ya pasaron se pliegan en un grupo que dice cuántas son', () => {
      const el = fixture.nativeElement as HTMLElement;
      const grupo = el.querySelector('details');

      expect(grupo?.open).toBe(false);
      expect(grupo?.querySelector('summary')?.textContent).toContain('2 horas que ya pasaron');
      expect(grupo?.textContent).toContain('Ya pasó');
    });

    it('la primera franja a la vista es una que todavía se puede tomar', () => {
      const el = fixture.nativeElement as HTMLElement;
      const primeraAfuera = [...el.querySelectorAll('section')].find(
        (seccion) => !seccion.closest('details'),
      );

      expect(primeraAfuera?.querySelector('.bloque button')).not.toBeNull();
    });

    it('el resumen tampoco la cuenta', () => {
      const resumen = (fixture.nativeElement as HTMLElement).querySelector(
        '[role="status"] .sr-only',
      );

      expect(resumen?.textContent).toBe('1 hora disponible en 1 cancha.');
    });
  });

  it('el selector de día también se anuncia como clickeable', () => {
    const fecha = (fixture.nativeElement as HTMLElement).querySelector(
      'input[type="date"]',
    );

    expect(fecha?.classList.contains('cursor-pointer')).toBe(true);
  });

  it('avisa cuál es hora pico', () => {
    expect(texto()).toContain('Hora pico');
  });

  it('dice el estado con palabras, no solo con color', () => {
    // El par verde/rojo es justo el que no distingue quien tiene daltonismo
    // rojo-verde: si el estado solo estuviera en el color, la pantalla mentiría.
    expect(texto()).toContain('Libre');
    expect(texto()).toContain('En mantención');
    // Y nunca el enum crudo de la base, que se lee como una falla del sistema.
    expect(texto()).not.toContain('MANTENCION');
  });

  it('lo que no se puede tomar se cuenta con palabras, no con un color', () => {
    // El par verde/rojo es justo el que no distingue quien tiene daltonismo
    // rojo-verde. Antes eso se resolvía con un borde punteado sobre la tarjeta;
    // ahora que lo ocupado es una cuenta, se resuelve con la palabra y su ícono.
    expect(texto()).toContain('en mantención');
  });

  it('no ofrece precio de un bloque que no se puede tomar', () => {
    // Un precio junto a "En mantención" invita a intentar reservarlo.
    expect(bloques()[1].textContent).not.toContain('$');
  });

  it('numera los bloques para el stagger, sin pasar del tope', () => {
    // El `--i` es lo que escalona la entrada. El tope vive en el CSS; acá se fija
    // que el índice llegue, porque sin él todos entran a la vez.
    // Uno por chip libre dentro de su franja, que es la unidad que entra junta.
    expect(bloques().map((b) => b.getAttribute('style'))).toEqual([
      expect.stringContaining('--i: 0'),
      expect.stringContaining('--i: 0'),
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

      expect(texto()).toContain('Cancha techada');
      expect(texto()).not.toContain('Cancha 1');
    });

    it('"al aire libre" es lo contrario de techada, no un campo aparte', async () => {
      await montar(DOS_CANCHAS);
      await elegirFiltro('aire-libre');

      expect(texto()).toContain('Cancha 1');
      expect(texto()).not.toContain('Cancha techada');
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

      expect(texto()).toContain('Cancha 1');
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
      (
        (fixture.nativeElement as HTMLElement).querySelector(
          '.bloque button',
        ) as HTMLButtonElement
      ).click();
      await fixture.whenStable();
      fixture.detectChanges();
    };

    it('avisa que se está cambiando una hora ya reservada', async () => {
      await montar(DIA, { mover: '7' });

      expect(texto()).toContain('Elige la nueva hora');
    });

    it('al elegir un bloque libre mueve la reserva y vuelve a mis reservas', async () => {
      await montar(DIA, { mover: '7' });

      await elegirPrimerBloque();

      expect(mover).toHaveBeenCalledWith(7, {
        canchaId: 1,
        inicio: '2026-08-17T12:00:00.000Z',
      });
      expect(navegar).toHaveBeenCalledWith(['/mis-reservas']);
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

      const botones = (fixture.nativeElement as HTMLElement).querySelectorAll(
        '.bloque button',
      );
      // Los dos chips libres del día: agrupada por hora, la grilla solo lista
      // lo que se puede tomar, así que el segundo clic va al índice 1.
      (botones[0] as HTMLButtonElement).click();
      (botones[1] as HTMLButtonElement).click();

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

      expect(texto()).toContain('acaban de tomar');
      expect(navegar).not.toHaveBeenCalled();
    });
  });
});
