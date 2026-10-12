import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { Club, DatosDelClub } from './club.service';
import { RedesSociales } from './redes-sociales';

/**
 * T141. Las redes que el club cargó en "Datos del club" (T140), con su logo. Van en el
 * pie de todas las páginas y en "El club".
 */
describe('RedesSociales', () => {
  const SIN_REDES: DatosDelClub = {
    nombre: 'FEDAL Tennis Center',
    direccion: '',
    telefono: '',
    email: '',
    latitud: null,
    longitud: null,
    instagram: '',
    facebook: '',
    tiktok: '',
    youtube: '',
    whatsapp: '',
    elClubTitulo: 'FEDAL Tennis Center',
    elClubBajada: '',
    elClubCanchas: '',
    tienda: { descripcion: '', horario: '', whatsapp: '' },
    cafeteria: { descripcion: '', horario: '', whatsapp: '' },
  };

  const montar = (datos: Partial<DatosDelClub>) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: Club, useValue: { datos: signal({ ...SIN_REDES, ...datos }) } }],
    });
    const fixture = TestBed.createComponent(RedesSociales);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  const enlaces = (elemento: HTMLElement) => Array.from(elemento.querySelectorAll('a'));

  it('muestra solo las redes que el club cargó, en el orden de siempre', () => {
    const elemento = montar({
      whatsapp: '56987654321',
      instagram: 'https://www.instagram.com/fedaltennis',
    });

    expect(enlaces(elemento).map((a) => a.textContent?.trim())).toEqual([
      'Instagram de FEDAL Tennis Center (se abre en otra pestaña)',
      'WhatsApp de FEDAL Tennis Center (se abre en otra pestaña)',
    ]);
    expect(enlaces(elemento)[0].getAttribute('href')).toBe(
      'https://www.instagram.com/fedaltennis',
    );
  });

  it('WhatsApp abre la conversación con el número del club', () => {
    const elemento = montar({ whatsapp: '56987654321' });

    expect(enlaces(elemento)[0].getAttribute('href')).toBe('https://wa.me/56987654321');
  });

  it('cada enlace se abre en otra pestaña sin darle acceso a esta', () => {
    const elemento = montar({ facebook: 'https://facebook.com/fedaltennis' });

    expect(enlaces(elemento)[0].getAttribute('target')).toBe('_blank');
    expect(enlaces(elemento)[0].getAttribute('rel')).toContain('noopener');
  });

  it('el logo es decoración: el nombre lo da el texto, no el dibujo', () => {
    const elemento = montar({ youtube: 'https://www.youtube.com/@fedaltennis' });

    expect(elemento.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('**sin ninguna red, no dibuja nada**: ni la lista vacía', () => {
    const elemento = montar({});

    expect(elemento.querySelector('ul')).toBeNull();
  });

  it('la lista se anuncia como "Redes sociales"', () => {
    const elemento = montar({ tiktok: 'https://www.tiktok.com/@fedaltennis' });

    expect(elemento.querySelector('ul')?.getAttribute('aria-label')).toBe('Redes sociales');
  });
});
