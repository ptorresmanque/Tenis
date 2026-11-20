import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { BloqueDisponible, Cancha, GrillaDeCancha } from './disponibilidad';
import { Marcador, ReservaEnElTablero } from './marcador';
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

  it('**el tablero de la portada se desplaza con el teclado**: es una región con nombre y una parada (T393)', () => {
    // Sus libres van con tabindex="-1": sin una parada en el contenedor, quien usa teclado no
    // llegaba a las canchas que no caben (modern-web-guidance, responsive-table).
    const el = montar([{ cancha: cancha(1), bloques: [bloque(1, enHoras(2))] }]);
    const contenedor = el.querySelector('app-marcador > div')!;

    expect(contenedor.getAttribute('tabindex')).toBe('0');
    expect(contenedor.getAttribute('role')).toBe('region');
    expect(contenedor.getAttribute('aria-label')).toBe('Las horas que quedan, cancha por cancha');
    // Sus celdas son enlaces de una sola parada, no una grilla que se recorre con flechas.
    expect(el.querySelector('table')?.getAttribute('role')).toBeNull();
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
          [bajoLaLinea]="bajoLaLinea()"
          (elegir)="elegidas.push($event)"
        />
      `,
    })
    class HostQueElige {
      readonly grillas = signal<GrillaDeCancha[]>([]);
      readonly elegida = signal<Elegida>(null);
      readonly bajoLaLinea = signal(false);
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

    it('**la tabla es una grilla para el lector**: las flechas la recorren (T393)', () => {
      // El roving tabindex pide un rol compuesto para que el lector lo siga
      // (modern-web-guidance, spatial-navigation).
      const { el } = montarQueElige([{ cancha: cancha(1), bloques: [bloque(1, enHoras(2))] }]);

      expect(el.querySelector('table')?.getAttribute('role')).toBe('grid');
      // El contenedor no suma una parada: la grilla ya tiene la suya.
      expect(el.querySelector('app-marcador > div')?.getAttribute('tabindex')).toBeNull();
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
     * T350 (SPEC-sitio.md, Decimoctava parte, C3): en grande, al bajar aparece la línea de lo
     * elegido fija bajo el encabezado, y los nombres de las canchas quedaban detrás de ella.
     */
    it('**los nombres de las canchas se pegan bajo la línea cuando está a la vista**', () => {
      const { fixture, el } = montarQueElige([{ cancha: cancha(1), bloques: [bloque(1, enHoras(2))] }]);
      const nombres = () => [...el.querySelectorAll('thead th')].map((th) => th.className);

      expect(nombres().every((clases) => clases.includes('sm:top-16'))).toBe(true);

      fixture.componentInstance.bajoLaLinea.set(true);
      fixture.detectChanges();

      // 64 px del encabezado y 58 de la línea: 122 px, sm:top-30.5.
      expect(nombres().every((clases) => clases.includes('sm:top-30.5'))).toBe(true);
      expect(nombres().some((clases) => clases.includes('sm:top-16'))).toBe(false);
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

      it('**si el foco quedó en una que pasa a ser parte de la elección, el tablero sigue teniendo su parada**', () => {
        // Con teclado hasta la de media hora después, y la de arriba elegida con el mouse:
        // Safari no le da el foco al botón que se toca, así que el foco guardado sigue abajo.
        const { fixture, el } = montarQueElige(grillas());
        celda(el, 1, 1).querySelector('button')!.focus();

        fixture.componentInstance.elegida.set({
          canchaId: 1,
          inicio: a(0).toISOString(),
          fin: a(2).toISOString(),
        });
        fixture.detectChanges();

        expect(botones(el).filter((b) => b.tabIndex === 0)).toHaveLength(1);
        expect(celda(el, 0, 1).querySelector('button')?.tabIndex).toBe(0);
      });

      it('**la última hora del día también se marca entera**, aunque después no empiece ninguna', () => {
        // La API no manda inicios que terminen después del cierre (`calcularBloques`): con el
        // cierre en a(3), el último inicio de 1 hora es a(1) y no hay fila a(2).
        const ultimas = [1, 2].map((id) => ({
          cancha: cancha(id),
          bloques: [0, 1].map((m) => bloque(id, a(m))),
        }));
        const { el } = montarQueElige(ultimas, {
          canchaId: 1,
          inicio: a(1).toISOString(),
          fin: a(3).toISOString(),
        });

        expect(el.querySelectorAll('[data-en-la-eleccion]')).toHaveLength(2);
        expect(el.querySelectorAll('tbody tr')[2].querySelector('th')?.textContent).toContain(
          horaEnElClub(a(2).toISOString()),
        );
        // La otra cancha, en esa fila que no tiene inicios: en blanco, y no «Cerrada», que
        // sería falso (el club sigue abierto hasta a(3)).
        expect(celda(el, 2, 2).textContent).not.toContain('Cerrada');
        expect(celda(el, 2, 2).textContent).toContain('Sin inicio a esta hora');
      });

      it('**si el filtro esconde la cancha elegida, no suma filas**: no hay elección a la vista', () => {
        // Cambiar el filtro no suelta lo elegido: la elegida es de la cancha 1 y solo se ve la 2.
        const soloLaDos = [{ cancha: cancha(2), bloques: [0, 1].map((m) => bloque(2, a(m))) }];
        const { el } = montarQueElige(soloLaDos, {
          canchaId: 1,
          inicio: a(1).toISOString(),
          fin: a(3).toISOString(),
        });

        expect(el.querySelectorAll('tbody tr')).toHaveLength(2);
      });

      it('la leyenda tampoco explica por qué no se vende lo que la elección tapa', () => {
        // La de media hora después es libre pero no se vende (sin precio), y queda bajo la elección.
        const { el } = montarQueElige(grillas([{}, { montoClp: null }]), {
          canchaId: 1,
          inicio: a(0).toISOString(),
          fin: a(2).toISOString(),
        });

        expect(el.querySelector('ul')?.textContent).not.toContain('No se arrienda');
      });

      it('sin elección, el tablero no suma filas: termina en el último inicio', () => {
        const ultimas = [{ cancha: cancha(1), bloques: [0, 1].map((m) => bloque(1, a(m))) }];
        const { el } = montarQueElige(ultimas);

        expect(el.querySelectorAll('tbody tr')).toHaveLength(2);
      });

      it('**las que siguen no dependen del color**: la del medio lleva una marca y la última dice hasta cuándo', () => {
        const { el } = montarQueElige(grillas(), {
          canchaId: 1,
          inicio: a(0).toISOString(),
          fin: a(3).toISOString(),
        });

        expect(celda(el, 1, 1).querySelector('[data-en-la-eleccion] [aria-hidden="true"]')).not.toBeNull();
        expect(celda(el, 2, 1).textContent).toContain(`–${horaEnElClub(a(3).toISOString())}`);
      });

      it('la leyenda no explica lo que la elección tapa', () => {
        // La de media hora después figura en mantención como inicio, y queda bajo la elección.
        const { el } = montarQueElige(
          grillas([{}, { bloqueado: true, motivoBloqueo: 'MANTENCION' }]),
          { canchaId: 1, inicio: a(0).toISOString(), fin: a(2).toISOString() },
        );

        expect(el.querySelector('ul')?.textContent).not.toContain('mantención');
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

  /**
   * T389 (`SPEC-panel.md` § Reservas del panel, R4 y asunciones 4 a 7). En el panel, el mismo
   * tablero del sitio dice de quién es cada hora: la reserva ocupa sus filas en una sola celda con
   * el nombre, el tipo y el pago, y se toca para abrir su ficha. El día se ve entero, y el gestor
   * no toma horas.
   */
  describe('en el panel', () => {
    const MEDIA = 30 * 60 * 1000;
    /** Hace dos horas, en punto: las primeras filas ya pasaron y alguna está corriendo. */
    const base = enHoras(-2);
    const a = (medias: number) => new Date(base.getTime() + medias * MEDIA);
    /** Un día con un inicio cada media hora, como lo manda disponibilidad. */
    const dia = (canchaId: number, tomadas: number[] = [], cambios: Record<number, Partial<BloqueDisponible>> = {}) =>
      Array.from({ length: 12 }, (_, medias) =>
        bloque(canchaId, a(medias), {
          reservado: tomadas.includes(medias),
          ...cambios[medias],
        }),
      );
    const reserva = (cambios: Partial<ReservaEnElTablero> = {}): ReservaEnElTablero => ({
      id: 41,
      canchaId: 1,
      inicio: a(6).toISOString(),
      fin: a(8).toISOString(),
      nombre: 'Camila Rojas',
      esSocio: false,
      pago: 'EN_LINEA',
      ...cambios,
    });

    @Component({
      imports: [Marcador],
      template: `
        <app-marcador
          modo="elegir"
          [grillas]="grillas()"
          [reservas]="reservas()"
          [todoElDia]="true"
          [puedeElegir]="puedeElegir()"
          (abrirReserva)="abiertas.push($event)"
        />
      `,
    })
    class HostDelPanel {
      readonly grillas = signal<GrillaDeCancha[]>([]);
      readonly reservas = signal<ReservaEnElTablero[]>([]);
      readonly puedeElegir = signal(true);
      readonly abiertas: number[] = [];
    }

    function montarEnElPanel(
      reservas: ReservaEnElTablero[],
      opciones: { puedeElegir?: boolean; tomadas?: number[]; cambios?: Record<number, Partial<BloqueDisponible>> } = {},
    ) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideRouter([])] });
      const fixture = TestBed.createComponent(HostDelPanel);
      fixture.componentInstance.grillas.set([
        { cancha: cancha(1), bloques: dia(1, opciones.tomadas ?? [5, 6, 7], opciones.cambios) },
        { cancha: cancha(2), bloques: dia(2) },
      ]);
      fixture.componentInstance.reservas.set(reservas);
      fixture.componentInstance.puedeElegir.set(opciones.puedeElegir ?? true);
      fixture.detectChanges();

      return { fixture, el: fixture.nativeElement as HTMLElement };
    }

    const laReserva = (el: HTMLElement) =>
      el.querySelector<HTMLButtonElement>('tbody button[data-reserva]');
    const texto = (nodo: Element | null) => nodo?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

    it('**una reserva de 1 hora ocupa sus dos filas en una sola celda, con su nombre, su tipo y su pago**', () => {
      const { el } = montarEnElPanel([reserva()]);

      const td = laReserva(el)!.closest('td')!;
      expect(td.getAttribute('rowspan')).toBe('2');
      expect(texto(td)).toContain('Camila Rojas');
      expect(texto(td)).toContain('Visitante');
      expect(texto(td)).toContain('Pagada en línea');
      // La fila que sigue no dibuja su celda en esa cancha: la cubre la de arriba.
      expect(el.querySelectorAll('tbody tr')[7].querySelectorAll('td')).toHaveLength(1);
    });

    it('**una de 1 hora y media ocupa tres**', () => {
      const { el } = montarEnElPanel([reserva({ fin: a(9).toISOString() })], {
        tomadas: [5, 6, 7, 8],
      });

      expect(laReserva(el)!.closest('td')!.getAttribute('rowspan')).toBe('3');
    });

    it('**el lector la oye completa, y tocarla abre su ficha**', () => {
      const { fixture, el } = montarEnElPanel([reserva()]);
      const boton = laReserva(el)!;

      expect(boton.getAttribute('aria-label')).toBe(
        `Camila Rojas, visitante, pagada en línea: de ${horaEnElClub(a(6).toISOString())} a ` +
          `${horaEnElClub(a(8).toISOString())} en la Cancha 1. Ver la ficha`,
      );

      boton.click();
      expect(fixture.componentInstance.abiertas).toEqual([41]);
    });

    it('cada pago se dice con palabras, y la que espera el pago va punteada', () => {
      const pagos = {
        SIN_COBRO: 'Sin cobro',
        ESPERANDO: 'Esperando el pago',
        EN_LINEA: 'Pagada en línea',
        EN_EL_MESON: 'Paga en el mesón',
      } as const;

      for (const [pago, palabras] of Object.entries(pagos)) {
        const { el } = montarEnElPanel([
          reserva({ pago: pago as ReservaEnElTablero['pago'], esSocio: pago === 'SIN_COBRO' }),
        ]);
        const boton = laReserva(el)!;

        expect(texto(boton)).toContain(palabras);
        expect(boton.classList.contains('border-dashed')).toBe(pago === 'ESPERANDO');
      }
    });

    it('la del socio dice «Socio»', () => {
      const { el } = montarEnElPanel([reserva({ esSocio: true, pago: 'SIN_COBRO' })]);

      expect(texto(laReserva(el))).toContain('Socio');
    });

    it('**la media hora tomada sin reserva detrás dice «Ocupada», sin botón**', () => {
      // A las 09:30 no cabe una hora entera antes de la reserva de las 10:00: el sitio la
      // muestra ocupada, y en el panel no hay ficha que abrir.
      const { el } = montarEnElPanel([reserva()]);

      expect(celda(el, 5, 1).querySelector('button')).toBeNull();
      expect(texto(celda(el, 5, 1))).toBe('Ocupada');
    });

    it('**con el día entero, se ven las filas que ya pasaron, y su libre no tiene botón**', () => {
      const { el } = montarEnElPanel([]);
      const primera = el.querySelector('tbody tr th')!;

      expect(texto(primera)).toContain(horaEnElClub(a(0).toISOString()));
      expect(celda(el, 0, 1).querySelector('button')).toBeNull();
      expect(texto(celda(el, 0, 1))).toBe('Libre');
    });

    it('la hora que está corriendo todavía se puede tomar', () => {
      // La de hace dos horas en punto más cuatro medias: empezó y no ha terminado.
      const { el } = montarEnElPanel([]);

      expect(celda(el, 4, 1).querySelector('button')).not.toBeNull();
    });

    it('**al gestor, lo libre no le ofrece nada, y las reservas sí se abren**', () => {
      const { el } = montarEnElPanel([reserva()], { puedeElegir: false });
      const botones = [...el.querySelectorAll('tbody button')];

      expect(botones).toHaveLength(1);
      expect(botones[0].hasAttribute('data-reserva')).toBe(true);
      // Es la parada del tablero: se llega a ella con Tab.
      expect((botones[0] as HTMLButtonElement).tabIndex).toBe(0);
    });

    it('la leyenda dice que la reserva se toca para ver su ficha', () => {
      const { el } = montarEnElPanel([reserva()]);

      expect(texto(el.querySelector('ul'))).toContain('Reserva: tócala para ver su ficha');
    });

    it('la clase no lleva a las clases del sitio', () => {
      const { el } = montarEnElPanel([], {
        tomadas: [],
        cambios: { 8: { bloqueado: true, motivoBloqueo: 'CLASE' } },
      });

      expect(el.querySelector('a[href="/clases"]')).toBeNull();
    });
  });
});
