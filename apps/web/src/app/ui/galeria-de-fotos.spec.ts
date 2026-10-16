import { Component, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { simularDialogoNativo } from '../testing/dialogo-nativo';
import { FotoParaGaleria, GaleriaDeFotos } from './galeria-de-fotos';

beforeAll(simularDialogoNativo);

/**
 * T309 (SPEC-sitio.md D1, A5 y A11). La galería del sitio es la de ng-gallery: este componente
 * solo le pasa las fotos, la configura en español y la abre en la foto tocada.
 */

describe('La galería de fotos', () => {
  const FOTOS: FotoParaGaleria[] = [
    { imagen: '/api/fotos/1/imagen', miniatura: '/api/fotos/1/miniatura', descripcion: 'Afiche del campeonato' },
    { imagen: '/api/fotos/2/imagen', miniatura: '/api/fotos/2/miniatura', descripcion: 'Reglamento' },
    { imagen: '/api/fotos/3/imagen', miniatura: '/api/fotos/3/miniatura', descripcion: null },
  ];

  @Component({
    imports: [GaleriaDeFotos],
    template: `
      <button type="button" class="disparador" (click)="galeria.abrir(1)">Ver la foto 2</button>
      <app-galeria-de-fotos #galeria [fotos]="fotos" etiqueta="Fotos del torneo" />
    `,
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

  it('**las miniaturas muestran la foto entera** (T322): un afiche no pierde arriba ni abajo', async () => {
    // La foto grande ya va entera (contain); las miniaturas venían con cover, en cajas apaisadas.
    const fixture = await montar();
    const dialogo = await abrir(fixture, 1);

    expect(dialogo!.querySelector<HTMLElement>('gallery')!.style.getPropertyValue('--g-thumb-image-size')).toBe(
      'contain',
    );
    fixture.nativeElement.remove();
  });

  it('**las flechas hablan en español**', async () => {
    const fixture = await montar();
    const dialogo = await abrir(fixture, 1);
    const etiquetas = [...dialogo!.querySelectorAll('[galleryNavButton]')].map((b) =>
      b.getAttribute('aria-label'),
    );

    expect(etiquetas).toEqual(['Ir a la primera foto', 'Ir a la última foto']);
    fixture.nativeElement.remove();
  });

  it('**al abrir, el foco va a las fotos**: las flechas del teclado las pasan sin buscarlas', async () => {
    // ng-gallery no escucha las flechas: su carril se desplaza con ellas solo si tiene el foco,
    // y el diálogo abría con el foco en sí mismo (T320).
    const fixture = await montar();
    const dialogo = await abrir(fixture, 1);
    for (let i = 0; i < 10 && document.activeElement?.localName !== 'g-slider'; i++) {
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 20));
    }

    expect(document.activeElement).toBe(dialogo!.querySelector('g-slider'));
    fixture.nativeElement.remove();
  });

  it('**al cerrar, el foco vuelve a lo que la abrió**', async () => {
    const fixture = await montar();
    const disparador = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.disparador')!;
    disparador.focus();
    const dialogo = await abrir(fixture, 1);

    dialogo!.querySelector<HTMLButtonElement>('[aria-label="Cerrar la galería"]')!.click();

    expect(document.activeElement).toBe(disparador);
    fixture.nativeElement.remove();
  });

  it('**su Esc no cierra el diálogo de abajo**, como el cuadro del torneo (Material escucha en el body)', async () => {
    const fixture = await montar();
    const escuchaElBody = vi.fn();
    document.body.addEventListener('keydown', escuchaElBody);
    const dialogo = await abrir(fixture, 0);

    dialogo!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(escuchaElBody).not.toHaveBeenCalled();
    document.body.removeEventListener('keydown', escuchaElBody);
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
