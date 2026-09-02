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
        diaSemana: null,
        horaDesde: '18:00',
        horaHasta: '22:00',
        esPico: true,
        montoClp: 20000,
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
});
