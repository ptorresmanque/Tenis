import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { Cancha, Disponibilidad } from '../catalogo-canchas/disponibilidad';
import { Club, DatosDelClub } from './club.service';
import { Contacto } from './contacto.service';
import { ElClub } from './el-club';

/**
 * La página del club. Hasta TV4.1 no tenía test; estos se escribieron antes de
 * cambiarle la forma, para que el rediseño no se llevara lo que sí hace: agrupar
 * las canchas del catálogo por techo y mostrar del contacto solo lo que el club
 * llenó.
 */
describe('ElClub', () => {
  let fixture: ComponentFixture<ElClub>;

  const cancha = (id: number, techada: boolean): Cancha =>
    ({ id, nombre: `Cancha ${id}`, superficie: 'CEMENTO', techada, iluminacion: true }) as Cancha;

  const VACIO: DatosDelClub = {
    nombre: 'FEDAL Tennis Center',
    direccion: '',
    telefono: '',
    email: '',
    latitud: null,
    longitud: null,
  };

  const montar = async (canchas: Cancha[], datos: DatosDelClub = VACIO) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Disponibilidad, useValue: { canchas: vi.fn().mockResolvedValue(canchas) } },
        { provide: Club, useValue: { datos: signal(datos), email: signal(datos.email) } },
        { provide: Contacto, useValue: { enviar: vi.fn() } },
      ],
    });

    fixture = TestBed.createComponent(ElClub);
    fixture.detectChanges();
    // Las tarifas, que son otro componente con su propio test, responden vacías:
    // sin respuesta la página nunca queda estable.
    const http = TestBed.inject(HttpTestingController);
    http.match('/api/tarifas').forEach((peticion) => peticion.flush([]));
    http.match('/api/horarios').forEach((peticion) => peticion.flush({ general: [], porCancha: [] }));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const seccion = (id: string) =>
    fixture.nativeElement.querySelector(`[aria-labelledby="${id}"]`) as HTMLElement;
  const texto = (id: string) => seccion(id).textContent?.replace(/\s+/g, ' ') ?? '';

  it('agrupa las canchas del catálogo en techadas y al aire libre, con cuántas hay', async () => {
    await montar([cancha(1, false), cancha(5, true), cancha(6, true)]);

    expect(texto('las-canchas')).toMatch(/2\s*techadas/i);
    expect(texto('las-canchas')).toMatch(/1\s*al aire libre/i);
    expect(texto('las-canchas')).toContain('Cancha 5');
  });

  it('un grupo sin canchas no se pinta', async () => {
    await montar([cancha(5, true), cancha(6, true)]);

    expect(texto('las-canchas')).not.toMatch(/al aire libre/i);
  });

  it('del contacto muestra solo lo que el club llenó', async () => {
    await montar([], { ...VACIO, telefono: '+56 2 2345 6789' });
    const contacto = seccion('horarios-y-contacto');

    expect(contacto.querySelector('a[href^="tel:"]')).not.toBeNull();
    expect(contacto.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  it('con el contacto en blanco no queda una ficha a medias', async () => {
    await montar([]);

    expect(texto('horarios-y-contacto')).toContain('Pregunta en el mesón');
  });

  // De main (PR #4): `value()` de un resource lanza en estado de error aunque
  // tenga `defaultValue`.
  it('si la API no responde, la página se pinta igual y lo dice en las tarifas', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: Disponibilidad,
          useValue: { canchas: () => Promise.reject(new Error('la API no respondió')) },
        },
      ],
    });

    const pagina = TestBed.createComponent(ElClub);
    pagina.detectChanges();
    // El club, las tarifas y los horarios van directo por HTTP.
    for (const peticion of TestBed.inject(HttpTestingController).match(() => true)) {
      peticion.flush('caída', { status: 500, statusText: 'Internal Server Error' });
    }
    await pagina.whenStable();
    pagina.detectChanges();

    const contenido = (pagina.nativeElement as HTMLElement).textContent ?? '';
    expect(contenido).toContain('Las canchas');
    expect(contenido).toContain('No se pudieron cargar las tarifas');
  });

  /** T101. El mapa, si el club cargó su ubicación (T100). */
  describe('el mapa', () => {
    const CON_UBICACION: DatosDelClub = { ...VACIO, latitud: -33.4372, longitud: -70.6506 };
    const mapa = () =>
      fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement | null;
    const enlace = (texto: string) =>
      Array.from(fixture.nativeElement.querySelectorAll('a') as NodeListOf<HTMLAnchorElement>).find(
        (a) => a.textContent?.includes(texto),
      );

    it('**con ubicación, el mapa de OpenStreetMap está en "Dónde encontrarnos"**', async () => {
      await montar([], CON_UBICACION);

      expect(seccion('horarios-y-contacto').contains(mapa())).toBe(true);
      expect(mapa()?.src).toContain('openstreetmap.org/export/embed.html');
      // Que se lea qué es, y que no se cargue hasta que se llegue a él.
      expect(mapa()?.title).toContain('FEDAL Tennis Center');
      expect(mapa()?.getAttribute('loading')).toBe('lazy');
    });

    it('ofrece cómo llegar con Google Maps y con Waze, en otra pestaña', async () => {
      await montar([], CON_UBICACION);

      expect(enlace('Google Maps')?.href).toContain('google.com/maps/dir/');
      expect(enlace('Waze')?.href).toContain('waze.com/ul');
      expect(enlace('Waze')?.target).toBe('_blank');
      expect(enlace('Waze')?.rel).toContain('noopener');
    });

    it('sin ubicación no hay mapa ni cómo llegar', async () => {
      await montar([]);

      expect(mapa()).toBeNull();
      expect(enlace('Cómo llegar')).toBeUndefined();
    });
  });
});
