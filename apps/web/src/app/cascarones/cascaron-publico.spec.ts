import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

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
    email: 'admin@clubdetenis.cl',
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

  function montarCon(usuario: UsuarioActual | null): ComponentFixture<CascaronPublico> {
    const estado = signal(usuario);

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
