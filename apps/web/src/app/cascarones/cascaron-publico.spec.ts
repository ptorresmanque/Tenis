import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { Club, DatosDelClub } from '../club/club.service';
import { Auth, UsuarioActual } from '../core/auth/auth';
import { Tienda } from '../tienda/tienda.service';
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
    tiendaAbierta = false,
  ): ComponentFixture<CascaronPublico> {
    const estado = signal(usuario);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        ...(club ? [{ provide: Club, useValue: { datos: signal(club) } }] : []),
        { provide: Tienda, useValue: { abierta: signal(tiendaAbierta) } },
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

    const fixture = TestBed.createComponent(CascaronPublico);
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
        tiendaHabilitada: false,
      }).nativeElement as HTMLElement
    ).querySelector('footer');

    expect(pie?.querySelector('a[href="https://wa.me/56987654321"]')?.textContent).toContain(
      'WhatsApp de FEDAL Tennis Center',
    );
  });

  it('el pie enlaza las preguntas frecuentes (T146)', () => {
    const pie = (montarCon(null).nativeElement as HTMLElement).querySelector('footer');

    expect(pie?.querySelector('a[href="/preguntas-frecuentes"]')?.textContent).toContain(
      'Preguntas frecuentes',
    );
  });

  it('dice cuando una página tarda en cargar (T151)', () => {
    const elemento = montarCon(null).nativeElement as HTMLElement;

    expect(elemento.querySelector('app-progreso-de-navegacion')).not.toBeNull();
  });

  it('el sitio público tiene "Volver arriba", y el contenido puede recibir su foco (T149)', () => {
    const elemento = montarCon(null).nativeElement as HTMLElement;

    expect(elemento.querySelector('app-volver-arriba')).not.toBeNull();
    // tabindex -1: el foco puede llegar por programa sin que main entre al orden de Tab.
    expect(elemento.querySelector('main#contenido')?.getAttribute('tabindex')).toBe('-1');
  });

  it('le ofrece crear cuenta a quien no ha entrado', () => {
    expect(enlacesCon(null)).toContain('Crear cuenta');
  });

  it('no le ofrece crear cuenta a quien ya tiene sesión', () => {
    expect(enlacesCon(SOCIA)).not.toContain('Crear cuenta');
  });

  it('a la socia le muestra sus reservas y nada del panel', () => {
    // La segunda mitad importa tanto como la primera: la prueba no puede pasar
    // por haber vaciado la barra.
    expect(enlacesCon(SOCIA)).toContain('Mis reservas');
    expect(enlacesCon(SOCIA)).not.toContain('Administración');
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

  it('no le ofrece "Mis reservas" a quien no tiene ficha de socio', () => {
    // Sin socioId esa pantalla es una lista siempre vacía.
    expect(enlacesCon(null)).not.toContain('Mis reservas');
  });

  it('**"Tienda" aparece solo con la tienda abierta**: encendida y con algo a la venta (T162)', () => {
    const enlaces = (abierta: boolean) => {
      const elemento = montarCon(null, undefined, abierta).nativeElement as HTMLElement;

      return [...elemento.querySelectorAll('header a')].map((a) => a.textContent?.trim());
    };

    expect(enlaces(true)).toContain('Tienda');
    expect(enlaces(false)).not.toContain('Tienda');
  });

  it('**con la tienda, el menú del avatar ofrece "Mis pedidos" a cualquiera con cuenta** (T166)', () => {
    const conTienda = { tiendaHabilitada: true } as DatosDelClub;
    const enlacesDelMenu = (usuario: UsuarioActual, club?: DatosDelClub) => {
      const fixture = montarCon(usuario, club);
      const elemento = fixture.nativeElement as HTMLElement;
      elemento.querySelector<HTMLButtonElement>('header button[aria-label^="Menú de"]')!.click();
      fixture.detectChanges();

      return [...elemento.querySelectorAll('header a')].map((a) => a.textContent?.trim());
    };

    // El admin no es socio, y compra igual.
    expect(enlacesDelMenu(ADMIN, conTienda)).toContain('Mis pedidos');
    expect(enlacesDelMenu(SOCIA, conTienda)).toContain('Mis pedidos');
    expect(enlacesDelMenu(SOCIA)).not.toContain('Mis pedidos');
  });

  it('con la tienda encendida, el pie enlaza los términos de venta (T167)', () => {
    const terminos = (club?: DatosDelClub) =>
      (montarCon(null, club).nativeElement as HTMLElement).querySelector(
        'footer a[href="/tienda/terminos"]',
      );

    expect(terminos({ tiendaHabilitada: true } as DatosDelClub)?.textContent).toContain(
      'Términos de venta',
    );
    expect(terminos()).toBeNull();
  });

  it('la barra del admin es la misma que la de cualquiera', () => {
    expect(enlacesCon(ADMIN)).not.toContain('Administración');
    expect(enlacesCon(ADMIN)).not.toContain('Estado del sistema');
  });

  it('el admin llega al panel por el menú de su avatar', () => {
    const fixture = montarCon(ADMIN);
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
    expect(
      [...elemento.querySelectorAll('header a')].map((a) => a.textContent?.trim()),
    ).toContain('Administración');
  });

  it('a la socia el menú de su avatar no le ofrece el panel', () => {
    const fixture = montarCon(SOCIA);
    const elemento = fixture.nativeElement as HTMLElement;

    elemento
      .querySelector<HTMLButtonElement>('header button[aria-label="Menú de Camila Rojas"]')!
      .click();
    fixture.detectChanges();

    const enlaces = [...elemento.querySelectorAll('header a')].map((a) =>
      a.textContent?.trim(),
    );

    expect(enlaces).not.toContain('Administración');
    expect(enlaces).toContain('Mis reservas');
  });
});
