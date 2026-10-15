import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatCardHarness } from '@angular/material/card/testing';
import { MatExpansionPanelHarness } from '@angular/material/expansion/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { elegidoEn, textosDe } from '../../testing/elegir';
import { AdminCanchasPanel } from './admin-canchas';
import { AdminCanchas, CanchaAdmin, HorasSinTarifa } from './admin-canchas.service';
import { responder, textoDelDialogo } from '../../testing/dialogos';
import { avisoDeLoHecho } from '../../testing/snackbar';

/**
 * T13. El panel del club. Lo que se prueba acá es lo que el admin decide mirando:
 * cuáles canchas están fuera de la grilla.
 *
 * Desde T288 es la pestaña «Canchas»: el título y la alarma de horas sin tarifa van en la
 * pantalla madre (`canchas.spec.ts`), y el horario y las tarifas del club, en sus pestañas.
 */
describe('AdminCanchasPanel', () => {
  const CANCHA: CanchaAdmin = {
    id: 1,
    nombre: 'Cancha 1',
    superficie: 'ARCILLA',
    techada: false,
    tieneCamara: false,
    iluminacion: true,
    activa: true,
    orden: 1,
    horarios: [
      { id: 1, diaSemana: 1, horaApertura: '08:00', horaCierre: '22:00' },
    ],
    franjas: [
      {
        id: 1,
        canchaId: 1,
        techada: null,
        diaSemana: null,
        horaDesde: '08:00',
        horaHasta: '18:00',
        esPico: false,
        montoClp: 12000,
        montoClp90: null,
      },
    ],
  };

  let fixture: ComponentFixture<AdminCanchasPanel>;
  let api: {
    canchas: ReturnType<typeof vi.fn>;
    crear: ReturnType<typeof vi.fn>;
    editar: ReturnType<typeof vi.fn>;
    eliminar: ReturnType<typeof vi.fn>;
    bloqueos: ReturnType<typeof vi.fn>;
  };
  /** La alarma de la pantalla madre, que la lista relee al cambiar una cancha. */
  let alarma: { recargar: ReturnType<typeof vi.fn> };

  const montar = async (canchas: CanchaAdmin[]) => {
    api = {
      canchas: vi.fn().mockResolvedValue(canchas),
      crear: vi.fn().mockResolvedValue(canchas[0]),
      editar: vi.fn().mockResolvedValue(canchas[0]),
      eliminar: vi.fn().mockResolvedValue(undefined),
      // Lo pide el editor de bloqueos, que el panel monta dentro de cada cancha.
      bloqueos: vi.fn().mockResolvedValue([]),
    };
    alarma = { recargar: vi.fn() };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AdminCanchas, useValue: api },
        { provide: HorasSinTarifa, useValue: alarma },
      ],
    });

    fixture = TestBed.createComponent(AdminCanchasPanel);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  /**
   * Por texto exacto y no por subcadena: cada cancha monta sus editores al abrirla, y
   * "Agregar" por subcadena encontraba "Agregar tarifa" —el test pasaba a apretar otro
   * botón sin que nadie se enterara.
   */
  const boton = (etiqueta: string) =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((b) => b.textContent?.trim() === etiqueta);

  beforeEach(async () => {
    await montar([CANCHA]);
  });

  it('lista las canchas del club', () => {
    expect(texto()).toContain('Cancha 1');
    expect(texto()).toContain('Arcilla');
  });

  it('la cancha nueva ofrece Cemento primero y ya elegido: las ocho del club son de cemento (T94)', async () => {
    await fixture.whenStable();
    expect(textosDe(fixture, 'mat-select#superficie')).toEqual([
      'Cemento',
      'Arcilla',
      'Pasto sintético',
    ]);
    expect(elegidoEn(fixture, 'mat-select#superficie')).toBe('CEMENTO');
  });

  it('cada sección se encabeza con un rótulo (TV7.2)', () => {
    const titulos = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('section > h2'),
    ];

    // Las dos: agregar y la lista. La alarma y lo general del club se fueron a la pantalla
    // madre y a sus pestañas (T288).
    expect(titulos.length).toBe(2);
    expect(titulos.every((h2) => h2.classList.contains('rotulo-seccion'))).toBe(true);
  });

  it('a una cancha desactivada la nombra, no solo la apaga', async () => {
    // La opacidad es una diferencia de color, y no todos la ven. Sin la palabra,
    // el admin no distingue una cancha fuera de la grilla de una dentro.
    await montar([{ ...CANCHA, activa: false }]);

    expect(texto()).toContain('Desactivada');
    expect(boton('Reactivar')).toBeDefined();
  });

  it('a la cancha desactivada no la apaga la opacidad, que le baja el contraste', async () => {
    // Con opacity-60, sobre el fondo del panel, el texto gris quedaba en 2,91:1,
    // "Reactivar" en 3,13:1 y "Eliminar" en 2,76:1: la tarjeta seguía teniendo
    // botones que se usan, así que tiene que leerse como cualquier otra.
    await montar([{ ...CANCHA, activa: false }]);
    const tarjeta = (fixture.nativeElement as HTMLElement).querySelector('li');

    expect(tarjeta?.className).not.toMatch(/opacity-/);
  });

  it('la cancha desactivada sigue en el panel, para poder reactivarla', async () => {
    await montar([{ ...CANCHA, activa: false }]);

    // Si el panel solo listara las activas, desactivar sería un viaje de ida y
    // habría que entrar a la base para volver atrás.
    expect(texto()).toContain('Cancha 1');
  });

  it('desactivar avisa que las reservas no se borran', async () => {
    boton('Desactivar')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.editar).toHaveBeenCalledWith(1, { activa: false });
    expect(avisoDeLoHecho()).toContain('Sus reservas siguen ahí');
  });

  describe('eliminación (T29)', () => {
    it('pregunta antes de borrar, y nombra la cancha en la pregunta', async () => {
      boton('Eliminar')?.click();
      await fixture.whenStable();

      // La pregunta es un diálogo (T253). Descartar deja todo como estaba: borrar una cancha
      // no se deshace.
      expect(textoDelDialogo()).toContain('¿Eliminar Cancha 1?');
      await responder(fixture, false);
      expect(api.eliminar).not.toHaveBeenCalled();
    });

    it('confirmado, la borra y la saca de la lista', async () => {
      api.canchas.mockResolvedValue([]);

      boton('Eliminar')?.click();
      await fixture.whenStable();
      await responder(fixture, true);

      expect(api.eliminar).toHaveBeenCalledWith(1);
      // Por el encabezado y no por el texto de la página: el aviso de que se borró
      // también nombra la cancha, y buscarla en todo el texto pasaría siempre.
      const nombres = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('h3'),
      ).map((h) => h.textContent?.trim());
      expect(nombres).not.toContain('Cancha 1');
    });

    it('si el servidor dice que tiene historial, lo repite tal cual', async () => {
      // El mensaje del servidor explica qué hacer —desactivarla— y cuántas
      // reservas hay en juego. Uno genérico manda al admin a adivinar.
      api.eliminar.mockRejectedValue({
        error: {
          message: 'Esta cancha tiene 3 reservas en su historial. Desactívala.',
        },
      });

      boton('Eliminar')?.click();
      await fixture.whenStable();
      await responder(fixture, true);

      expect(texto()).toContain('Desactívala');
      expect(texto()).toContain('Cancha 1');
    });
  });

  it('**cambiar una cancha relee la alarma de horas sin tarifa**, que va arriba (T288)', async () => {
    // Desactivarla o cambiar sus tarifas cambia qué horas quedan sin cobrar.
    boton('Desactivar')?.click();
    await fixture.whenStable();

    expect(alarma.recargar).toHaveBeenCalledTimes(1);
  });

  describe('alta', () => {
    it('no manda una cancha sin nombre', async () => {
      boton('Agregar')?.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(api.crear).not.toHaveBeenCalled();
      expect(texto()).toContain('Ponle un nombre');
    });

    it('muestra el motivo que dio el servidor, no uno genérico', async () => {
      // "Ya hay una cancha con ese nombre" dice qué arreglar; "algo salió mal"
      // obliga a adivinar.
      api.crear.mockRejectedValue({
        error: { message: 'Ya hay una cancha con ese nombre.' },
      });

      const input = (fixture.nativeElement as HTMLElement).querySelector(
        '#nombre',
      ) as HTMLInputElement;
      input.value = 'Cancha 1';
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();

      boton('Agregar')?.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(texto()).toContain('Ya hay una cancha con ese nombre.');
    });
  });

  describe('la cámara de la cancha (T68)', () => {
    // Por prefijo: el botón lleva detrás el nombre de la cancha para el lector de
    // pantalla, porque en la página hay uno igual por cada cancha.
    const camara = (etiqueta: string) =>
      Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
      ).find((b) => b.textContent?.trim().startsWith(etiqueta));

    beforeEach(async () => {
      await montar([CANCHA]);
    });

    it('**una cancha que ya existe se puede marcar con cámara**', async () => {
      // La casilla del formulario de arriba solo vale para la que se está creando, y
      // la cámara se instala meses después de cargar la cancha.
      camara('Marcar con cámara')?.click();
      await fixture.whenStable();

      expect(api.editar).toHaveBeenCalledWith(1, { tieneCamara: true });
    });

    it('la marcada ofrece quitarla, y se lee en su ficha', async () => {
      await montar([{ ...CANCHA, tieneCamara: true }]);

      expect(texto()).toContain('Con cámara');
      expect(camara('Quitar la cámara')).toBeTruthy();
    });

    it('dice para qué sirve: se puede transmitir', async () => {
      camara('Marcar con cámara')?.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(texto()).toContain('transmitir');
    });
  });

  it('**cada cancha es una tarjeta de Material, con contorno** (T282)', async () => {
    // Una cosa con sus acciones: el caso del skill para mat-card. La sección de alta, en
    // cambio, sigue siendo una sección.
    const tarjetas = await TestbedHarnessEnvironment.loader(fixture).getAllHarnesses(
      MatCardHarness,
    );

    expect(tarjetas).toHaveLength(1);
    expect(await tarjetas[0].getText()).toContain('Cancha 1');
    expect(await (await tarjetas[0].host()).hasClass('mat-mdc-card-outlined')).toBe(true);
  });

  /**
   * T281. «Horario, tarifas y bloqueos» de cada cancha es un panel de Material, cerrado. Sus
   * editores se crean recién al abrirlo: con ocho canchas, eran 269 campos montados a la vez
   * y un pedido de bloqueos por cancha que nadie había abierto.
   */
  it('**horario, tarifas y bloqueos van en un panel cerrado, y se cargan al abrirlo** (T281)', async () => {
    const panel = await TestbedHarnessEnvironment.loader(fixture).getHarness(
      MatExpansionPanelHarness.with({ title: /Horario, tarifas y bloqueos/ }),
    );

    expect(await panel.isExpanded()).toBe(false);
    expect(api.bloqueos).not.toHaveBeenCalled();

    await panel.expand();
    await fixture.whenStable();

    expect(api.bloqueos).toHaveBeenCalled();
    expect(await panel.getTextContent()).toContain('Horario de apertura');
  });

  describe('la ficha de la cancha (T96)', () => {
    const raiz = () => fixture.nativeElement as HTMLElement;
    // Por prefijo, como la cámara: el botón lleva el nombre de la cancha para el lector.
    const botonQueEmpieza = (etiqueta: string) =>
      Array.from(raiz().querySelectorAll('button')).find((b) =>
        b.textContent?.trim().startsWith(etiqueta),
      );
    const campo = <T extends HTMLElement>(selector: string) =>
      raiz().querySelector(selector) as T;

    const abrir = async () => {
      botonQueEmpieza('Editar ficha')?.click();
      await fixture.whenStable();
      fixture.detectChanges();
    };

    const escribirNombre = async (nombre: string) => {
      const input = campo<HTMLInputElement>('#ficha-nombre-1');
      input.value = nombre;
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };

    const guardar = async () => {
      botonQueEmpieza('Guardar la ficha')?.click();
      await fixture.whenStable();
      fixture.detectChanges();
    };

    it('abre con los datos de la cancha y guarda nombre, superficie, techo e iluminación', async () => {
      await abrir();
      expect(campo<HTMLInputElement>('#ficha-nombre-1').value).toBe('Cancha 1');

      await escribirNombre('Cancha Central');
      // El id va en la casilla de Material; su input lleva el mismo id con «-input» (T249).
      const techada = campo<HTMLInputElement>('#ficha-techada-1-input');
      techada.click();
      await fixture.whenStable();
      await guardar();

      expect(api.editar).toHaveBeenCalledWith(1, {
        nombre: 'Cancha Central',
        superficie: 'ARCILLA',
        techada: true,
        iluminacion: true,
      });
      // Relee la lista: el nombre nuevo tiene que salir en el panel.
      expect(api.canchas).toHaveBeenCalledTimes(2);
      expect(campo('#ficha-nombre-1')).toBeNull();
    });

    it('un nombre repetido lo dice junto al campo, y el campo queda marcado', async () => {
      api.editar.mockRejectedValue({
        status: 409,
        error: { message: 'Ya hay una cancha con ese nombre.' },
      });

      await abrir();
      await escribirNombre('Cancha 2');
      await guardar();

      const input = campo<HTMLInputElement>('#ficha-nombre-1');
      const ayuda = campo(`#${input.getAttribute('aria-describedby')}`);
      expect(ayuda.textContent).toContain('Ya hay una cancha con ese nombre.');
      expect(input.getAttribute('aria-invalid')).toBe('true');
    });

    it('sin nombre no llega al servidor', async () => {
      await abrir();
      await escribirNombre('   ');
      await guardar();

      expect(api.editar).not.toHaveBeenCalled();
      expect(texto()).toContain('Ponle un nombre a la cancha.');
    });

    it('cancelar cierra sin guardar', async () => {
      await abrir();
      await escribirNombre('Otro nombre');
      botonQueEmpieza('Cancelar')?.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(api.editar).not.toHaveBeenCalled();
      expect(campo('#ficha-nombre-1')).toBeNull();
    });

    it('al guardar, el foco vuelve al botón que la abrió, aunque la lista se relea', async () => {
      await abrir();
      await escribirNombre('Cancha Central');
      await guardar();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(document.activeElement).toBe(campo('#editar-ficha-1'));
    });

    it('al abrir, el foco va al nombre: es lo que se viene a cambiar', async () => {
      await abrir();
      await fixture.whenStable();

      expect(document.activeElement).toBe(campo('#ficha-nombre-1'));
    });
  });

  // `value()` de un resource lanza en estado de error aunque tenga `defaultValue`.
  it('si la API no responde, lo dice en vez de reventar', async () => {
    const caida = () => Promise.reject(new Error('la API no respondió'));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AdminCanchas,
          useValue: { canchas: caida },
        },
        { provide: HorasSinTarifa, useValue: { recargar: vi.fn() } },
      ],
    });

    fixture = TestBed.createComponent(AdminCanchasPanel);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(texto()).toContain('No se pudieron cargar las canchas');
  });
});
