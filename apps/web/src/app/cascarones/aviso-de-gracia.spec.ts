import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AvisoDeGracia } from './aviso-de-gracia';

/**
 * T381 (SPEC-cuotas.md § Días de gracia). El socio con la cuota vencida sigue reservando
 * unos días, y el aviso se lo recuerda en todo el sitio con los días que le quedan.
 */
describe('AvisoDeGracia', () => {
  let fixture: ComponentFixture<AvisoDeGracia>;

  const montar = (dias: number): HTMLElement => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });

    fixture = TestBed.createComponent(AvisoDeGracia);
    fixture.componentRef.setInput('dias', dias);
    fixture.detectChanges();

    return fixture.nativeElement as HTMLElement;
  };

  const plano = (elemento: HTMLElement) =>
    (elemento.textContent ?? '').replace(/\s+/g, ' ').trim();

  const botonCerrar = (elemento: HTMLElement) =>
    [...elemento.querySelectorAll('button')].find(
      (boton) => boton.textContent?.trim() === 'Cerrar',
    ) as HTMLButtonElement;

  // Limpio antes y después: Vitest corre los archivos de un worker en el mismo entorno, y un
  // aviso cerrado acá dejaría cerrado el del cascarón en el archivo siguiente.
  beforeEach(() => sessionStorage.clear());
  afterEach(() => {
    sessionStorage.clear();
    document.getElementById('contenido')?.remove();
    for (const id of ['pie-de-prueba', 'antes-de-prueba', 'oculto-de-prueba']) {
      document.getElementById(id)?.remove();
    }
  });

  it('dice que la cuota está vencida y cuántos días quedan para pagarla', () => {
    const elemento = montar(3);

    expect(plano(elemento)).toContain('Tu cuota está vencida');
    expect(plano(elemento)).toContain(
      'Te quedan 3 días para pagarla; después no podrás reservar canchas.',
    );
  });

  it.each([5, 2])('con %i días dice cuántos quedan, y no que es el último', (dias) => {
    // El 2 es el borde: con «dias > 2» en vez de «dias > 1», el penúltimo día diría que es el
    // último, y el socio todavía reserva mañana.
    const elemento = montar(dias);

    expect(plano(elemento)).toContain(
      `Te quedan ${dias} días para pagarla; después no podrás reservar canchas.`,
    );
    expect(plano(elemento)).not.toContain('último día');
  });

  it('el último día lo dice así, y no «te quedan 1 días»', () => {
    const elemento = montar(1);

    expect(plano(elemento)).toContain(
      'Hoy es el último día para pagarla; desde mañana no podrás reservar canchas.',
    );
    expect(plano(elemento)).not.toContain('Te quedan');
  });

  it('se anuncia sin quitarle el foco a nadie', () => {
    const elemento = montar(3);

    expect(elemento.querySelector('[role="status"]')).not.toBeNull();
    expect(elemento.contains(document.activeElement)).toBe(false);
  });

  it('su botón lleva a pagar la cuota', () => {
    const pagar = [...montar(3).querySelectorAll('a')].find(
      (enlace) => enlace.textContent?.trim() === 'Pagar cuota',
    );

    expect(pagar?.getAttribute('href')).toBe('/mi-cuenta/cuota');
  });

  it('se cierra, y no vuelve en la pestaña', () => {
    const elemento = montar(3);

    botonCerrar(elemento).click();
    fixture.detectChanges();

    expect(elemento.querySelector('[role="status"]')).toBeNull();
    // Otra página de la misma pestaña monta el aviso de nuevo: sigue cerrado.
    expect(montar(3).querySelector('[role="status"]')).toBeNull();
  });

  it('al cerrarlo, el foco sigue en el control que viene después (el pie)', () => {
    // Sin esto, quien navega con el teclado queda con el foco en un botón que ya no existe,
    // o al comienzo de <main>, y el siguiente Tab empieza de nuevo desde arriba. Con un
    // control antes del aviso: el que vale es el que viene después, no el primero.
    const antes = document.createElement('a');
    antes.id = 'antes-de-prueba';
    antes.href = '/reservar';
    document.body.prepend(antes);
    const elemento = montar(3);
    const pie = document.createElement('a');
    pie.id = 'pie-de-prueba';
    pie.href = '/privacidad';
    document.body.appendChild(pie);

    botonCerrar(elemento).click();

    expect(document.activeElement).toBe(pie);
  });

  it('salta los controles que no se ven, como el menú del teléfono cerrado (/review)', () => {
    // En el sitio, entre el aviso y el pie está el cajón del menú del teléfono, cerrado y sin
    // render: enfocar su botón no hace nada, y el foco terminaba en <body>.
    const elemento = montar(3);
    const oculto = document.createElement('button');
    oculto.id = 'oculto-de-prueba';
    oculto.checkVisibility = () => false;
    document.body.appendChild(oculto);
    const pie = document.createElement('a');
    pie.id = 'pie-de-prueba';
    pie.href = '/privacidad';
    document.body.appendChild(pie);

    botonCerrar(elemento).click();

    expect(document.activeElement).toBe(pie);
  });

  it('sin controles después, el foco vuelve al contenido y no se pierde', () => {
    const contenido = document.createElement('main');
    contenido.id = 'contenido';
    contenido.tabIndex = -1;
    document.body.prepend(contenido);
    const elemento = montar(3);

    botonCerrar(elemento).click();

    expect(document.activeElement).toBe(contenido);
  });
});
