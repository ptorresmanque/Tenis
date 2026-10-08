import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { AdminCanchas } from '../catalogo-canchas/admin/admin-canchas.service';
import { DatosDelClub } from './datos-del-club';

describe('DatosDelClub', () => {
  // `value()` de un resource lanza en estado de error.
  it('si los datos no cargan, lo dice y no deja guardar el formulario en blanco', async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AdminCanchas,
          useValue: { configuracion: () => Promise.reject(new Error('la API no respondió')) },
        },
      ],
    });

    const fixture = TestBed.createComponent(DatosDelClub);
    await fixture.whenStable();
    fixture.detectChanges();

    const elemento = fixture.nativeElement as HTMLElement;
    expect(elemento.textContent).toContain('No se pudieron cargar los datos del club');
    // Guardar en blanco pisaría la dirección, el teléfono y el correo publicados.
    expect(elemento.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(
      true,
    );
  });

  /**
   * T100. La ubicación del club: el admin pega el enlace de Google Maps o las
   * coordenadas, y el servidor guarda los números.
   */
  describe('la ubicación (T100)', () => {
    const CLUB = {
      nombre: 'FEDAL Tennis Center',
      direccion: 'Av. Siempre Viva 742',
      telefono: '+56 9 1234 5678',
      email: 'contacto@fedal.cl',
      latitud: -33.4372,
      longitud: -70.6506,
    };

    const montar = async (club: Record<string, unknown> = CLUB) => {
      const api = {
        configuracion: vi.fn().mockResolvedValue(club),
        fijarDatosDelClub: vi.fn().mockResolvedValue(club),
      };
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [{ provide: AdminCanchas, useValue: api }],
      });
      const fixture = TestBed.createComponent(DatosDelClub);
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
      return { fixture, api, elemento: fixture.nativeElement as HTMLElement };
    };

    // Por su etiqueta, como lo encuentra una persona: la etiqueta envuelve al control
    // (ui/campo.ts) y el `name` lo toma NgModel, no el elemento.
    const campoUbicacion = (elemento: HTMLElement) =>
      Array.from(elemento.querySelectorAll('label'))
        .find((l) => l.textContent?.includes('Ubicación en el mapa'))
        ?.querySelector('input');

    it('muestra la guardada como las coordenadas, que es lo que se puede volver a pegar', async () => {
      const { elemento } = await montar();

      expect(
        campoUbicacion(elemento)?.value,
      ).toBe('-33.4372, -70.6506');
    });

    it('sin ubicación, el campo queda vacío', async () => {
      const { elemento } = await montar({ ...CLUB, latitud: null, longitud: null });

      expect(
        campoUbicacion(elemento)?.value,
      ).toBe('');
    });

    it('manda lo que se pegó tal cual: el servidor lo convierte en coordenadas', async () => {
      const { fixture, api, elemento } = await montar();
      const enlace = 'https://www.google.com/maps/@-33.43,-70.65,17z';

      const campo = campoUbicacion(elemento)!;
      campo.value = enlace;
      campo.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      elemento.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
      await fixture.whenStable();

      expect(api.fijarDatosDelClub).toHaveBeenCalledWith(
        expect.objectContaining({ ubicacion: enlace }),
      );
    });

    it('dice cómo conseguir las coordenadas en Google Maps', async () => {
      const { elemento } = await montar();

      expect(elemento.textContent).toContain('clic derecho');
    });
  });
});
