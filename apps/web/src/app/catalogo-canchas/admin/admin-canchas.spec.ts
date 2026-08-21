import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminCanchasPanel } from './admin-canchas';
import { AdminCanchas, Advertencia, CanchaAdmin } from './admin-canchas.service';

/**
 * T13. El panel del club. Lo que se prueba acá es lo que el admin decide mirando:
 * cuáles canchas están fuera de la grilla y qué horas se están regalando.
 */
describe('AdminCanchasPanel', () => {
  const CANCHA: CanchaAdmin = {
    id: 1,
    nombre: 'Cancha 1',
    superficie: 'ARCILLA',
    techada: false,
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
        diaSemana: null,
        horaDesde: '08:00',
        horaHasta: '18:00',
        esPico: false,
        montoClp: 12000,
      },
    ],
  };

  let fixture: ComponentFixture<AdminCanchasPanel>;
  let api: {
    canchas: ReturnType<typeof vi.fn>;
    advertencias: ReturnType<typeof vi.fn>;
    crear: ReturnType<typeof vi.fn>;
    editar: ReturnType<typeof vi.fn>;
    eliminar: ReturnType<typeof vi.fn>;
    bloqueos: ReturnType<typeof vi.fn>;
    configuracion: ReturnType<typeof vi.fn>;
    general: ReturnType<typeof vi.fn>;
  };

  const montar = async (
    canchas: CanchaAdmin[],
    advertencias: Advertencia[] = [],
  ) => {
    api = {
      canchas: vi.fn().mockResolvedValue(canchas),
      advertencias: vi.fn().mockResolvedValue(advertencias),
      crear: vi.fn().mockResolvedValue(canchas[0]),
      editar: vi.fn().mockResolvedValue(canchas[0]),
      eliminar: vi.fn().mockResolvedValue(undefined),
      // Lo pide el editor de bloqueos, que el panel monta dentro de cada cancha.
      bloqueos: vi.fn().mockResolvedValue([]),
      // Y esto el panel de lo general del club, que monta los mismos editores con
      // un ámbito sin id. Su propio spec es `reglas-generales.spec.ts`.
      general: vi.fn().mockResolvedValue({ horarios: [], franjas: [] }),
      // Y esto el editor de reglas, que va arriba de todo. Su propio spec es
      // `editor-configuracion.spec.ts`; acá solo tiene que poder montarse.
      configuracion: vi.fn().mockResolvedValue({
        duracionBloqueMin: 60,
        cupoDiarioSocioHoras: 1,
        cupoPicoSemanalHoras: 2,
        invitadosPorMes: 4,
        horasMinModificacion: 6,
        horasReembolsoTotal: 24,
        diasSancionNoUso: 15,
      }),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: AdminCanchas, useValue: api }],
    });

    fixture = TestBed.createComponent(AdminCanchasPanel);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  /**
   * Por texto exacto y no por subcadena: la pantalla monta los editores del club
   * antes de la lista, y "Agregar" por subcadena encontraba "Agregar tarifa" —el
   * test pasaba a apretar otro botón sin que nadie se enterara.
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

  it('a una cancha desactivada la nombra, no solo la apaga', async () => {
    // La opacidad es una diferencia de color, y no todos la ven. Sin la palabra,
    // el admin no distingue una cancha fuera de la grilla de una dentro.
    await montar([{ ...CANCHA, activa: false }]);

    expect(texto()).toContain('Desactivada');
    expect(boton('Reactivar')).toBeDefined();
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
    expect(texto()).toContain('Sus reservas siguen ahí');
  });

  describe('eliminación (T29)', () => {
    it('pregunta antes de borrar, y nombra la cancha en la pregunta', async () => {
      const preguntado = vi
        .spyOn(window, 'confirm')
        .mockReturnValue(false);

      boton('Eliminar')?.click();
      await fixture.whenStable();

      // Cancelar deja todo como estaba: borrar una cancha no se deshace.
      expect(preguntado.mock.calls[0][0]).toContain('Cancha 1');
      expect(api.eliminar).not.toHaveBeenCalled();
    });

    it('confirmado, la borra y la saca de la lista', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      api.canchas.mockResolvedValue([]);

      boton('Eliminar')?.click();
      await fixture.whenStable();
      fixture.detectChanges();

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
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      api.eliminar.mockRejectedValue({
        error: {
          message: 'Esta cancha tiene 3 reservas en su historial. Desactívala.',
        },
      });

      boton('Eliminar')?.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(texto()).toContain('Desactívala');
      expect(texto()).toContain('Cancha 1');
    });
  });

  describe('advertencias de tarifa', () => {
    it('avisa qué horas quedaron sin cobrar y en qué cancha', async () => {
      await montar([CANCHA], [
        {
          canchaId: 1,
          nombre: 'Cancha 1',
          // 11:00Z son las 07:00 en el club: la advertencia se lee en la hora
          // del club, que es la que el admin va a buscar en el horario.
          sinTarifa: ['2026-08-17T11:00:00.000Z'],
        },
      ]);

      expect(texto()).toContain('Horas sin tarifa hoy');
      expect(texto()).toContain('07:00');
    });

    it('sin horas sueltas no muestra la alarma', () => {
      expect(texto()).not.toContain('Horas sin tarifa hoy');
    });
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
});
