import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Contacto, Solicitud } from '../../club/contacto.service';
import { SolicitudesPanel } from './solicitudes';

/**
 * T38. La bandeja del club.
 *
 * Lo que este archivo ataja: que **atender la última consulta no confirme nada**. Al
 * resolverla sale de la lista, y con el aviso dentro del bloque de la lista el admin
 * veía desaparecer la fila sin más. Justo en la acción que da de alta a un socio, que
 * es la que nadie quiere hacer dos veces por las dudas.
 */
describe('SolicitudesPanel', () => {
  const UNA: Solicitud = {
    id: 12,
    tipo: 'SOCIO',
    nombre: 'Ana Interesada',
    email: 'ana@ejemplo.cl',
    telefono: '',
    mensaje: 'Quiero asociarme',
    estado: 'NUEVA',
    creadaEn: '2026-08-24T12:00:00.000Z',
    nota: null,
    invitacionId: null,
  };

  let fixture: ComponentFixture<SolicitudesPanel>;
  let api: {
    bandeja: ReturnType<typeof vi.fn>;
    resolver: ReturnType<typeof vi.fn>;
    invitar: ReturnType<typeof vi.fn>;
  };

  const montar = async (solicitudes: Solicitud[]) => {
    api = {
      // Devuelve la lista la primera vez y vacía después: es lo que pasa de verdad
      // cuando se atiende la última consulta pendiente.
      bandeja: vi
        .fn()
        .mockResolvedValueOnce(solicitudes)
        .mockResolvedValue([]),
      resolver: vi.fn().mockResolvedValue(UNA),
      invitar: vi.fn().mockResolvedValue({ id: 3, email: UNA.email }),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: Contacto, useValue: api }],
    });

    fixture = TestBed.createComponent(SolicitudesPanel);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const apretar = async (etiqueta: string) => {
    Array.from(elemento().querySelectorAll('button'))
      .find((b) => b.textContent?.includes(etiqueta))
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await montar([UNA]);
  });

  it('arranca en las que faltan por responder', () => {
    expect(api.bandeja).toHaveBeenCalledWith({ estado: 'NUEVA' });
    expect(elemento().textContent).toContain('Ana Interesada');
  });

  it('**dar de alta confirma, aunque la bandeja quede vacía**', async () => {
    await apretar('Dar de alta');

    expect(api.invitar).toHaveBeenCalledWith(12);
    expect(elemento().textContent).toContain('ya está invitada');
    // Y el aviso convive con el estado vacío, en vez de ser reemplazado por él.
    expect(elemento().textContent).toContain('Nada por responder');
  });

  it('el error del servidor se ve, y explica por qué no se pudo', async () => {
    api.invitar.mockRejectedValue({
      error: { message: 'Ese correo ya es socio del club.' },
    });

    await apretar('Dar de alta');

    expect(elemento().textContent).toContain('ya es socio del club');
  });

  it('solo las de quien quiere asociarse ofrecen el alta', async () => {
    // Invitar como socio a quien preguntó por clases para su hijo lo mete en el padrón
    // sin haberlo pedido. El servidor lo rechaza; el botón ni aparece.
    await montar([{ ...UNA, tipo: 'CLASES' }]);

    const alta = Array.from(elemento().querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Dar de alta'),
    );

    expect(alta).toBeUndefined();
  });

  it('sin nada por responder lo dice, en vez de quedar en blanco', async () => {
    await montar([]);

    expect(elemento().textContent).toContain('Nada por responder');
  });
});
