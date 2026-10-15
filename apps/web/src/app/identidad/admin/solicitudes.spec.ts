import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Contacto, useValue: api }],
    });

    fixture = TestBed.createComponent(SolicitudesPanel);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  beforeEach(async () => {
    await montar([UNA]);
  });

  it('arranca en las que faltan por responder', () => {
    expect(api.bandeja).toHaveBeenCalledWith({ estado: 'NUEVA' });
    expect(elemento().textContent).toContain('Ana Interesada');
  });

  it('**ya no da de alta: dice cómo se hace socia, en Personas** (T297, D13)', async () => {
    // El alta es en Personas, sobre la cuenta que la persona crea en el sitio, y esta
    // consulta se enlaza sola al marcarla Socio (A14).
    const texto = elemento().textContent!.replace(/\s+/g, ' ');

    expect(
      Array.from(elemento().querySelectorAll('button')).some((b) =>
        b.textContent?.includes('Dar de alta'),
      ),
    ).toBe(false);
    expect(texto).toContain('que cree su cuenta en el sitio');
    expect(
      elemento().querySelector('a[href="/administracion/personas?tipo=sin-tipo"]'),
    ).not.toBeNull();
  });

  it('la indicación es solo para quien quiere asociarse', async () => {
    await montar([{ ...UNA, tipo: 'CLASES' }]);

    expect(elemento().textContent).not.toContain('que cree su cuenta en el sitio');
  });

  it('sin nada por responder lo dice, en vez de quedar en blanco', async () => {
    await montar([]);

    expect(elemento().textContent).toContain('Nada por responder');
  });

  // `value()` de un resource lanza en estado de error aunque tenga `defaultValue`.
  it('si la bandeja no carga, lo dice', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Contacto, useValue: { bandeja: () => Promise.reject(new Error('la API no respondió')) } },
      ],
    });

    fixture = TestBed.createComponent(SolicitudesPanel);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(elemento().textContent).toContain('No se pudieron cargar las solicitudes');
  });
});
