import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { SelectorDeDia } from './selector-de-dia';

/**
 * T303 (SPEC-panel.md D16 y D17). El calendario de «Otro día» confirma con «Cancelar / Aplicar»
 * y dice su formato. Es el que más se usa: la agenda, Clases y Agendar lo comparten.
 */
describe('El selector de día', () => {
  const montar = async () => {
    const fixture = TestBed.createComponent(SelectorDeDia);
    fixture.componentRef.setInput('fecha', '2026-10-15');
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    const abrir = async () => {
      el.querySelector<HTMLButtonElement>('mat-datepicker-toggle button')!.click();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    /** El día del mes visible en el calendario abierto. */
    const tocarDia = async (dia: number) => {
      [...document.querySelectorAll<HTMLElement>('.mat-calendar-body-cell')]
        .find((celda) => celda.textContent?.trim() === String(dia))!
        .click();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const accion = async (texto: 'Cancelar' | 'Aplicar') => {
      [...document.querySelectorAll<HTMLButtonElement>('.mat-datepicker-actions button')]
        .find((boton) => boton.textContent?.trim() === texto)!
        .click();
      await fixture.whenStable();
      fixture.detectChanges();
    };

    return { fixture, el, abrir, tocarDia, accion };
  };

  it('**el calendario confirma con «Cancelar / Aplicar»**, y el campo dice su formato', async () => {
    const { el, abrir } = await montar();

    await abrir();

    expect(
      [...document.querySelectorAll('.mat-datepicker-actions button')].map((b) =>
        b.textContent?.trim(),
      ),
    ).toEqual(['Cancelar', 'Aplicar']);
    expect(el.querySelector('mat-hint')?.textContent).toContain('dd-mm-aaaa');
  });

  it('**tocar un día no lo cambia hasta «Aplicar»**', async () => {
    const { fixture, abrir, tocarDia, accion } = await montar();

    await abrir();
    await tocarDia(20);
    expect(fixture.componentInstance.fecha()).toBe('2026-10-15');

    await accion('Aplicar');
    expect(fixture.componentInstance.fecha()).toBe('2026-10-20');
  });

  it('**«Cancelar» lo deja como estaba**', async () => {
    const { fixture, abrir, tocarDia, accion } = await montar();

    await abrir();
    await tocarDia(20);
    await accion('Cancelar');

    expect(fixture.componentInstance.fecha()).toBe('2026-10-15');
  });

  it('escribir el día a mano sigue andando', async () => {
    const { fixture, el } = await montar();
    const campo = el.querySelector<HTMLInputElement>('input#fecha')!;

    campo.value = '22-10-2026';
    campo.dispatchEvent(new Event('input'));
    campo.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(fixture.componentInstance.fecha()).toBe('2026-10-22');
  });
});
