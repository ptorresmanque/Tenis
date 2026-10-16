import { Component, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeAll, describe, expect, it } from 'vitest';

import { FotoParaGaleria, GaleriaDeFotos } from './galeria-de-fotos';

/**
 * T309 (SPEC-sitio.md D1, A5 y A11). La galería del sitio es la de ng-gallery: este componente
 * solo le pasa las fotos, la configura en español y la abre en la foto tocada.
 */
// jsdom 28 no implementa los diálogos modales: el lightbox de ng-gallery abre un <dialog> con
// showModal(). Lo mínimo para probar que se abre y se cierra es poner y sacar `open`.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

describe('La galería de fotos', () => {
  const FOTOS: FotoParaGaleria[] = [
    { imagen: '/api/fotos/1/imagen', miniatura: '/api/fotos/1/miniatura', descripcion: 'Afiche del campeonato' },
    { imagen: '/api/fotos/2/imagen', miniatura: '/api/fotos/2/miniatura', descripcion: 'Reglamento' },
    { imagen: '/api/fotos/3/imagen', miniatura: '/api/fotos/3/miniatura', descripcion: null },
  ];

  @Component({
    imports: [GaleriaDeFotos],
    template: `<app-galeria-de-fotos #galeria [fotos]="fotos" etiqueta="Fotos del torneo" />`,
  })
  class Anfitrion {
    readonly fotos = FOTOS;
    readonly galeria = viewChild.required(GaleriaDeFotos);
  }

  const montar = async () => {
    const fixture = TestBed.createComponent(Anfitrion);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  /** Espera a que la galería, que se carga diferida, llegue y se abra. */
  const abrir = async (fixture: Awaited<ReturnType<typeof montar>>, indice: number) => {
    fixture.componentInstance.galeria().abrir(indice);
    // Sin whenStable: con las fotos cargando, la galería no queda quieta nunca en jsdom.
    for (let i = 0; i < 25 && !document.querySelector('dialog[open]'); i++) {
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 20));
    }
    fixture.detectChanges();
    return document.querySelector<HTMLDialogElement>('dialog[open]');
  };

  it('**no dibuja ningún visor propio**: hasta que se pide, no hay diálogo', async () => {
    const fixture = await montar();

    expect(document.querySelector('dialog[open]')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('img')).toBeNull();
    fixture.nativeElement.remove();
  });

  it('**abrir muestra el lightbox de ng-gallery con todas las fotos**, cada una con su texto', async () => {
    const fixture = await montar();
    const dialogo = await abrir(fixture, 1);

    expect(dialogo).not.toBeNull();
    expect(dialogo!.getAttribute('aria-label')).toBe('Fotos del torneo');
    const textos = [...dialogo!.querySelectorAll('gallery img')].map((img) => img.getAttribute('alt'));
    expect(textos).toEqual(expect.arrayContaining(['Afiche del campeonato', 'Reglamento', 'Foto 3 de 3']));
    fixture.nativeElement.remove();
  });

  it('**se cierra con su botón, que habla en español**', async () => {
    const fixture = await montar();
    const dialogo = await abrir(fixture, 0);
    const cerrar = dialogo!.querySelector<HTMLButtonElement>('[aria-label="Cerrar la galería"]');

    expect(cerrar).not.toBeNull();
    cerrar!.click();
    expect(dialogo!.open).toBe(false);
    fixture.nativeElement.remove();
  });
});
