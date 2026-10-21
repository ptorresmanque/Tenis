import { signal } from '@angular/core';
import { ComponentFixture, DeferBlockState, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { Club, DatosDelClub } from '../club/club.service';
import { Auth, UsuarioActual } from '../core/auth/auth';
import { CascaronPublico } from './cascaron-publico';

/**
 * T27, ampliado en la fase 2 del diseño FEDAL.
 *
 * La barra de navegación tiene que decir la verdad sobre quién está mirando:
 * ofrecerle "Crear cuenta" a quien ya entró es una invitación a un formulario
 * que no le sirve.
 *
 * Lo que cambió con el rediseño: el sitio público **se ve igual para todos**.
 * Los cinco enlaces del panel que antes se colaban en esta barra se fueron a la
 * barra lateral de administración, y la puerta de entrada quedó en el menú del
 * avatar. Los dos casos —que no estén en la barra, que sí estén en el menú—
 * están probados abajo, porque esconderlos de más deja al admin sin panel.
 */
describe('Cascarón público: la navegación', () => {
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

  const SOCIA: UsuarioActual = {
    ...ADMIN,
    id: 2,
    nombre: 'Camila Rojas',
    email: 'camila@clubdetenis.cl',
    esAdmin: false,
    socioId: 7,
    socioActivo: true,
    socioAlDia: true,
  };

  function montarCon(
    usuario: UsuarioActual | null,
    club?: DatosDelClub,
  ): ComponentFixture<CascaronPublico> {
    const estado = signal(usuario);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        // Un comodín vacío: elegir una sección navega, y sin rutas el router lo rechaza.
        provideRouter([{ path: '**', children: [] }]),
        ...(club ? [{ provide: Club, useValue: { datos: signal(club) } }] : []),
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

    const fixture = TestBed.createComponent(CascaronPublico);
    fixture.detectChanges();

    return fixture;
  }

  /** Montado y con los bloques @defer dibujados: el menú de la cuenta, la barra de progreso y el
      cajón del teléfono llegan al quedar libre el navegador (T261–T263), y en la prueba no hay
      que esperarlos. */
  async function montarConElMenu(usuario: UsuarioActual): Promise<ComponentFixture<CascaronPublico>> {
    const fixture = montarCon(usuario);
    for (const bloque of await fixture.getDeferBlocks()) {
      await bloque.render(DeferBlockState.Complete);
    }
    fixture.detectChanges();

    return fixture;
  }

  /** Lo que se lee en la barra de arriba, tal como lo lee quien mira. */
  function enlacesCon(usuario: UsuarioActual | null): string[] {
    const elemento = montarCon(usuario).nativeElement as HTMLElement;

    return [...elemento.querySelectorAll('header a')].map(
      (enlace) => enlace.textContent?.trim() ?? '',
    );
  }

  it('el pie enlaza la política de privacidad, con sesión o sin ella', () => {
    // La Ley 21.719 pide que la política esté a la vista, y Google la busca en el
    // sitio antes de aprobar el login. El pie está en todas las páginas públicas.
    for (const usuario of [null, SOCIA]) {
      const pie = (montarCon(usuario).nativeElement as HTMLElement).querySelector('footer');

      expect(pie?.querySelector('a[href="/privacidad"]')?.textContent).toContain(
        'Política de privacidad',
      );
    }
  });

  it('el pie muestra las redes que el club cargó (T141)', () => {
    const pie = (
      montarCon(null, {
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
        whatsapp: '56987654321',
        elClubTitulo: 'FEDAL Tennis Center',
        elClubBajada: '',
        elClubCanchas: '',
        tienda: { descripcion: '', horario: '', whatsapp: '', fotos: [] },
        cafeteria: { descripcion: '', horario: '', whatsapp: '', fotos: [] },
        gimnasio: { descripcion: '', horario: '', whatsapp: '', fotos: [], tarifas: [] },
      }).nativeElement as HTMLElement
    ).querySelector('footer');

    expect(pie?.querySelector('a[href="https://wa.me/56987654321"]')?.textContent).toContain(
      'WhatsApp de FEDAL Tennis Center',
    );
  });

  it('**el primer enlace es «Reservar»**, y lleva a la grilla (P3)', () => {
    const elemento = montarCon(null).nativeElement as HTMLElement;
    const primero = elemento.querySelector<HTMLAnchorElement>('header nav a');

    expect(primero?.textContent?.trim()).toBe('Reservar');
    expect(primero?.getAttribute('href')).toBe('/disponibilidad');
  });

  it('el pie cuenta cómo son las canchas (P5)', () => {
    const pie = (montarCon(null).nativeElement as HTMLElement).querySelector('footer');

    expect(pie?.textContent.replace(/\s+/g, ' ')).toContain(
      'Canchas de cemento techadas y al aire libre, con luz para jugar de noche. Reserva en línea.',
    );
  });

  describe('la dirección del pie (T341, M4)', () => {
    const CLUB: DatosDelClub = {
      nombre: 'FEDAL Tennis Center',
      direccion: 'Lircay lt 42, Temuco, Chile',
      telefono: '',
      email: '',
      latitud: -38.7,
      longitud: -72.6,
      instagram: '',
      facebook: '',
      tiktok: '',
      youtube: '',
      whatsapp: '',
      elClubTitulo: 'FEDAL Tennis Center',
      elClubBajada: '',
      elClubCanchas: '',
      tienda: { descripcion: '', horario: '', whatsapp: '', fotos: [] },
      cafeteria: { descripcion: '', horario: '', whatsapp: '', fotos: [] },
      gimnasio: { descripcion: '', horario: '', whatsapp: '', fotos: [], tarifas: [] },
    };
    const direccion = (club: DatosDelClub) =>
      [...(montarCon(null, club).nativeElement as HTMLElement).querySelectorAll('footer li')].find(
        (li) => li.textContent?.includes('Lircay'),
      );

    it('**abre Google Maps en el punto del mapa del club**, en otra pestaña', () => {
      const enlace = direccion(CLUB)?.querySelector('a');

      expect(enlace?.getAttribute('href')).toBe(
        'https://www.google.com/maps/search/?api=1&query=-38.700000,-72.600000',
      );
      expect(enlace?.getAttribute('target')).toBe('_blank');
      expect(enlace?.textContent).toContain('(se abre en otra pestaña)');
    });

    it('sin coordenadas cargadas es texto: no hay punto al que llevar (B6)', () => {
      const li = direccion({ ...CLUB, latitud: null, longitud: null });

      expect(li?.textContent?.trim()).toBe('Lircay lt 42, Temuco, Chile');
      expect(li?.querySelector('a')).toBeNull();
    });
  });

  it('el pie enlaza las preguntas frecuentes (T146)', () => {
    const pie = (montarCon(null).nativeElement as HTMLElement).querySelector('footer');

    expect(pie?.querySelector('a[href="/preguntas-frecuentes"]')?.textContent).toContain(
      'Preguntas frecuentes',
    );
  });

  it('dice cuando una página tarda en cargar (T151)', async () => {
    const elemento = (await montarConElMenu(ADMIN)).nativeElement as HTMLElement;

    expect(elemento.querySelector('app-progreso-de-navegacion')).not.toBeNull();
  });

  it('el sitio público tiene "Volver arriba", y el contenido puede recibir su foco (T149)', () => {
    const elemento = montarCon(null).nativeElement as HTMLElement;

    expect(elemento.querySelector('app-volver-arriba')).not.toBeNull();
    // tabindex -1: el foco puede llegar por programa sin que main entre al orden de Tab.
    expect(elemento.querySelector('main#contenido')?.getAttribute('tabindex')).toBe('-1');
  });

  /** T276. Quién tiene la sesión y qué es en el club, a la vista (A6). */
  it('**junto al avatar, el nombre y todos los tipos de la cuenta**', () => {
    const cuenta = () =>
      (montarCon({ ...SOCIA, esAdmin: true }).nativeElement as HTMLElement).querySelector(
        '[data-cuenta]',
      );

    expect(cuenta()?.textContent).toContain('Camila Rojas');
    expect(cuenta()?.textContent?.replace(/\s+/g, ' ')).toContain('Administrador · Socio');
  });

  it('una cuenta sin tipos dice «Invitado»', () => {
    const elemento = montarCon({ ...SOCIA, socioId: null }).nativeElement as HTMLElement;

    expect(elemento.querySelector('[data-cuenta]')?.textContent).toContain('Invitado');
  });

  it('en el teléfono, los tipos van dentro del menú de la cuenta', async () => {
    const fixture = await montarConElMenu(SOCIA);
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('header button[aria-label="Menú de Camila Rojas"]')!
      .click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.querySelector('.mat-mdc-menu-panel')?.textContent).toContain('Socio');
  });

  it('le ofrece crear cuenta a quien no ha entrado', () => {
    expect(enlacesCon(null)).toContain('Crear cuenta');
  });

  it('no le ofrece crear cuenta a quien ya tiene sesión', () => {
    expect(enlacesCon(SOCIA)).not.toContain('Crear cuenta');
  });

  it('a la socia le muestra su cuenta y nada del panel', () => {
    // La segunda mitad importa tanto como la primera: la prueba no puede pasar
    // por haber vaciado la barra.
    expect(enlacesCon(SOCIA)).toContain('Mi cuenta');
    expect(enlacesCon(SOCIA)).not.toContain('Administración');
  });

  it('**la cuenta de la socia es un solo ítem**: sus reservas y sus partidos son pestañas (T318)', () => {
    expect(enlacesCon(SOCIA)).not.toContain('Mis reservas');
    expect(enlacesCon(SOCIA)).not.toContain('Mis partidos');
  });

  it('el enlace del club está para cualquiera, con sesión o sin ella', () => {
    // Los enlaces del menú del diseño entran cuando existe su pantalla.
    expect(enlacesCon(null)).toContain('El club');
    // T195. Los tours, para todos: son las ligas a las que suman los torneos.
    expect(enlacesCon(null)).toContain('Tours');
    expect(enlacesCon(SOCIA)).toContain('El club');
  });

  it('**clases y torneos se ven sin cuenta**', () => {
    // Son las dos puertas de quien todavía no es del club: el apoderado que busca
    // clases para su hijo y el que mira el calendario antes de asociarse. Exigir
    // cuenta para mirarlos es la barrera que el sitio viene a sacar.
    expect(enlacesCon(null)).toContain('Clases');
    expect(enlacesCon(null)).toContain('Torneos');
  });

  it('no le ofrece «Mi cuenta» a quien no tiene ficha de socio', () => {
    // Sin socioId sus pestañas son listas siempre vacías.
    expect(enlacesCon(null)).not.toContain('Mi cuenta');
  });

  /** Lo que ofrece el menú de la cuenta, que es un mat-menu y se dibuja en el overlay (T261). */
  const enElMenu = () =>
    [...document.querySelectorAll('.mat-mdc-menu-panel a, .mat-mdc-menu-panel button')];

  it('la barra del admin es la misma que la de cualquiera', () => {
    expect(enlacesCon(ADMIN)).not.toContain('Administración');
    expect(enlacesCon(ADMIN)).not.toContain('Estado del sistema');
  });

  it('el admin llega al panel por el menú de su avatar', async () => {
    const fixture = await montarConElMenu(ADMIN);
    const elemento = fixture.nativeElement as HTMLElement;

    const avatar = elemento.querySelector<HTMLButtonElement>(
      'header button[aria-label="Menú de Rodrigo Torres"]',
    );

    expect(avatar).not.toBeNull();
    expect(avatar!.textContent?.trim()).toBe('RT');
    expect(avatar!.getAttribute('aria-expanded')).toBe('false');

    avatar!.click();
    fixture.detectChanges();

    expect(avatar!.getAttribute('aria-expanded')).toBe('true');
    expect(enElMenu().map((a) => a.textContent?.trim())).toContain('Administración');
  });

  it('**el menú de la cuenta se usa con el teclado como un menú** (T261)', async () => {
    const fixture = await montarConElMenu(SOCIA);
    const elemento = fixture.nativeElement as HTMLElement;
    const avatar = elemento.querySelector<HTMLButtonElement>(
      'header button[aria-label="Menú de Camila Rojas"]',
    )!;

    avatar.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const panel = document.querySelector('.mat-mdc-menu-panel')!;
    expect(panel.getAttribute('role')).toBe('menu');
    expect(enElMenu().every((item) => item.getAttribute('role') === 'menuitem')).toBe(true);
    expect(avatar.getAttribute('aria-haspopup')).toBe('menu');
  });

  /** Adónde lleva "Administración" en el menú del avatar, o null si no está (T220). */
  async function enlaceAlPanel(usuario: UsuarioActual): Promise<string | null> {
    const fixture = await montarConElMenu(usuario);
    const elemento = fixture.nativeElement as HTMLElement;

    elemento
      .querySelector<HTMLButtonElement>(
        `header button[aria-label="Menú de ${usuario.nombre}"]`,
      )!
      .click();
    fixture.detectChanges();

    const enlace = enElMenu().find((a) => a.textContent?.trim() === 'Administración');

    return enlace?.getAttribute('href') ?? null;
  }

  it('el panel lleva a cada uno a lo suyo: la agenda al gestor, Clases al profesor (T220)', async () => {
    expect(await enlaceAlPanel(ADMIN)).toBe('/administracion/reservas');
    expect(await enlaceAlPanel({ ...SOCIA, esGestor: true })).toBe(
      '/administracion/reservas',
    );
    expect(await enlaceAlPanel({ ...SOCIA, profesorId: 4 })).toBe(
      '/administracion/clases',
    );
    expect(await enlaceAlPanel(SOCIA)).toBeNull();
  });

  it('a la socia el menú de su avatar no le ofrece el panel', async () => {
    const fixture = await montarConElMenu(SOCIA);
    const elemento = fixture.nativeElement as HTMLElement;

    elemento
      .querySelector<HTMLButtonElement>('header button[aria-label="Menú de Camila Rojas"]')!
      .click();
    fixture.detectChanges();

    const enlaces = enElMenu().map((a) => a.textContent?.trim());

    expect(enlaces).not.toContain('Administración');
    // Un ítem para la cuenta (T318): sus reservas son una pestaña.
    expect(enlaces).toContain('Mi cuenta');
    expect(enlaces).not.toContain('Mis reservas');
  });

  describe('el menú del teléfono es un mat-sidenav (T261), diferido (T263)', () => {
    const abierto = () =>
      document.querySelector('app-menu-del-telefono mat-sidenav')!.classList.contains('mat-drawer-opened');

    it('**se abre con su botón, y al cerrarse el foco vuelve a él**', async () => {
      const fixture = await montarConElMenu(SOCIA);
      const elemento = fixture.nativeElement as HTMLElement;
      document.body.appendChild(elemento);
      const abrir = elemento.querySelector<HTMLButtonElement>('button[aria-label="Abrir el menú"]')!;

      expect(abierto()).toBe(false);

      abrir.focus();
      abrir.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(abierto()).toBe(true);

      elemento.querySelector<HTMLButtonElement>('mat-sidenav button[aria-label="Cerrar el menú"]')!.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(abierto()).toBe(false);
      expect(document.activeElement).toBe(abrir);
      elemento.remove();
    });

    it('elegir una sección lo cierra', async () => {
      const fixture = await montarConElMenu(SOCIA);
      const elemento = fixture.nativeElement as HTMLElement;

      elemento.querySelector<HTMLButtonElement>('button[aria-label="Abrir el menú"]')!.click();
      await fixture.whenStable();
      fixture.detectChanges();
      elemento.querySelector<HTMLAnchorElement>('mat-sidenav nav a')!.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(abierto()).toBe(false);
    });

    it('ofrece lo mismo que la barra: el menú se define en un solo lugar', async () => {
      const elemento = (await montarConElMenu(SOCIA)).nativeElement as HTMLElement;
      const textos = (selector: string) =>
        [...elemento.querySelectorAll(selector)].map((a) => a.textContent?.trim());

      expect(textos('mat-sidenav nav a')).toEqual(textos('header nav a'));
    });

    it('**no viaja en el arranque**: se dibuja recién al quedar libre el navegador o al tocar el menú', () => {
      const elemento = montarCon(SOCIA).nativeElement as HTMLElement;

      expect(elemento.querySelector('app-menu-del-telefono')).toBeNull();
      expect(elemento.querySelector('button[aria-label="Abrir el menú"]')).not.toBeNull();
    });
  });
});
