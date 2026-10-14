import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminCanchas } from '../catalogo-canchas/admin/admin-canchas.service';
import { Club } from '../club/club.service';
import { DatosDelClub } from './datos-del-club';

describe('DatosDelClub', () => {
  /** El servicio del sitio, falso: el real pide /api/club y estos tests no tienen HTTP. */
  const club = { recargar: vi.fn() };
  beforeEach(() => club.recargar.mockClear());

  // `value()` de un resource lanza en estado de error.
  it('si los datos no cargan, lo dice y no deja guardar el formulario en blanco', async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AdminCanchas,
          useValue: { configuracion: () => Promise.reject(new Error('la API no respondió')) },
        },
        { provide: Club, useValue: club },
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
        providers: [{ provide: AdminCanchas, useValue: api }, { provide: Club, useValue: club }],
      });
      const fixture = TestBed.createComponent(DatosDelClub);
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
      return { fixture, api, elemento: fixture.nativeElement as HTMLElement };
    };

    // Por su etiqueta, como lo encuentra una persona: la `mat-label` de su campo (T245), y
    // el `name` lo toma NgModel, no el elemento.
    const campoUbicacion = (elemento: HTMLElement) =>
      Array.from(elemento.querySelectorAll('mat-form-field'))
        .find((l) => l.querySelector('mat-label')?.textContent?.includes('Ubicación en el mapa'))
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

  /** T140. Las redes del club: un campo cada una, y vacía es "no tiene esa red". */
  describe('las redes sociales (T140)', () => {
    const CLUB = {
      nombre: 'FEDAL Tennis Center',
      direccion: '',
      telefono: '',
      email: '',
      latitud: null,
      longitud: null,
      instagram: 'https://www.instagram.com/fedaltennis',
      facebook: '',
      tiktok: '',
      youtube: '',
      whatsapp: '56987654321',
    };

    const montar = async () => {
      const api = {
        configuracion: vi.fn().mockResolvedValue(CLUB),
        fijarDatosDelClub: vi.fn().mockResolvedValue(CLUB),
      };
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [{ provide: AdminCanchas, useValue: api }, { provide: Club, useValue: club }],
      });
      const fixture = TestBed.createComponent(DatosDelClub);
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
      return { fixture, api, elemento: fixture.nativeElement as HTMLElement };
    };

    const campo = (elemento: HTMLElement, etiqueta: string) =>
      Array.from(elemento.querySelectorAll('mat-form-field'))
        .find((l) => l.querySelector('mat-label')?.textContent?.includes(etiqueta))
        ?.querySelector('input');

    it('van agrupadas bajo "Redes sociales", con lo que está guardado', async () => {
      const { elemento } = await montar();

      expect(elemento.querySelector('fieldset legend')?.textContent).toContain('Redes sociales');
      expect(campo(elemento, 'Instagram')?.value).toBe('https://www.instagram.com/fedaltennis');
      expect(campo(elemento, 'Facebook')?.value).toBe('');
      expect(campo(elemento, 'TikTok')).toBeTruthy();
      expect(campo(elemento, 'YouTube')).toBeTruthy();
    });

    it('WhatsApp lleva el +56 fijo y muestra los 9 dígitos', async () => {
      const { elemento } = await montar();
      const whatsapp = campo(elemento, 'WhatsApp');

      const prefijo = whatsapp?.closest('mat-form-field')?.querySelector('[matTextPrefix]');
      expect(prefijo?.textContent).toContain('+56');
      expect(whatsapp?.value.replace(/\D/g, '')).toBe('987654321');
    });

    it('**al guardar, el sitio vuelve a pedir los datos**: la red se ve sin recargar', async () => {
      const { fixture, elemento } = await montar();

      elemento.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
      await fixture.whenStable();

      expect(club.recargar).toHaveBeenCalledTimes(1);
    });

    it('al guardar, las redes viajan con los demás datos', async () => {
      const { fixture, api, elemento } = await montar();

      const tiktok = campo(elemento, 'TikTok')!;
      tiktok.value = '@fedaltennis';
      tiktok.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      elemento.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
      await fixture.whenStable();

      expect(api.fijarDatosDelClub).toHaveBeenCalledWith(
        expect.objectContaining({
          instagram: 'https://www.instagram.com/fedaltennis',
          facebook: '',
          tiktok: '@fedaltennis',
          youtube: '',
        }),
      );
    });
  });
});
