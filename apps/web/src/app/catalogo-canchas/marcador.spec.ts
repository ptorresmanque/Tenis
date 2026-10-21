import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { BloqueDisponible, Cancha, GrillaDeCancha } from './disponibilidad';
import { Marcador } from './marcador';
import { enPesos, fechaEnElClub, horaEnElClub } from './reloj-del-club';

/**
 * El marcador de la portada: las horas que quedan hoy contra las canchas (TV3.3).
 *
 * Lo que cuidan estos tests es que el tablero no mienta ni se lea solo por color:
 * cada celda dice su estado en palabras, la libre lleva a reservar y la ocupada no
 * se puede tocar. Que con muchas canchas el desplazamiento quede adentro se mide
 * en el navegador, no acá.
 */
describe('Marcador', () => {
  const UNA_HORA = 60 * 60 * 1000;
  const enHoras = (horas: number) => {
    const fecha = new Date(Date.now() + horas * UNA_HORA);
    fecha.setMinutes(0, 0, 0);
    return fecha;
  };

  const cancha = (id: number, techada = false): Cancha =>
    ({
      id,
      nombre: `Cancha ${id}`,
      superficie: 'CEMENTO',
      techada,
      iluminacion: true,
    }) as Cancha;

  const bloque = (canchaId: number, inicio: Date, cambios: Partial<BloqueDisponible> = {}) => ({
    inicio: inicio.toISOString(),
    fin: new Date(inicio.getTime() + UNA_HORA).toISOString(),
    canchaId,
    montoClp: 12_000,
    esPico: false,
    bloqueado: false,
    motivoBloqueo: null,
    reservado: false,
    ...cambios,
  });

  @Component({
    imports: [Marcador],
    template: `<app-marcador [grillas]="grillas()" />`,
  })
  class Host {
    readonly grillas = signal<GrillaDeCancha[]>([]);
  }

  function montar(grillas: GrillaDeCancha[]) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.grillas.set(grillas);
    fixture.detectChanges();

    return fixture.nativeElement as HTMLElement;
  }

  /** La celda de una cancha (1, 2, …) en una fila (0, 1, …), sin contar la hora. */
  const celda = (el: HTMLElement, fila: number, columna: number) =>
    el.querySelectorAll('tbody tr')[fila].querySelectorAll('td')[columna - 1] as HTMLElement;

  it('una columna por cancha, en el orden del catálogo', () => {
    const dosHoras = enHoras(2);
    const el = montar([
      { cancha: cancha(3), bloques: [bloque(3, dosHoras)] },
      { cancha: cancha(1), bloques: [bloque(1, dosHoras)] },
      { cancha: cancha(2), bloques: [bloque(2, dosHoras)] },
    ]);

    const columnas = [...el.querySelectorAll('thead th[scope="col"]')].map((th) =>
      th.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(columnas.slice(1)).toEqual(['Cancha 3', 'Cancha 1', 'Cancha 2']);
  });

  it('las filas son las horas que quedan hoy: la que ya empezó no está', () => {
    const yaEmpezo = enHoras(-1);
    const enDos = enHoras(2);
    const enTres = enHoras(3);
    const el = montar([
      {
        cancha: cancha(1),
        bloques: [bloque(1, yaEmpezo), bloque(1, enTres), bloque(1, enDos)],
      },
    ]);

    const horas = [...el.querySelectorAll('tbody th[scope="row"]')].map((th) => th.textContent);
    expect(horas.length).toBe(2);
    expect(horas[0]).toContain(horaEnElClub(enDos.toISOString()));
    expect(horas[1]).toContain(horaEnElClub(enTres.toISOString()));
  });

  it('la celda libre lleva a esa cancha y esa hora en la disponibilidad (T266)', () => {
    const enDos = enHoras(2);
    const el = montar([{ cancha: cancha(1), bloques: [bloque(1, enDos)] }]);
    const enlace = celda(el, 0, 1).querySelector('a');
    const hora = horaEnElClub(enDos.toISOString());

    // La disponibilidad la marca al llegar: el día, la cancha y la hora de la celda.
    expect(enlace?.getAttribute('href')).toBe(
      `/disponibilidad?fecha=${fechaEnElClub(enDos)}&cancha=1&inicio=${hora}`,
    );
    // El nombre entero va en aria-label y empieza con lo que se ve (WCAG 2.5.3).
    // Con un sr-only, Chrome ponía un espacio antes de los dos puntos.
    expect(enlace?.textContent?.trim()).toBe('Libre');
    expect(enlace?.getAttribute('aria-label')).toBe(
      `Libre: reservar la Cancha 1 a las ${horaEnElClub(enDos.toISOString())}`,
    );
  });

  it('las celdas libres no suman paradas de teclado', () => {
    // Con 8 canchas y 6 horas serían 48 Tab hacia la misma página, que ya tiene
    // camino en "Ver todos los horarios" y en el zócalo. El lector igual las activa.
    const el = montar([
      { cancha: cancha(1), bloques: [bloque(1, enHoras(2)), bloque(1, enHoras(3))] },
      { cancha: cancha(2), bloques: [bloque(2, enHoras(2))] },
    ]);
    const enlaces = [...el.querySelectorAll('td a')];

    expect(enlaces.length).toBe(3);
    expect(enlaces.every((enlace) => enlace.getAttribute('tabindex') === '-1')).toBe(true);
  });

  it('la ocupada no se puede tocar y dice su estado en palabras', () => {
    const el = montar([
      { cancha: cancha(1), bloques: [bloque(1, enHoras(2), { reservado: true })] },
    ]);

    expect(celda(el, 0, 1).querySelector('a, button')).toBeNull();
    expect(celda(el, 0, 1).textContent).toContain('Ocupada');
  });

  it('la bloqueada dice su motivo en palabras, nunca el código de la base', () => {
    const el = montar([
      {
        cancha: cancha(1),
        bloques: [bloque(1, enHoras(2), { bloqueado: true, motivoBloqueo: 'MANTENCION' })],
      },
    ]);

    expect(celda(el, 0, 1).querySelector('a, button')).toBeNull();
    expect(celda(el, 0, 1).textContent).toContain('En mantención');
    expect(celda(el, 0, 1).textContent).not.toContain('MANTENCION');
  });

  it('una cancha sin bloque a esa hora está cerrada', () => {
    const enDos = enHoras(2);
    const el = montar([
      { cancha: cancha(1), bloques: [bloque(1, enDos)] },
      { cancha: cancha(2), bloques: [] },
    ]);

    expect(celda(el, 0, 2).querySelector('a, button')).toBeNull();
    expect(celda(el, 0, 2).textContent).toContain('Cerrada');
  });

  it('la hora prime lleva su rótulo', () => {
    const el = montar([
      {
        cancha: cancha(1),
        bloques: [bloque(1, enHoras(2)), bloque(1, enHoras(3), { esPico: true })],
      },
    ]);
    const filas = el.querySelectorAll('tbody th[scope="row"]');

    expect(filas[0].textContent).not.toContain('Prime');
    expect(filas[1].textContent).toContain('Prime');
  });

  it('**el arriendo de la hora prime sale de una cancha que se puede tomar**', () => {
    // La API manda en 0 el monto de una hora reservada o bloqueada. Si la primera cancha
    // la tenía tomada, la leyenda decía "arriendo $0".
    const el = montar([
      {
        cancha: cancha(1),
        bloques: [bloque(1, enHoras(2), { esPico: true, reservado: true, montoClp: 0 })],
      },
      {
        cancha: cancha(2),
        bloques: [bloque(2, enHoras(2), { esPico: true, bloqueado: true, montoClp: 0 })],
      },
      { cancha: cancha(3), bloques: [bloque(3, enHoras(2), { esPico: true, montoClp: 16_000 })] },
    ]);

    expect(el.textContent).toContain(`arriendo ${enPesos(16_000)}`);
    expect(el.textContent).not.toContain(enPesos(0));
  });

  it('la cancha techada lo dice, también al lector de pantalla', () => {
    const el = montar([{ cancha: cancha(5, true), bloques: [bloque(5, enHoras(2))] }]);
    const encabezado = el.querySelectorAll('thead th[scope="col"]')[1];

    expect(encabezado.textContent).toContain('techada');
  });

  /**
   * En disponibilidad (T264): el mismo tablero, pero la celda libre se elige en la página en
   * vez de llevar a otra. Lo que cuidan estos tests es que elegir se pueda con teclado sin
   * recorrer cien paradas, que la celda que no se le vende a quien mira diga por qué y que la
   * clase lleve a las clases.
   */
  describe('en modo elegir', () => {
    type Elegida = { canchaId: number; inicio: string; fin: string } | null;

    @Component({
      imports: [Marcador],
      template: `
        <app-marcador
          modo="elegir"
          [grillas]="grillas()"
          [elegida]="elegida()"
          [sinVenta]="sinVenta"
          [etiqueta]="etiqueta"
          (elegir)="elegidas.push($event)"
        />
      `,
    })
    class HostQueElige {
      readonly grillas = signal<GrillaDeCancha[]>([]);
      readonly elegida = signal<Elegida>(null);
      readonly elegidas: { cancha: Cancha; bloque: BloqueDisponible }[] = [];
      sinVenta = (bloque: BloqueDisponible): string | null =>
        bloque.montoClp === null ? 'No se arrienda por 1 hora y media' : null;
      etiqueta = (cancha: Cancha, bloque: BloqueDisponible) =>
        `Elegir la ${cancha.nombre} a las ${horaEnElClub(bloque.inicio)}`;
    }

    function montarQueElige(grillas: GrillaDeCancha[], elegida: Elegida = null) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideRouter([])] });
      const fixture = TestBed.createComponent(HostQueElige);
      fixture.componentInstance.grillas.set(grillas);
      fixture.componentInstance.elegida.set(elegida);
      fixture.detectChanges();

      return { fixture, el: fixture.nativeElement as HTMLElement };
    }

    const botones = (el: HTMLElement) =>
      [...el.querySelectorAll<HTMLButtonElement>('tbody button')];

    it('la celda libre es un botón con el nombre que le da la grilla, y elegirla avisa cuál', () => {
      const enDos = enHoras(2);
      const { fixture, el } = montarQueElige([
        { cancha: cancha(1), bloques: [bloque(1, enDos)] },
      ]);

      const [boton] = botones(el);
      expect(el.querySelector('tbody a')).toBeNull();
      expect(boton.getAttribute('aria-label')).toBe(
        `Elegir la Cancha 1 a las ${horaEnElClub(enDos.toISOString())}`,
      );

      boton.click();

      const [elegida] = fixture.componentInstance.elegidas;
      expect(elegida.cancha.id).toBe(1);
      expect(elegida.bloque.inicio).toBe(enDos.toISOString());
    });

    it('la elegida queda marcada, también para el lector, y las otras no', () => {
      const enDos = enHoras(2);
      const { el } = montarQueElige(
        [
          { cancha: cancha(1), bloques: [bloque(1, enDos)] },
          { cancha: cancha(2), bloques: [bloque(2, enDos)] },
        ],
        { canchaId: 2, inicio: enDos.toISOString(), fin: enHoras(3).toISOString() },
      );

      expect(botones(el).map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
      // Sigue diciendo «Libre», que es su nombre (WCAG 2.5.3); la marca es el ✓ y la placa.
      expect(celda(el, 0, 2).textContent).toContain('check_circle');
    });

    it('el tablero es una sola parada de teclado: la elegida, o la primera libre', () => {
      const enDos = enHoras(2);
      const enTres = enHoras(3);
      const grillas = [
        { cancha: cancha(1), bloques: [bloque(1, enDos), bloque(1, enTres)] },
        { cancha: cancha(2), bloques: [bloque(2, enDos), bloque(2, enTres)] },
      ];

      const sinElegir = montarQueElige(grillas).el;
      expect(botones(sinElegir).map((b) => b.tabIndex)).toEqual([0, -1, -1, -1]);

      const conElegida = montarQueElige(grillas, {
        canchaId: 2,
        inicio: enTres.toISOString(),
        fin: new Date(enTres.getTime() + UNA_HORA).toISOString(),
      }).el;
      expect(botones(conElegida).map((b) => b.tabIndex)).toEqual([-1, -1, -1, 0]);
    });

    it('las flechas recorren las libres y se saltan las que no se pueden tomar', () => {
      const enDos = enHoras(2);
      const enTres = enHoras(3);
      const { fixture, el } = montarQueElige([
        { cancha: cancha(1), bloques: [bloque(1, enDos), bloque(1, enTres)] },
        { cancha: cancha(2), bloques: [bloque(2, enDos, { reservado: true }), bloque(2, enTres)] },
        { cancha: cancha(3), bloques: [bloque(3, enDos), bloque(3, enTres)] },
      ]);
      const pulsar = (tecla: string) => {
        (document.activeElement as HTMLElement).dispatchEvent(
          new KeyboardEvent('keydown', { key: tecla, bubbles: true }),
        );
        fixture.detectChanges();
      };
      const enFoco = () => document.activeElement?.closest('td');

      celda(el, 0, 1).querySelector('button')!.focus();

      // La Cancha 2 está tomada a la primera hora: la flecha pasa a la 3.
      pulsar('ArrowRight');
      expect(enFoco()).toBe(celda(el, 0, 3));

      pulsar('ArrowDown');
      expect(enFoco()).toBe(celda(el, 1, 3));

      pulsar('ArrowLeft');
      expect(enFoco()).toBe(celda(el, 1, 2));

      // Arriba de la Cancha 2 no hay libre: se queda donde está.
      pulsar('ArrowUp');
      expect(enFoco()).toBe(celda(el, 1, 2));

      // La que tiene el foco es la parada del tablero al volver con Tab.
      expect(celda(el, 1, 2).querySelector('button')!.tabIndex).toBe(0);
    });

    it('la libre que no se le vende a quien mira no se puede tocar y dice por qué', () => {
      const { el } = montarQueElige([
        { cancha: cancha(1), bloques: [bloque(1, enHoras(2), { montoClp: null })] },
      ]);

      expect(celda(el, 0, 1).querySelector('a, button')).toBeNull();
      expect(celda(el, 0, 1).textContent).toContain('No se arrienda por 1 hora y media');
      expect(el.querySelector('ul')?.textContent).toContain('No se arrienda por 1 hora y media');
    });

    it('desde sm, los nombres de las canchas quedan pegados bajo la cabecera del sitio', () => {
      // A la fila veinte nadie se acuerda de cuál columna era cuál. El contenedor deja de
      // desplazarse de lado desde sm, donde el tablero cabe: con overflow, sticky no se pega
      // a la ventana. jsdom no pinta, así que se fija la regla; se vio en el navegador.
      const { el } = montarQueElige([{ cancha: cancha(1), bloques: [bloque(1, enHoras(2))] }]);

      expect(el.querySelector('table')?.parentElement?.className).toContain('sm:overflow-visible');
      for (const th of el.querySelectorAll('thead th')) {
        expect(th.className).toContain('sm:sticky');
        expect(th.className).toContain('sm:top-16');
      }
    });

    it('la libre responde al mouse; la elegida no', () => {
      const enDos = enHoras(2);
      const { el } = montarQueElige(
        [
          { cancha: cancha(1), bloques: [bloque(1, enDos)] },
          { cancha: cancha(2), bloques: [bloque(2, enDos)] },
        ],
        { canchaId: 2, inicio: enDos.toISOString(), fin: enHoras(3).toISOString() },
      );

      const [libre, elegida] = botones(el);
      expect(libre.className).toMatch(/hover:/);
      expect(elegida.className).not.toMatch(/hover:/);
    });

    it('la clase lleva a las clases', () => {
      const { el } = montarQueElige([
        {
          cancha: cancha(1),
          bloques: [bloque(1, enHoras(2), { bloqueado: true, motivoBloqueo: 'CLASE' })],
        },
      ]);

      const enlace = celda(el, 0, 1).querySelector('a');
      expect(enlace?.getAttribute('href')).toBe('/clases');
      expect(enlace?.textContent).toContain('Clase');
    });

    /**
     * T344 (SPEC-sitio.md, Decimoséptima parte, B2): la grilla va en pasos de 30 minutos y
     * cada fila es un inicio, así que una hora ocupa dos filas y la hora y media tres. Marcar
     * solo la de inicio no decía hasta cuándo quedaba tomada la cancha.
     */
    describe('la elección marca toda la hora', () => {
      const MEDIA = 30 * 60 * 1000;
      const inicio = enHoras(2);
      const a = (medias: number) => new Date(inicio.getTime() + medias * MEDIA);
      /** Cuatro inicios seguidos, cada media hora, en dos canchas. */
      const grillas = (cambios: Partial<BloqueDisponible>[] = []) =>
        [1, 2].map((id) => ({
          cancha: cancha(id),
          bloques: [0, 1, 2, 3].map((m) => bloque(id, a(m), id === 1 ? cambios[m] : {})),
        }));
      const marcadas = (el: HTMLElement) =>
        [0, 1, 2, 3].map((fila) => celda(el, fila, 1).querySelector('[data-en-la-eleccion]') !== null);

      it('**con 1 hora se marcan 2 celdas**, en la columna de la cancha', () => {
        const { el } = montarQueElige(grillas(), {
          canchaId: 1,
          inicio: a(0).toISOString(),
          fin: a(2).toISOString(),
        });

        expect(marcadas(el)).toEqual([true, true, false, false]);
        // La otra cancha no se toca.
        expect(celda(el, 1, 2).querySelector('[data-en-la-eleccion]')).toBeNull();
      });

      it('**con hora y media se marcan 3**', () => {
        const { el } = montarQueElige(grillas(), {
          canchaId: 1,
          inicio: a(0).toISOString(),
          fin: a(3).toISOString(),
        });

        expect(marcadas(el)).toEqual([true, true, true, false]);
      });

      it('la que sigue a la primera dice al lector que es parte de la elección, y no es botón', () => {
        const { el } = montarQueElige(grillas(), {
          canchaId: 1,
          inicio: a(0).toISOString(),
          fin: a(2).toISOString(),
        });
        const sigue = celda(el, 1, 1);

        expect(sigue.querySelector('button')).toBeNull();
        expect(sigue.textContent).toContain('Parte de tu elección');
        // La primera sigue siendo el botón marcado, y es la parada del teclado.
        expect(celda(el, 0, 1).querySelector('button')?.getAttribute('aria-pressed')).toBe('true');
        expect(celda(el, 0, 1).querySelector('button')?.tabIndex).toBe(0);
      });

      it('**se marca aunque su inicio figure ocupado**: la hora elegida es de quien la eligió', () => {
        // 19:30 figura ocupada como inicio porque la de 20:00 está tomada; 19:00–20:00 sigue
        // libre, y la fila de 19:30 es parte de ella.
        const { el } = montarQueElige(grillas([{}, { reservado: true }]), {
          canchaId: 1,
          inicio: a(0).toISOString(),
          fin: a(2).toISOString(),
        });

        expect(marcadas(el)).toEqual([true, true, false, false]);
      });
    });
  });
});
