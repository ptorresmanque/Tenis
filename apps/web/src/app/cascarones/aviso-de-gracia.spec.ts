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

  beforeEach(() => sessionStorage.clear());
  afterEach(() => document.getElementById('contenido')?.remove());

  it('dice que la cuota está vencida y cuántos días quedan para pagarla', () => {
    const elemento = montar(3);

    expect(plano(elemento)).toContain('Tu cuota está vencida');
    expect(plano(elemento)).toContain(
      'Te quedan 3 días para pagarla; después no podrás reservar canchas.',
    );
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

  it('al cerrarlo, el foco vuelve al contenido y no se pierde en la página', () => {
    // Sin esto, quien navega con el teclado queda con el foco en un botón que ya no existe,
    // y el siguiente Tab empieza de nuevo desde arriba.
    const contenido = document.createElement('main');
    contenido.id = 'contenido';
    contenido.tabIndex = -1;
    document.body.appendChild(contenido);
    const elemento = montar(3);

    botonCerrar(elemento).click();

    expect(document.activeElement).toBe(contenido);
  });
});
