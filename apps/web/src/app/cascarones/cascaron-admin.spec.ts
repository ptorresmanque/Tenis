import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Auth, UsuarioActual } from '../core/auth/auth';
import { ConteoDePendientes, Pendientes } from '../core/pendientes';
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

  /** Lo que espera al admin, para los badges del menú (T301). */
  let pendientes: { conteo: ReturnType<typeof signal<ConteoDePendientes | undefined>>; recargar: ReturnType<typeof vi.fn> };

  function montar(
    usuario: UsuarioActual = ADMIN,
    conteo: ConteoDePendientes = { horasPorRevisar: 0, consultasSinAtender: 0 },
  ) {
    const estado = signal<UsuarioActual | null>(usuario);
    pendientes = { conteo: signal<ConteoDePendientes | undefined>(conteo), recargar: vi.fn() };

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
        { provide: Pendientes, useValue: pendientes },
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

  it('lista las trece secciones que hoy tienen pantalla, **en el orden de sus grupos** (T300, SPEC-panel.md D8)', () => {
    expect(itemsDeLaBarra()).toEqual([
      // Día a día
      '/administracion/reservas',
      '/administracion/clases',
      '/administracion/no-uso',
      // El club
      '/administracion/canchas',
      '/administracion/personas',
      '/administracion/finanzas',
      '/administracion/solicitudes',
      // Competencias
      '/administracion/torneos',
      '/administracion/tours',
      '/administracion/jugadores',
      '/administracion/partidos-internos',
      // Al pie
      '/administracion/configuracion',
      '/estado',
    ]);
  });

  describe('los grupos del menú (T300)', () => {
    const barra = (usuario: UsuarioActual = ADMIN) =>
      (montar(usuario).nativeElement as HTMLElement).querySelector('mat-sidenav nav')!;

    it('**cada grupo tiene su subtítulo**, y lo de al pie va tras una divisoria', () => {
      const nav = barra();

      expect([...nav.querySelectorAll('h2')].map((h) => h.textContent?.trim())).toEqual([
        'Día a día',
        'El club',
        'Competencias',
      ]);
      // La divisoria va justo antes de la lista del pie, la que empieza con Configuración.
      const divisoria = nav.querySelector('mat-divider')!;
      expect(divisoria.nextElementSibling?.querySelector('a')?.getAttribute('href')).toBe(
        '/administracion/configuracion',
      );
    });

    it('**con un solo grupo a la vista no hay subtítulos**: el gestor, el profesor, o los dos', () => {
      const NO_ADMIN = { ...ADMIN, esAdmin: false };

      expect(barra({ ...NO_ADMIN, esGestor: true }).querySelector('h2')).toBeNull();
      expect(barra({ ...NO_ADMIN, profesorId: 7 }).querySelector('h2')).toBeNull();
      expect(barra({ ...NO_ADMIN, esGestor: true, profesorId: 7 }).querySelector('h2')).toBeNull();
      expect(barra({ ...NO_ADMIN, esGestor: true }).querySelector('mat-divider')).toBeNull();
    });
  });

  describe('los badges de lo que espera (T301, SPEC-panel.md A10)', () => {
    /** El enlace del menú a esa sección. */
    const enlace = (elemento: HTMLElement, ruta: string) =>
      elemento.querySelector<HTMLAnchorElement>(`mat-sidenav nav a[href="${ruta}"]`)!;

    it('**Horas no usadas y Consultas al club dicen cuántas esperan**, y el lector oye qué son', () => {
      const elemento = montar(ADMIN, { horasPorRevisar: 3, consultasSinAtender: 1 })
        .nativeElement as HTMLElement;
      const horas = enlace(elemento, '/administracion/no-uso');
      const consultas = enlace(elemento, '/administracion/solicitudes');

      expect(horas.querySelector('.mat-badge-content')?.textContent?.trim()).toBe('3');
      expect(horas.querySelector('.sr-only')?.textContent).toBe(': 3 horas por revisar');
      expect(consultas.querySelector('.mat-badge-content')?.textContent?.trim()).toBe('1');
      expect(consultas.querySelector('.sr-only')?.textContent).toBe(': 1 consulta sin atender');
    });

    it('sin nada que esperar, no hay badge', () => {
      const elemento = montar(ADMIN, { horasPorRevisar: 0, consultasSinAtender: 0 })
        .nativeElement as HTMLElement;

      expect(elemento.querySelector('mat-sidenav nav .mat-badge-content')).toBeNull();
      expect(elemento.querySelector('mat-sidenav nav .sr-only')).toBeNull();
    });

    it('**en la sección que se está mirando, el badge se esconde**', async () => {
      const fixture = montar(ADMIN, { horasPorRevisar: 3, consultasSinAtender: 0 });
      await TestBed.inject(Router).navigateByUrl('/administracion/no-uso');
      await fixture.whenStable();
      fixture.detectChanges();
      const horas = enlace(fixture.nativeElement, '/administracion/no-uso');

      expect(horas.querySelector('.mat-badge')?.classList).toContain('mat-badge-hidden');
      expect(horas.querySelector('.sr-only')).toBeNull();
    });

    it('**después de cada navegación vuelve a contar**: lo resuelto baja al volver al menú', async () => {
      const fixture = montar();
      pendientes.recargar.mockClear();

      await TestBed.inject(Router).navigateByUrl('/administracion/finanzas');
      await fixture.whenStable();

      expect(pendientes.recargar).toHaveBeenCalledTimes(1);
    });
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
