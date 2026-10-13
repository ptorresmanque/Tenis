import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { Club, FotoDelLugar, GimnasioDelClub, LugarDelClub } from './club.service';
import { TiendaYCafeteria } from './tienda-y-cafeteria';

/**
 * T186. La tienda y la cafetería en la portada (`resumen`) y en «El club» (`completa`).
 * El sitio no vende nada: cuenta qué son, cuándo atienden y cómo escribirles. Desde T237,
 * también el gimnasio, con sus tarifas.
 */
describe('TiendaYCafeteria', () => {
  const foto = (id: number, descripcion: string | null = null): FotoDelLugar => ({
    id,
    descripcion,
    miniatura: `/api/club/fotos/${id}/miniatura`,
    imagen: `/api/club/fotos/${id}/imagen`,
  });

  const VACIO: LugarDelClub = { descripcion: '', horario: '', whatsapp: '', fotos: [] };

  const TIENDA: LugarDelClub = {
    descripcion: 'Raquetas, cuerdas y zapatillas.',
    horario: 'Lunes a sábado de 9:00 a 20:00',
    whatsapp: '56987654321',
    fotos: [foto(1, 'La vitrina de raquetas'), foto(2), foto(3)],
  };

  const CAFETERIA: LugarDelClub = {
    descripcion: 'Café, jugos y sándwiches.',
    horario: '',
    whatsapp: '',
    fotos: [foto(4)],
  };

  const GIMNASIO: GimnasioDelClub = {
    descripcion: 'Máquinas, pesas y clases de preparación física.',
    horario: 'Lunes a viernes de 7:00 a 21:00',
    whatsapp: '56911112222',
    fotos: [foto(5)],
    tarifas: [
      { nombre: 'Clase grupal', precioSocioClp: 5000, precioNoSocioClp: 8000 },
      { nombre: 'Pase diario', precioSocioClp: 3000, precioNoSocioClp: 4500 },
    ],
  };

  const SIN_GIMNASIO: GimnasioDelClub = { ...VACIO, tarifas: [] };

  const montar = async (
    forma: 'resumen' | 'completa',
    lugares: {
      tienda?: LugarDelClub;
      cafeteria?: LugarDelClub;
      gimnasio?: GimnasioDelClub;
    } = {},
  ) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: Club,
          useValue: {
            datos: signal({
              tienda: lugares.tienda ?? TIENDA,
              cafeteria: lugares.cafeteria ?? CAFETERIA,
              gimnasio: lugares.gimnasio ?? GIMNASIO,
            }),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(TiendaYCafeteria);
    fixture.componentRef.setInput('forma', forma);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  /** El bloque de un lugar, por el nombre de su rótulo. */
  const lugar = (elemento: HTMLElement, nombre: string) =>
    Array.from(elemento.querySelectorAll('article')).find((a) =>
      a.querySelector('h3')?.textContent?.includes(nombre),
    );

  describe('en la portada', () => {
    it('una tarjeta por lugar, bajo «También en el club»', async () => {
      const elemento = await montar('resumen');

      expect(elemento.querySelector('h2')?.textContent).toContain('También en el club');
      expect(
        Array.from(elemento.querySelectorAll('h3')).map((h) => h.textContent?.trim()),
      ).toEqual(['Tienda', 'Cafetería', 'Gimnasio']);
    });

    it('**muestra la primera foto**, en su versión grande, con su texto', async () => {
      const elemento = await montar('resumen');
      const imagenes = lugar(elemento, 'Tienda')!.querySelectorAll('img');

      expect(imagenes).toHaveLength(1);
      expect(imagenes[0].getAttribute('src')).toBe('/api/club/fotos/1/imagen');
      expect(imagenes[0].alt).toBe('La vitrina de raquetas');
    });

    it('sin texto de la foto, dice de qué lugar es', async () => {
      const elemento = await montar('resumen');

      expect(lugar(elemento, 'Cafetería')!.querySelector('img')!.alt).toBe(
        'Foto de la cafetería del club',
      );
    });

    it('la descripción y el horario, con los saltos de línea y sin interpretar HTML', async () => {
      const elemento = await montar('resumen', {
        tienda: { ...TIENDA, descripcion: 'Raquetas <b>Head</b>\ny cuerdas.' },
      });
      const tienda = lugar(elemento, 'Tienda')!;

      expect(tienda.textContent).toContain('Raquetas <b>Head</b>');
      expect(tienda.querySelector('b')).toBeNull();
      expect(tienda.textContent).toContain('Lunes a sábado de 9:00 a 20:00');
    });

    it('**el WhatsApp abre con un mensaje que dice desde dónde escriben**', async () => {
      const elemento = await montar('resumen');
      const enlace = lugar(elemento, 'Tienda')!.querySelector<HTMLAnchorElement>(
        'a[href^="https://wa.me/"]',
      )!;

      expect(enlace.getAttribute('href')).toBe(
        'https://wa.me/56987654321?text=' +
          encodeURIComponent('Hola, quería consultar por la tienda del club.'),
      );
      expect(enlace.target).toBe('_blank');
      // El nombre entero en aria-label y empezando por lo que se ve (WCAG 2.5.3).
      expect(enlace.getAttribute('aria-label')).toBe(
        'Escribir por WhatsApp a la tienda (se abre en otra pestaña)',
      );
    });

    it('sin WhatsApp no hay botón, y sin horario no hay línea vacía', async () => {
      const elemento = await montar('resumen');
      const cafeteria = lugar(elemento, 'Cafetería')!;

      expect(cafeteria.querySelector('a[href^="https://wa.me/"]')).toBeNull();
      expect(cafeteria.querySelector('[data-horario]')).toBeNull();
    });

    it('**las demás fotos están en «El club»**, y el enlace dice cuántas', async () => {
      const elemento = await montar('resumen');
      const enlace = Array.from(lugar(elemento, 'Tienda')!.querySelectorAll('a')).find((a) =>
        a.textContent?.includes('fotos'),
      );

      expect(enlace?.textContent).toContain('Ver las 3 fotos');
      expect(enlace?.getAttribute('href')).toBe('/el-club#tienda-y-cafeteria');
      // Con una sola foto, la portada ya la muestra entera: no hay a dónde mandar.
      expect(lugar(elemento, 'Cafetería')!.textContent).not.toContain('Ver las');
    });
  });

  describe('qué aparece', () => {
    it('**un lugar sin descripción no aparece**, aunque tenga fotos', async () => {
      const elemento = await montar('resumen', {
        cafeteria: { ...VACIO, fotos: [foto(9)] },
      });

      expect(lugar(elemento, 'Tienda')).toBeDefined();
      expect(lugar(elemento, 'Cafetería')).toBeUndefined();
    });

    it('**sin ninguno, no dibuja nada**: ni el título ni la sección', async () => {
      for (const forma of ['resumen', 'completa'] as const) {
        const elemento = await montar(forma, {
          tienda: VACIO,
          cafeteria: VACIO,
          gimnasio: SIN_GIMNASIO,
        });

        expect(elemento.querySelector('section')).toBeNull();
      }
    });

    it('un lugar sin fotos se muestra igual, sin imagen', async () => {
      const elemento = await montar('resumen', { tienda: { ...TIENDA, fotos: [] } });

      expect(lugar(elemento, 'Tienda')!.querySelector('img')).toBeNull();
      expect(lugar(elemento, 'Tienda')!.textContent).toContain('Raquetas');
    });
  });

  describe('en «El club»', () => {
    it('la sección tiene su ancla, para el enlace de la portada', async () => {
      const elemento = await montar('completa');

      expect(elemento.querySelector('section')?.id).toBe('tienda-y-cafeteria');
      expect(elemento.querySelector('h2')?.textContent).toContain(
        'Tienda, cafetería y gimnasio',
      );
    });

    it('el título nombra los lugares que aparecen', async () => {
      const elemento = await montar('completa', { gimnasio: SIN_GIMNASIO });

      expect(elemento.querySelector('h2')?.textContent?.trim()).toBe('Tienda y cafetería');
    });

    it('**todas las fotos, en miniatura**, en la galería de cada lugar', async () => {
      const elemento = await montar('completa');
      const fuentes = Array.from(lugar(elemento, 'Tienda')!.querySelectorAll('img')).map((i) =>
        i.getAttribute('src'),
      );

      expect(fuentes).toEqual([
        '/api/club/fotos/1/miniatura',
        '/api/club/fotos/2/miniatura',
        '/api/club/fotos/3/miniatura',
      ]);
    });

    it('sin enlace a sí misma', async () => {
      const elemento = await montar('completa');

      expect(elemento.textContent).not.toContain('Ver las');
    });
  });

  /** T237. El gimnasio, un tercer lugar con sus tarifas en pesos. */
  describe('el gimnasio', () => {
    it('**sus tarifas en pesos, para socio y no socio, debajo del horario** (G1)', async () => {
      const elemento = await montar('resumen');
      const gimnasio = lugar(elemento, 'Gimnasio')!;
      const tabla = gimnasio.querySelector('table')!;
      const filas = Array.from(tabla.querySelectorAll('tr')).map((tr) =>
        Array.from(tr.querySelectorAll('th, td')).map((c) => c.textContent?.trim()),
      );

      expect(filas).toEqual([
        ['Plan', 'Socio', 'No socio'],
        ['Clase grupal', '$5.000', '$8.000'],
        ['Pase diario', '$3.000', '$4.500'],
      ]);
      expect(
        gimnasio.querySelector('[data-horario]')!.compareDocumentPosition(tabla) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('también en «El club»', async () => {
      const elemento = await montar('completa');

      expect(lugar(elemento, 'Gimnasio')!.querySelector('table')?.textContent).toContain(
        'Clase grupal',
      );
    });

    it('**sin descripción no aparece**, aunque tenga tarifas', async () => {
      const elemento = await montar('resumen', {
        gimnasio: { ...SIN_GIMNASIO, tarifas: GIMNASIO.tarifas },
      });

      expect(lugar(elemento, 'Gimnasio')).toBeUndefined();
    });

    it('sin tarifas no hay tabla vacía', async () => {
      const elemento = await montar('resumen', { gimnasio: { ...GIMNASIO, tarifas: [] } });

      expect(lugar(elemento, 'Gimnasio')!.querySelector('table')).toBeNull();
    });

    it('su foto y su WhatsApp dicen «del gimnasio» y «al gimnasio»', async () => {
      const gimnasio = lugar(await montar('resumen'), 'Gimnasio')!;
      const enlace = gimnasio.querySelector<HTMLAnchorElement>('a[href^="https://wa.me/"]')!;

      expect(gimnasio.querySelector('img')!.alt).toBe('Foto del gimnasio del club');
      expect(enlace.getAttribute('aria-label')).toBe(
        'Escribir por WhatsApp al gimnasio (se abre en otra pestaña)',
      );
      expect(enlace.getAttribute('href')).toContain(
        encodeURIComponent('Hola, quería consultar por el gimnasio del club.'),
      );
    });

    it('**en la portada, con los tres, las tarjetas van en tres columnas desde lg**', async () => {
      const conTres = await montar('resumen');
      expect(conTres.querySelector('section .grid')!.className).toContain('lg:grid-cols-3');

      const conDos = await montar('resumen', { gimnasio: SIN_GIMNASIO });
      expect(conDos.querySelector('section .grid')!.className).not.toContain('lg:grid-cols-3');
    });
  });
});
