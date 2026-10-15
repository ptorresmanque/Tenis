import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
    apellido: '',
    email: 'admin@clubdetenis.cl',
    telefono: null,
    esAdmin: true,
    esGestor: false,
    socioId: null,
    socioActivo: false,
    socioAlDia: false,
    profesorId: null,
  };

  function montar(usuario: UsuarioActual = ADMIN) {
    const estado = signal<UsuarioActual | null>(usuario);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        // Un comodín vacío: elegir una sección navega, y sin rutas el router lo rechaza.
        provideRouter([{ path: '**', children: [] }]),
        {
          provide: Auth,
          useValue: {
            usuario: estado.asReadonly(),
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

  /** Las URL de la barra lateral, en orden. */
  function itemsDeLaBarra(usuario: UsuarioActual = ADMIN): string[] {
    const barra = (montar(usuario).nativeElement as HTMLElement).querySelector(
      'mat-sidenav',
    );

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

  it('dice cuando una página tarda en cargar (T151)', () => {
    const elemento = montar().nativeElement as HTMLElement;

    expect(elemento.querySelector('app-progreso-de-navegacion')).not.toBeNull();
  });

  it('lista las trece secciones que hoy tienen pantalla (pestañas: la ocupación en la agenda, T285; Finanzas, T286; las horas reportadas, T287; Personas, T296)', () => {
    expect(itemsDeLaBarra()).toEqual([
      '/administracion/reservas',
      '/administracion/canchas',
      '/administracion/personas',
      '/administracion/finanzas',
      '/administracion/no-uso',
      '/administracion/clases',
      '/administracion/torneos',
      '/administracion/tours',
      '/administracion/jugadores',
      '/administracion/partidos-internos',
      '/administracion/solicitudes',
      '/administracion/configuracion',
      '/estado',
    ]);
  });

  describe('según el tipo (T220)', () => {
    const NO_ADMIN = { ...ADMIN, esAdmin: false };

    it('el gestor ve solo la agenda del día, y el profesor solo Clases', () => {
      expect(itemsDeLaBarra({ ...NO_ADMIN, esGestor: true })).toEqual([
        '/administracion/reservas',
      ]);
      expect(itemsDeLaBarra({ ...NO_ADMIN, profesorId: 7 })).toEqual([
        '/administracion/clases',
      ]);
    });

    it('quien tiene los dos tipos ve los dos', () => {
      expect(
        itemsDeLaBarra({ ...NO_ADMIN, esGestor: true, profesorId: 7 }),
      ).toEqual(['/administracion/reservas', '/administracion/clases']);
    });

    it('el logotipo lleva a la portada de cada uno', () => {
      const elemento = montar({ ...NO_ADMIN, profesorId: 7 })
        .nativeElement as HTMLElement;

      const destinos = [...elemento.querySelectorAll('app-logotipo a')].map(
        (a) => a.getAttribute('href'),
      );

      expect(destinos.length).toBeGreaterThan(0);
      expect(destinos.every((d) => d === '/administracion/clases')).toBe(true);
    });
  });

  it('ningún ítem lleva a una ruta que no existe', () => {
    // Un ítem entra en la barra cuando existe su pantalla, no antes: uno que cae
    // en el comodín y devuelve al inicio miente peor que uno ausente.
    expect(urlsDelRouter()).toEqual(expect.arrayContaining(itemsDeLaBarra()));
  });

  it('cada ítem lleva su ícono oculto al lector de pantalla', () => {
    const barra = (montar().nativeElement as HTMLElement).querySelector('mat-sidenav');
    const iconos = [...barra!.querySelectorAll('nav a mat-icon')];

    // 13 desde T296: Personas reemplaza a Socios, Usuarios y Profesores.
    expect(iconos).toHaveLength(13);
    expect(iconos.every((i) => i.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  it('el pie dice quién tiene la sesión abierta y qué es en el club (T276)', () => {
    const elemento = montar({ ...ADMIN, socioId: 4 }).nativeElement as HTMLElement;
    const pie = elemento.querySelector<HTMLButtonElement>(
      'mat-sidenav button[aria-label="Opciones de Rodrigo Torres"]',
    );

    expect(pie).not.toBeNull();
    expect(pie!.textContent).toContain('Rodrigo Torres');
    expect(pie!.textContent?.replace(/\s+/g, ' ')).toContain('Administrador · Socio');
  });

  it('el menú del pie ofrece salir y volver al sitio', () => {
    const fixture = montar();
    const elemento = fixture.nativeElement as HTMLElement;

    elemento
      .querySelector<HTMLButtonElement>(
        'mat-sidenav button[aria-label="Opciones de Rodrigo Torres"]',
      )!
      .click();
    fixture.detectChanges();

    // Es un mat-menu (T261): sus ítems se dibujan en el overlay, no en la barra.
    const textos = [
      ...document.querySelectorAll('.mat-mdc-menu-panel a, .mat-mdc-menu-panel button'),
    ].map((e) => e.textContent?.trim());

    expect(textos).toContain('Volver al sitio');
    expect(textos).toContain('Salir');
  });

  describe('la barra es un mat-sidenav (T260)', () => {
    afterEach(() => vi.unstubAllGlobals());

    /** El ancho del escritorio, como lo ve `BreakpointObserver`. */
    const enEscritorio = () =>
      vi.stubGlobal('matchMedia', (media: string) => ({
        matches: media.includes('min-width: 768px'),
        media,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }));

    const abierta = (elemento: HTMLElement) =>
      elemento.querySelector('mat-sidenav')!.classList.contains('mat-drawer-opened');

    it('**en el teléfono se abre con su botón, y al cerrarse el foco vuelve a él**', async () => {
      const fixture = montar();
      const elemento = fixture.nativeElement as HTMLElement;
      document.body.appendChild(elemento);
      const abrir = elemento.querySelector<HTMLButtonElement>(
        'button[aria-label="Abrir el menú de administración"]',
      )!;

      expect(abierta(elemento)).toBe(false);

      abrir.focus();
      abrir.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(abierta(elemento)).toBe(true);

      elemento.querySelector<HTMLButtonElement>('button[aria-label="Cerrar el menú"]')!.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(abierta(elemento)).toBe(false);
      expect(document.activeElement).toBe(abrir);
      elemento.remove();
    });

    it('en el teléfono, elegir una sección cierra el menú', async () => {
      const fixture = montar();
      const elemento = fixture.nativeElement as HTMLElement;

      elemento.querySelector<HTMLButtonElement>('button[aria-label="Abrir el menú de administración"]')!.click();
      await fixture.whenStable();
      fixture.detectChanges();
      elemento.querySelector<HTMLAnchorElement>('mat-sidenav nav a')!.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(abierta(elemento)).toBe(false);
    });

    it('**en el escritorio queda fija**: abierta, al lado del contenido y sin botón de menú', async () => {
      enEscritorio();
      const fixture = montar();
      await fixture.whenStable();
      fixture.detectChanges();
      const elemento = fixture.nativeElement as HTMLElement;

      expect(abierta(elemento)).toBe(true);
      expect(elemento.querySelector('mat-sidenav')!.classList).toContain('mat-drawer-side');
      expect(elemento.querySelector('button[aria-label="Abrir el menú de administración"]')).toBeNull();
      expect(elemento.querySelector('button[aria-label="Cerrar el menú"]')).toBeNull();
    });
  });
});
