import { OverlayContainer } from '@angular/cdk/overlay';
import { Component, ElementRef, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { overlaysEnElDialogo } from './overlays-en-el-dialogo';

/**
 * Con un `<dialog>` modal abierto, lo de afuera queda inerte: el contenedor de los paneles de
 * Material tiene que estar adentro del diálogo abierto, y en el body cuando no hay ninguno.
 */
describe('overlaysEnElDialogo', () => {
  @Component({
    template: `<dialog #uno></dialog>
      <dialog #dos></dialog>`,
    providers: [overlaysEnElDialogo()],
  })
  class ConDialogos {
    readonly uno = viewChild.required<ElementRef<HTMLDialogElement>>('uno');
    readonly dos = viewChild.required<ElementRef<HTMLDialogElement>>('dos');
  }

  const montar = () => {
    const fixture = TestBed.createComponent(ConDialogos);
    fixture.detectChanges();
    const contenedor = () =>
      fixture.debugElement.injector.get(OverlayContainer).getContainerElement();
    return { componente: fixture.componentInstance, contenedor };
  };

  it('con un diálogo abierto, el contenedor va adentro de ese diálogo', () => {
    const { componente, contenedor } = montar();
    componente.dos().nativeElement.open = true;

    expect(contenedor().parentElement).toBe(componente.dos().nativeElement);
  });

  it('sin diálogos abiertos, el contenedor queda en el body', () => {
    const { contenedor } = montar();

    expect(contenedor().parentElement).toBe(document.body);
  });

  it('al cerrar el diálogo, el contenedor vuelve al body', () => {
    const { componente, contenedor } = montar();
    componente.uno().nativeElement.open = true;
    contenedor();

    componente.uno().nativeElement.open = false;

    expect(contenedor().parentElement).toBe(document.body);
  });
});
