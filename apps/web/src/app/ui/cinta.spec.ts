import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { Cinta } from './cinta';

/**
 * La cinta de la transmisión: un rótulo fijo y unos mensajes que pasan.
 *
 * Lo que se mueve solo por más de cinco segundos tiene que poder detenerse
 * (WCAG 2.2.2), y lo que se repite para dar la vuelta no puede leerse dos veces.
 * El movimiento en sí, la pausa con el puntero o el foco y el movimiento
 * reducido son CSS: se prueban en el navegador, no acá (ver TV3.2 en el plan).
 */
describe('Cinta', () => {
  @Component({
    imports: [Cinta],
    template: `
      <app-cinta etiqueta="Torneos con la inscripción abierta" [mensajes]="mensajes()">
        <a href="#torneos-abiertos">Inscripciones abiertas</a>
      </app-cinta>
    `,
  })
  class Host {
    readonly mensajes = signal(['Copa Aniversario: hasta el martes', '4ª: quedan 26 de 32']);
  }

  function montar() {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  /** Lo que llega al lector de pantalla: todo lo que no cuelga de un aria-hidden. */
  const legible = (el: HTMLElement) =>
    [...el.querySelectorAll('li')]
      .filter((li) => !li.closest('[aria-hidden="true"]'))
      .map((li) => {
        const copia = li.cloneNode(true) as HTMLElement;
        copia.querySelectorAll('[aria-hidden="true"]').forEach((oculto) => oculto.remove());
        return copia.textContent?.trim();
      });

  it('es una región con nombre, para saltar a ella o pasarla de largo', () => {
    const { el } = montar();
    const region = el.querySelector('section');

    expect(region?.getAttribute('aria-label')).toBe('Torneos con la inscripción abierta');
  });

  it('el lector de pantalla oye cada mensaje una sola vez', () => {
    const { el } = montar();

    // La copia que cierra la vuelta existe, pero escondida del lector.
    expect(el.querySelectorAll('li').length).toBe(4);
    expect(legible(el)).toEqual(['Copa Aniversario: hasta el martes', '4ª: quedan 26 de 32']);
  });

  it('el rótulo proyectado queda fijo, fuera de lo que se mueve', () => {
    const { el } = montar();
    const enlace = el.querySelector('a[href="#torneos-abiertos"]');

    expect(enlace).not.toBeNull();
    expect(enlace?.closest('[data-carril]')).toBeNull();
  });

  it('el botón detiene la cinta y la vuelve a andar', () => {
    const { fixture, el } = montar();
    const boton = el.querySelector('button') as HTMLButtonElement;
    const carril = () => el.querySelector('[data-carril]');

    expect(boton.getAttribute('aria-pressed')).toBe('false');
    expect(carril()?.hasAttribute('data-pausada')).toBe(false);

    boton.click();
    fixture.detectChanges();
    expect(boton.getAttribute('aria-pressed')).toBe('true');
    expect(carril()?.hasAttribute('data-pausada')).toBe(true);

    boton.click();
    fixture.detectChanges();
    expect(boton.getAttribute('aria-pressed')).toBe('false');
    expect(carril()?.hasAttribute('data-pausada')).toBe(false);
  });

  it('el nombre del botón no cambia al apretarlo: el estado lo dice aria-pressed', () => {
    const { fixture, el } = montar();
    const boton = el.querySelector('button') as HTMLButtonElement;
    const nombre = () => boton.querySelector('.sr-only')?.textContent?.trim();

    expect(nombre()).toBe('Detener la cinta');
    boton.click();
    fixture.detectChanges();
    expect(nombre()).toBe('Detener la cinta');
  });

  it('es un botón y no envía nada', () => {
    const { el } = montar();

    expect(el.querySelector('button')?.getAttribute('type')).toBe('button');
  });
});
