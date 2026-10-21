import { Component, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ViewportScroller } from '@angular/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
    instagram: '',
    facebook: '',
    tiktok: '',
    youtube: '',
    whatsapp: '',
    elClubTitulo: 'FEDAL Tennis Center',
    elClubBajada: 'Un club de barrio con canchas de torneo.',
    elClubCanchas: 'Todas de superficie dura.',
    tienda: { descripcion: '', horario: '', whatsapp: '', fotos: [] },
    cafeteria: { descripcion: '', horario: '', whatsapp: '', fotos: [] },
    gimnasio: { descripcion: '', horario: '', whatsapp: '', fotos: [], tarifas: [] },
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

  // P2 y P4 (SPEC-sitio.md, Decimoséptima parte).
  // T357 (SPEC-seo.md A8): el club para Google, con los mismos datos que la página.
  it('**publica el club en el <head> y lo quita al salir**', async () => {
    const bloque = () => document.head.querySelector('script[type="application/ld+json"]');
    await montar([], { ...VACIO, direccion: 'Lircay lt 42, Temuco' });

    expect(JSON.parse(bloque()?.textContent ?? '{}')).toMatchObject({
      '@type': 'SportsActivityLocation',
      name: 'FEDAL Tennis Center',
      address: { streetAddress: 'Lircay lt 42, Temuco' },
    });

    fixture.destroy();
    expect(bloque()).toBeNull();
  });

  it('el paso 2 dice cómo reserva cada uno, y el botón del final es «Reservar cancha»', async () => {
    await montar([]);
    const reservar = [...fixture.nativeElement.querySelectorAll('a')].find(
      (a: HTMLAnchorElement) => a.textContent?.trim() === 'Reservar cancha',
    ) as HTMLAnchorElement | undefined;

    expect(texto('como-funciona')).toContain(
      'Si eres socio, confirmas y listo. Si no, pagas en línea con Webpay y la hora queda tuya al tiro.',
    );
    expect(reservar?.getAttribute('href')).toBe('/disponibilidad');
  });

  it('**la foto de arriba es la cancha con el logo** (T305, SPEC-sitio.md D7)', async () => {
    await montar([]);
    const foto = seccion('el-club').querySelector<HTMLImageElement>('img')!;

    expect(foto.getAttribute('src')).toContain('/fotos/portada.jpg');
    expect(foto.alt).toContain('logo de FEDAL');
  });

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

  it('las redes del club están en "Dónde encontrarnos" (T141)', async () => {
    await montar([], { ...VACIO, instagram: 'https://www.instagram.com/fedaltennis' });
    const contacto = seccion('horarios-y-contacto');

    expect(
      contacto.querySelector('a[href="https://www.instagram.com/fedaltennis"]')?.textContent,
    ).toContain('Instagram de FEDAL Tennis Center');
  });

  describe('los textos que escribe el club (T143)', () => {
    const hero = () => seccion('el-club');

    it('el título y la bajada sobre la foto, y el párrafo de las canchas', async () => {
      await montar([], {
        ...VACIO,
        elClubTitulo: 'El club de Ñuñoa',
        elClubBajada: 'Abierto todos los días.',
        elClubCanchas: 'Ocho canchas duras.',
      });

      expect(hero().querySelector('h1')?.textContent?.trim()).toBe('El club de Ñuñoa');
      expect(hero().querySelector('p')?.textContent?.trim()).toBe('Abierto todos los días.');
      expect(texto('las-canchas')).toContain('Ocho canchas duras.');
    });

    it('**una bajada vacía no deja un párrafo vacío**', async () => {
      await montar([], { ...VACIO, elClubBajada: '', elClubCanchas: '' });

      expect(hero().querySelector('p')).toBeNull();
      expect(seccion('las-canchas').querySelector('h2 + p')).toBeNull();
    });

    it('el HTML se ve como texto: el panel escribe texto plano', async () => {
      await montar([], { ...VACIO, elClubBajada: 'Con <b>negrita</b>' });

      expect(hero().querySelector('b')).toBeNull();
      expect(hero().querySelector('p')?.textContent).toContain('Con <b>negrita</b>');
    });
  });

  it('antes del formulario de contacto, enlaza las preguntas frecuentes (T146)', async () => {
    await montar([]);

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('a[href="/preguntas-frecuentes"]'),
    ).not.toBeNull();
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

  it('mientras llegan las canchas, su banda muestra el esqueleto (T152)', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: Disponibilidad,
          useValue: { canchas: () => new Promise<never>(() => undefined) },
        },
        { provide: Club, useValue: { datos: signal(VACIO), email: signal('') } },
        { provide: Contacto, useValue: { enviar: vi.fn() } },
      ],
    });

    fixture = TestBed.createComponent(ElClub);
    fixture.detectChanges();

    expect(seccion('las-canchas').querySelector('app-esqueleto')).not.toBeNull();
  });

  /**
   * «Hazte socio» y «Quiero ser socio» llevan a `/el-club#titulo-contacto`. El router salta al
   * ancla al llegar, pero arriba del formulario todavía cargan las canchas y las tarifas: Chrome
   * y Firefox corrigen el salto solos (scroll anchoring) y Safari no, así que en un iPhone se
   * quedaba en las tarifas. Medido sin anchoring, el formulario quedaba en y = 993 de 812.
   */
  describe('llegar con un ancla', () => {
    interface Observador {
      alCambiar: () => void;
      mirados: Element[];
      desconectado: boolean;
    }
    let observadores: Observador[];

    /** Adonde se va después: salir de la página destruye el componente. */
    @Component({ template: '' })
    class OtraPagina {}

    // Aquí y no al final de cada prueba: si una falla, el stub y el reloj falso no se quedan
    // puestos para las que siguen.
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    const llegar = async (url: string) => {
      observadores = [];
      vi.stubGlobal(
        'ResizeObserver',
        class {
          readonly mirados: Element[] = [];
          desconectado = false;
          constructor(readonly alCambiar: () => void) {
            observadores.push(this);
          }
          observe(elemento: Element) {
            this.mirados.push(elemento);
          }
          disconnect() {
            this.desconectado = true;
          }
          // Material también lo usa, en sus campos: ahí no hay nada que soltar.
          unobserve() {
            return undefined;
          }
        },
      );
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideRouter([
            { path: 'el-club', component: ElClub },
            { path: 'otra', component: OtraPagina },
          ]),
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: Disponibilidad, useValue: { canchas: vi.fn().mockResolvedValue([]) } },
          { provide: Club, useValue: { datos: signal(VACIO), email: signal('') } },
          { provide: Contacto, useValue: { enviar: vi.fn() } },
        ],
      });
      // Sin llamar al de verdad: jsdom no implementa scrollTo y lo avisa en cada corrida.
      const anclar = vi
        .spyOn(TestBed.inject(ViewportScroller), 'scrollToAnchor')
        .mockImplementation(() => undefined);
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(url, ElClub);
      harness.detectChanges();
      return {
        harness,
        anclar,
        delCuerpo: () => observadores.find((o) => o.mirados.includes(document.body)),
      };
    };

    it('**mientras la página crece, vuelve a buscar el ancla**', async () => {
      const { anclar, delCuerpo } = await llegar('/el-club#titulo-contacto');

      delCuerpo()!.alCambiar();

      expect(anclar).toHaveBeenCalledWith('titulo-contacto');
    });

    // La rueda, el dedo, el mouse o el lápiz, y el teclado: cualquiera es la persona tomando
    // el control.
    it.each(['wheel', 'pointerdown', 'keydown'])(
      '**apenas la persona mueve la página (%s), la deja tranquila**',
      async (gesto) => {
        const { delCuerpo } = await llegar('/el-club#titulo-contacto');

        window.dispatchEvent(new Event(gesto));

        expect(delCuerpo()!.desconectado).toBe(true);
      },
    );

    it('**a los 10 segundos la suelta sola**, aunque nadie toque nada', async () => {
      // El reloj falso antes de navegar, porque el plazo se arma al pintar. `shouldAdvanceTime`
      // deja que el reloj siga andando solo, y así el router termina de navegar.
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const { delCuerpo } = await llegar('/el-club#titulo-contacto');

      vi.advanceTimersByTime(9_000);
      expect(delCuerpo()!.desconectado).toBe(false);

      vi.advanceTimersByTime(1_000);
      expect(delCuerpo()!.desconectado).toBe(true);
    });

    it('**al irse a otra página la suelta**, y sus gestos dejan de escucharse', async () => {
      const { harness, delCuerpo } = await llegar('/el-club#titulo-contacto');
      const quitar = vi.spyOn(window, 'removeEventListener');

      await harness.navigateByUrl('/otra', OtraPagina);

      expect(delCuerpo()!.desconectado).toBe(true);
      for (const gesto of ['wheel', 'pointerdown', 'keydown']) {
        expect(quitar).toHaveBeenCalledWith(gesto, expect.any(Function));
      }
    });

    it('sin ancla no mira nada', async () => {
      const { delCuerpo } = await llegar('/el-club');

      expect(delCuerpo()).toBeUndefined();
    });
  });
});
