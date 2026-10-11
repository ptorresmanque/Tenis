import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminCanchas, CanchaAdmin } from './admin-canchas.service';
import { EditorFranjas } from './editor-franjas';

/**
 * T13. Las tarifas propias de una cancha. Lo que se cobra sale de acá, así que un
 * campo que viaje mal es plata.
 */
describe('EditorFranjas', () => {
  const CANCHA: CanchaAdmin = {
    id: 7,
    nombre: 'Cancha 7',
    superficie: 'ARCILLA',
    techada: false,
    tieneCamara: false,
    iluminacion: false,
    activa: true,
    orden: 1,
    horarios: [],
    franjas: [
      {
        id: 3,
        canchaId: 7,
        techada: null,
        diaSemana: null,
        horaDesde: '18:00',
        horaHasta: '22:00',
        esPico: true,
        montoClp: 20000,
        montoClp90: null,
      },
    ],
  };

  let fixture: ComponentFixture<EditorFranjas>;
  let api: {
    crearFranja: ReturnType<typeof vi.fn>;
    borrarFranja: ReturnType<typeof vi.fn>;
  };

  const montar = async (cancha: CanchaAdmin) => {
    api = {
      crearFranja: vi.fn().mockResolvedValue({}),
      borrarFranja: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: AdminCanchas, useValue: api }],
    });

    fixture = TestBed.createComponent(EditorFranjas);
    fixture.componentRef.setInput('ambito', cancha);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await montar(CANCHA);
  });

  it('lista las tarifas con su precio y si son pico', () => {
    expect(elemento().textContent).toContain('18:00');
    expect(elemento().textContent).toContain('22:00');
    expect(elemento().textContent).toContain('hora pico');
    // El monto formateado, no el número crudo de la base.
    expect(elemento().textContent?.replace(/\s/g, '')).toContain('$20.000');
  });

  it('sin tarifas propias explica que valen las del club', async () => {
    await montar({ ...CANCHA, franjas: [] });

    expect(elemento().textContent).toContain('valen las generales del club');
  });

  it('la tarifa nueva es de esta cancha y rige desde hoy', async () => {
    elemento().querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    // `vigenteDesde` de hoy y no retroactivo: cambiar un precio no puede alterar
    // lo que ya se cobró, por eso se crea una franja nueva en vez de editar.
    expect(api.crearFranja).toHaveBeenCalledWith(
      expect.objectContaining({
        canchaId: 7,
        diaSemana: null,
        horaDesde: '08:00',
        horaHasta: '18:00',
        montoClp: 12000,
        esPico: false,
        vigenteDesde: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );
  });

  /** T80. Cada franja tiene un precio de 1 hora y otro de 1 hora y media. */
  describe('el precio de 1 hora y media', () => {
    const escribir = async (id: string, valor: string) => {
      const campo = elemento().querySelector<HTMLInputElement>(`#${id}`)!;
      campo.value = valor;
      campo.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    const enviar = async () => {
      elemento().querySelector('form')?.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const texto = () => elemento().textContent?.replace(/\s+/g, ' ') ?? '';

    it('lista los dos precios de cada tarifa', async () => {
      await montar({
        ...CANCHA,
        franjas: [{ ...CANCHA.franjas[0], montoClp90: 27000 }],
      });

      expect(texto()).toContain('1 hora $20.000');
      expect(texto()).toContain('1 hora y media $27.000');
      expect(texto()).not.toContain('Falta el precio');
    });

    it('**una tarifa sin precio de 1 hora y media lo advierte**', () => {
      // Sin ese precio la hora y media no se le vende a quien no es socio en esa
      // franja (T79). Que el panel lo diga es lo que evita descubrirlo por un reclamo.
      expect(texto()).toContain('Falta el precio de 1 hora y media');
    });

    it('la tarifa nueva va sin precio de 1 hora y media si el campo queda vacío', async () => {
      await enviar();

      expect(api.crearFranja).toHaveBeenCalledWith(
        expect.objectContaining({ montoClp: 12000, montoClp90: null }),
      );
    });

    it('la tarifa nueva lleva el precio de 1 hora y media que se escribió', async () => {
      await escribir('monto90-7', '16000');
      await enviar();

      expect(api.crearFranja).toHaveBeenCalledWith(
        expect.objectContaining({ montoClp: 12000, montoClp90: 16000 }),
      );
    });

    it('**un precio de 1 hora y media en cero no llega al servidor**', async () => {
      // Para el visitante cero y vacío son lo mismo —la reserva rechaza $0 con
      // SIN_TARIFA—, y el panel ofrece una sola forma de decirlo: el vacío.
      await escribir('monto90-7', '0');
      await enviar();

      expect(api.crearFranja).not.toHaveBeenCalled();
      expect(texto()).toContain('deja el precio vacío');
    });
  });

  it('quitar una tarifa la borra por su número', async () => {
    const quitar = Array.from(
      elemento().querySelectorAll('button'),
    ).find((b) => b.textContent?.includes('Quitar'));

    quitar?.click();
    await fixture.whenStable();

    expect(api.borrarFranja).toHaveBeenCalledWith(3);
  });

  it('el botón de quitar dice de cuál tarifa se trata', () => {
    // Siete botones "Quitar" iguales no le sirven a quien navega por lector de
    // pantalla: no hay forma de saber cuál se está activando.
    const quitar = Array.from(
      elemento().querySelectorAll('button'),
    ).find((b) => b.textContent?.includes('Quitar'));

    expect(quitar?.textContent).toContain('18:00');
  });

  it('muestra el motivo que dio el servidor', async () => {
    api.crearFranja.mockRejectedValue({
      error: { message: 'La franja tiene que terminar después de empezar.' },
    });

    elemento().querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(elemento().textContent).toContain(
      'La franja tiene que terminar después de empezar.',
    );
  });

  /**
   * T99. En las tarifas generales del club se elige a qué canchas aplica: todas, solo
   * las techadas o solo las abiertas. Una tarifa de una cancha no lleva tipo (T98).
   */
  describe('a qué canchas aplica (T99)', () => {
    const CLUB = { id: null, nombre: 'El club', horarios: [], franjas: [] };
    const aplicaA = () =>
      elemento().querySelector<HTMLSelectElement>('#aplica-club');
    const enviar = async () => {
      elemento().querySelector('form')?.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
    };

    it('en una cancha no se ofrece: ya se sabe si es techada', () => {
      expect(elemento().querySelector('select')).toBeNull();
    });

    it('en las generales se ofrece, y por omisión aplica a todas', async () => {
      await montar(CLUB as never);

      expect(
        Array.from(aplicaA()!.options).map((o) => o.textContent?.trim()),
      ).toEqual(['Todas las canchas', 'Solo techadas', 'Solo al aire libre']);

      await enviar();
      expect(api.crearFranja).toHaveBeenCalledWith(
        expect.objectContaining({ canchaId: null, techada: null }),
      );
    });

    it('**la de solo techadas viaja con su tipo**', async () => {
      await montar(CLUB as never);

      aplicaA()!.value = aplicaA()!.options[1].value;
      aplicaA()!.dispatchEvent(new Event('change'));
      await fixture.whenStable();
      await enviar();

      expect(api.crearFranja).toHaveBeenCalledWith(
        expect.objectContaining({ canchaId: null, techada: true }),
      );
    });

    it('la lista dice a qué canchas aplica cada tarifa general', async () => {
      const franja = CANCHA.franjas[0];
      await montar({
        ...CLUB,
        franjas: [
          { ...franja, id: 1, canchaId: null, techada: true },
          { ...franja, id: 2, canchaId: null, techada: false, horaDesde: '08:00' },
          { ...franja, id: 3, canchaId: null, techada: null, horaDesde: '07:00' },
        ],
      } as never);

      const filas = Array.from(elemento().querySelectorAll('li')).map((li) =>
        li.textContent?.replace(/\s+/g, ' '),
      );
      expect(filas.find((f) => f?.includes('18:00'))).toContain('solo techadas');
      expect(filas.find((f) => f?.includes('08:00'))).toContain('solo al aire libre');
      expect(filas.find((f) => f?.includes('07:00'))).not.toContain('solo');
    });
  });
});
