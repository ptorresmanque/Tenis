import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ListadoDeSocios, Socios } from './socios.service';
import { SociosPanel } from './socios';

/**
 * T33. Donde el admin escribe el correo de un socio nuevo.
 *
 * La regla de negocio vive en el servidor (T32); lo que se prueba acá es que la
 * pantalla pida lo mínimo —un correo— y que lo que el servidor responda se vea.
 */
describe('SociosPanel', () => {
  const LISTADO: ListadoDeSocios = {
    socios: [
      {
        id: 1,
        numeroSocio: '001',
        estado: 'ACTIVO',
        alDiaHasta: '2026-11-30T00:00:00.000Z',
        usuario: {
          nombre: 'Carolina',
          apellido: 'Díaz',
          email: 'carolina@clubdetenis.cl',
        },
      },
      {
        id: 2,
        numeroSocio: '002',
        estado: 'SUSPENDIDO',
        alDiaHasta: '2026-07-31T00:00:00.000Z',
        usuario: {
          nombre: 'Matías',
          apellido: 'Rojas',
          email: 'matias@clubdetenis.cl',
        },
      },
    ],
    invitaciones: [
      {
        id: 9,
        email: 'nueva@ejemplo.cl',
        numeroSocio: '004',
        alDiaHasta: '2026-08-31T00:00:00.000Z',
        creadaEn: '2026-08-21T12:00:00.000Z',
      },
    ],
  };

  let fixture: ComponentFixture<SociosPanel>;
  let api: {
    listado: ReturnType<typeof vi.fn>;
    invitar: ReturnType<typeof vi.fn>;
    revocar: ReturnType<typeof vi.fn>;
  };

  const montar = async (listado: ListadoDeSocios = LISTADO) => {
    api = {
      listado: vi.fn().mockResolvedValue(listado),
      invitar: vi.fn().mockResolvedValue(listado.invitaciones[0]),
      revocar: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: Socios, useValue: api }],
    });

    fixture = TestBed.createComponent(SociosPanel);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  const escribir = async (id: string, valor: string) => {
    const input = (fixture.nativeElement as HTMLElement).querySelector(
      `#${id}`,
    ) as HTMLInputElement;
    input.value = valor;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const apretar = async (etiqueta: string) => {
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    )
      .find((b) => b.textContent?.trim().startsWith(etiqueta))
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await montar();
  });

  it('lista los socios con su número, su nombre y su estado', () => {
    expect(texto()).toContain('001');
    expect(texto()).toContain('Carolina Díaz');
    // Con palabras: "suspendido" no puede quedar solo en un color.
    expect(texto()).toContain('Suspendido');
  });

  it('avisa quién tiene la cuota vencida', () => {
    // La fecha sola obliga al admin a compararla mentalmente con hoy, socio por
    // socio, que es justo lo que la pantalla puede hacer por él.
    expect(texto()).toContain('Cuota vencida');
  });

  it('lista aparte las invitaciones que nadie usó todavía', () => {
    expect(texto()).toContain('nueva@ejemplo.cl');
    expect(texto()).toContain('Invitaciones pendientes');
  });

  it('con solo el correo alcanza para dar de alta', async () => {
    await escribir('email-socio', 'otra@ejemplo.cl');
    await apretar('Invitar');

    // Sin número ni fecha: el club los pone. Mandarlos vacíos sería pedirle al
    // servidor que invente sobre un string vacío.
    expect(api.invitar).toHaveBeenCalledWith({ email: 'otra@ejemplo.cl' });
  });

  it('manda el correo en minúsculas y sin espacios', async () => {
    await escribir('email-socio', '  Otra@Ejemplo.CL  ');
    await apretar('Invitar');

    expect(api.invitar).toHaveBeenCalledWith({ email: 'otra@ejemplo.cl' });
  });

  it('el número y la fecha viajan solo si el admin los escribió', async () => {
    await escribir('email-socio', 'otra@ejemplo.cl');
    await escribir('numero-socio', 'A-12');
    await escribir('al-dia-hasta', '2027-01-31');
    await apretar('Invitar');

    expect(api.invitar).toHaveBeenCalledWith({
      email: 'otra@ejemplo.cl',
      numeroSocio: 'A-12',
      alDiaHasta: '2027-01-31',
    });
  });

  it('sin correo no llama al servidor', async () => {
    await apretar('Invitar');

    expect(api.invitar).not.toHaveBeenCalled();
    expect(texto()).toContain('Escribe el correo');
  });

  it('un correo ya invitado se explica con lo que dijo el servidor', async () => {
    // No un 500 en la consola: "ya hay una invitación con ese correo" dice qué
    // pasó y qué hacer.
    api.invitar.mockRejectedValue({
      error: { message: 'Ya hay una invitación con ese correo o ese número.' },
    });
    await escribir('email-socio', 'nueva@ejemplo.cl');
    await apretar('Invitar');

    expect(texto()).toContain('Ya hay una invitación con ese correo');
  });

  it('revocar saca la invitación de la lista', async () => {
    api.listado.mockResolvedValue({ socios: LISTADO.socios, invitaciones: [] });

    await apretar('Revocar');

    expect(api.revocar).toHaveBeenCalledWith(9);
    // En la lista de pendientes y no en el texto de la página: el aviso de que se
    // anuló también nombra el correo, y buscarlo en todo pasaría siempre.
    const pendientes = (fixture.nativeElement as HTMLElement).querySelector(
      '[aria-labelledby="titulo-pendientes"]',
    );
    expect(pendientes?.textContent).not.toContain('nueva@ejemplo.cl');
  });

  it('sin invitaciones pendientes no muestra una lista vacía', async () => {
    await montar({ socios: LISTADO.socios, invitaciones: [] });

    expect(texto()).toContain('No hay invitaciones pendientes');
  });
});
