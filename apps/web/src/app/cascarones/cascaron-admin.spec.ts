import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { Auth, UsuarioActual } from '../core/auth/auth';
import { routes } from '../app.routes';
import { CascaronAdmin } from './cascaron-admin';

/**
 * La barra lateral del panel.
 *
 * Lo que este archivo ataja: que la barra ofrezca una sección que no existe. Es
 * el error que la referencia de Stitch ya tiene —sus cinco pantallas de admin no
 * coinciden entre sí y varias listan módulos sin pantalla—, y acá se caza
 * comparando cada ítem contra las rutas de verdad.
 */
describe('Cascarón de administración', () => {
  const ADMIN: UsuarioActual = {
    id: 1,
    nombre: 'Rodrigo Torres',
    email: 'admin@clubdetenis.cl',
    esAdmin: true,
    socioId: null,
    socioActivo: false,
    socioAlDia: false,
    profesorId: null,
  };

  function montar() {
    const estado = signal<UsuarioActual | null>(ADMIN);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: Auth,
          useValue: {
            usuario: estado.asReadonly(),
            esAdmin: computed(() => estado()?.esAdmin === true),
            refrescar: () => Promise.resolve(),
            salir: () => Promise.resolve(),
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(CascaronAdmin);
    fixture.detectChanges();

    return fixture;
  }

  /** Las URL de la barra lateral de escritorio, en orden. */
  function itemsDeLaBarra(): string[] {
    const barra = (montar().nativeElement as HTMLElement).querySelector('aside');

    return [...barra!.querySelectorAll('nav a')].map(
      (enlace) => enlace.getAttribute('href') ?? '',
    );
  }

  /** Todas las URL que el router sabe dibujar, con su prefijo completo. */
  function urlsDelRouter(): string[] {
    return routes.flatMap((padre) =>
      (padre.children ?? []).map((hijo) => `/${hijo.path}`),
    );
  }

  it('lista las quince secciones que hoy tienen pantalla', () => {
    expect(itemsDeLaBarra()).toEqual([
      '/administracion/reservas',
      '/administracion/canchas',
      '/administracion/socios',
      '/administracion/ingreso',
      '/administracion/reportes',
      '/administracion/cuotas',
      '/administracion/morosos',
      '/administracion/clases',
      '/administracion/profesores',
      '/administracion/torneos',
      '/administracion/jugadores',
      '/administracion/partidos-internos',
      '/administracion/solicitudes',
      '/administracion/configuracion',
      '/estado',
    ]);
  });

  it('ningún ítem lleva a una ruta que no existe', () => {
    // Un ítem entra en la barra cuando existe su pantalla, no antes: uno que cae
    // en el comodín y devuelve al inicio miente peor que uno ausente.
    expect(urlsDelRouter()).toEqual(expect.arrayContaining(itemsDeLaBarra()));
  });

  it('cada ítem lleva su ícono oculto al lector de pantalla', () => {
    const barra = (montar().nativeElement as HTMLElement).querySelector('aside');
    const iconos = [...barra!.querySelectorAll('nav a .icono')];

    expect(iconos).toHaveLength(15);
    expect(iconos.every((i) => i.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  it('el pie identifica a quien tiene la sesión abierta', () => {
    const elemento = montar().nativeElement as HTMLElement;
    const pie = elemento.querySelector<HTMLButtonElement>(
      'aside button[aria-label="Opciones de Rodrigo Torres"]',
    );

    expect(pie).not.toBeNull();
    expect(pie!.textContent).toContain('admin@clubdetenis.cl');
  });

  it('el menú del pie ofrece salir y volver al sitio', () => {
    const fixture = montar();
    const elemento = fixture.nativeElement as HTMLElement;

    elemento
      .querySelector<HTMLButtonElement>(
        'aside button[aria-label="Opciones de Rodrigo Torres"]',
      )!
      .click();
    fixture.detectChanges();

    const textos = [...elemento.querySelectorAll('aside a, aside button')].map((e) =>
      e.textContent?.trim(),
    );

    expect(textos).toContain('Volver al sitio');
    expect(textos).toContain('Salir');
  });
});
