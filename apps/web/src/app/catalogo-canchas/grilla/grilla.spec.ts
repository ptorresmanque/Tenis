import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Reservas } from '../../reservas/reservas.service';
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

  /** `mover` es el id que llega por query string cuando se viene de "mis reservas". */
  const montar = async (dia: GrillaDeCancha[], parametros: Record<string, string> = {}) => {
    mover = vi.fn().mockResolvedValue({});
    navegar = vi.fn().mockResolvedValue(true);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Disponibilidad, useValue: { delDia: () => Promise.resolve(dia) } },
        { provide: Reservas, useValue: { mover } },
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
    await montar(DIA);
  });

  it('muestra la hora de cada bloque en la hora del club', () => {
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
    const libre = bloques()[0].textContent ?? '';

    expect(libre).toContain('Socio');
    expect(libre).toContain('$0');
    expect(libre).toContain('Arriendo');
    expect(libre).toContain('$12.000');
  });

  it('dice las dos tarifas también a quien navega por teclado', () => {
    const etiqueta = bloques()[0]
      .querySelector('button')
      ?.getAttribute('aria-label');

    // La etiqueta es lo único que oye quien no ve el bloque: si trae un solo monto,
    // le llega justo la mitad que la tarea vino a arreglar.
    expect(etiqueta).toContain('socio $0');
    expect(etiqueta).toContain('arriendo $12.000');
  });

  it('la etiqueta también avisa que es hora pico', () => {
    // El `aria-label` reemplaza al contenido del botón, así que lo que no esté acá
    // no existe para quien usa lector de pantalla. Y la hora pico no es decoración:
    // le gasta al socio un cupo semanal del que solo tiene dos.
    const etiquetas = bloques().map((b) =>
      b.querySelector('button')?.getAttribute('aria-label'),
    );

    expect(etiquetas[2]).toContain('hora pico');
    expect(etiquetas[0]).not.toContain('hora pico');
  });

  it('el bloque que se puede tomar se ve clickeable; el que no, no', () => {
    // La grilla entera es una cuadrícula de tarjetas iguales y nada anunciaba que
    // fueran botones. El cursor es la señal que el mouse da antes del clic.
    const libre = bloques()[0].querySelector('button');
    const enMantencion = bloques()[1].querySelector('button');

    expect(libre?.classList.contains('cursor-pointer')).toBe(true);
    expect(enMantencion?.classList.contains('cursor-pointer')).toBe(false);
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
    expect(texto()).toContain('Disponible');
    expect(texto()).toContain('En mantención');
    // Y nunca el enum crudo de la base, que se lee como una falla del sistema.
    expect(texto()).not.toContain('MANTENCION');
  });

  it('marca el bloque tomado con una forma distinta, no solo un color', () => {
    const tomado = bloques()[1];

    expect(tomado.classList.contains('border-dashed')).toBe(true);
    expect(bloques()[0].classList.contains('border-dashed')).toBe(false);
  });

  it('no ofrece precio de un bloque que no se puede tomar', () => {
    // Un precio junto a "En mantención" invita a intentar reservarlo.
    expect(bloques()[1].textContent).not.toContain('$');
  });

  it('numera los bloques para el stagger, sin pasar del tope', () => {
    // El `--i` es lo que escalona la entrada. El tope vive en el CSS; acá se fija
    // que el índice llegue, porque sin él todos entran a la vez.
    expect(bloques().map((b) => b.getAttribute('style'))).toEqual([
      expect.stringContaining('--i: 0'),
      expect.stringContaining('--i: 1'),
      expect.stringContaining('--i: 2'),
    ]);
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

    it('sin el parámetro, el clic sigue abriendo el formulario de reserva', async () => {
      // jsdom no implementa el diálogo nativo que abre `app-reservar`. Se apuntala
      // acá y no con un guardia en el componente, por lo mismo que en `reservar.spec`:
      // el que está roto es el entorno de prueba, no el código.
      HTMLDialogElement.prototype.showModal = vi.fn(function (
        this: HTMLDialogElement,
      ) {
        this.open = true;
      });

      await elegirPrimerBloque();

      expect(mover).not.toHaveBeenCalled();
      expect(texto()).toContain('Reservar');
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
      (botones[0] as HTMLButtonElement).click();
      (botones[2] as HTMLButtonElement).click();

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
