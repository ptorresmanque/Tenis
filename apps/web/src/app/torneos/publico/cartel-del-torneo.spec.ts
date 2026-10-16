import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GaleriaDeFotos } from '../../ui/galeria-de-fotos';
import { Foto } from '../torneos.service';
import { CartelDelTorneo } from './cartel-del-torneo';

/**
 * T314 (SPEC-sitio.md D2, D3, A1, A3 y A4). El torneo con su afiche: la portada y Torneos lo
 * muestran igual. El afiche y las bases son lo que atrae a inscribirse, así que se ven enteros.
 */
describe('El cartel del torneo', () => {
  const foto = (id: number, descripcion: string | null): Foto => ({
    id,
    partidoId: null,
    momento: 'ANTES',
    descripcion,
    miniatura: `/api/torneos/fotos/${id}/miniatura`,
    imagen: `/api/torneos/fotos/${id}/imagen`,
  });

  @Component({
    imports: [CartelDelTorneo],
    template: `
      <app-cartel-del-torneo [nombre]="'Copa Aniversario'" [afiches]="afiches()">
        <p class="lo-de-al-lado">La tabla y el botón de inscribirse</p>
      </app-cartel-del-torneo>
    `,
  })
  class Anfitrion {
    readonly afiches = signal<Foto[]>([]);
  }

  const montar = async (afiches: Foto[]) => {
    const fixture = TestBed.createComponent(Anfitrion);
    fixture.componentInstance.afiches.set(afiches);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  afterEach(() => vi.restoreAllMocks());

  it('**muestra el primer afiche entero**, en su versión grande', async () => {
    const el = await montar([foto(1, 'El afiche'), foto(2, 'Las bases')]);
    const afiche = el.querySelector<HTMLImageElement>('[data-afiche] img')!;

    expect(afiche.getAttribute('src')).toBe('/api/torneos/fotos/1/imagen');
    expect(afiche.className).toContain('object-contain');
    expect(afiche.alt).toBe('El afiche');
  });

  it('**las otras fotos de antes van en miniatura**, y dice cuántas son', async () => {
    const el = await montar([foto(1, 'El afiche'), foto(2, 'Las bases'), foto(3, null)]);
    const miniaturas = [...el.querySelectorAll<HTMLImageElement>('[data-otras] img')];

    expect(miniaturas.map((img) => img.getAttribute('src'))).toEqual([
      '/api/torneos/fotos/2/miniatura',
      '/api/torneos/fotos/3/miniatura',
    ]);
    expect(el.textContent).toContain('3 fotos');
  });

  it('**las miniaturas muestran la foto entera** (T322): el reglamento no pierde arriba ni abajo', async () => {
    const el = await montar([foto(1, 'El afiche'), foto(2, 'Las bases')]);
    const miniatura = el.querySelector<HTMLImageElement>('[data-otras] img')!;

    expect(miniatura.classList).toContain('object-contain');
    expect(miniatura.classList).not.toContain('object-cover');
  });

  it('**tocar el afiche o una miniatura abre la galería en esa foto**', async () => {
    const abrir = vi.spyOn(GaleriaDeFotos.prototype, 'abrir');
    const el = await montar([foto(1, 'El afiche'), foto(2, 'Las bases')]);

    el.querySelector<HTMLButtonElement>('[data-afiche] button')!.click();
    expect(abrir).toHaveBeenLastCalledWith(0);

    el.querySelector<HTMLButtonElement>('[data-otras] button')!.click();
    expect(abrir).toHaveBeenLastCalledWith(1);
  });

  it('cada foto dice qué abre, con el nombre del torneo si no tiene pie', async () => {
    const el = await montar([foto(1, null), foto(2, 'Las bases')]);
    const etiquetas = [...el.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'));

    expect(etiquetas).toEqual(['Ver el afiche de Copa Aniversario, 2 fotos', 'Ver la foto: Las bases']);
  });

  it('**sin fotos de antes muestra la foto del club, sin galería**', async () => {
    const el = await montar([]);

    expect(el.querySelector('[data-afiche] img')?.getAttribute('src')).toContain('/fotos/');
    expect(el.querySelector('button')).toBeNull();
    expect(el.querySelector('app-galeria-de-fotos')).toBeNull();
  });

  it('a su lado va lo que ponga quien lo usa', async () => {
    const el = await montar([foto(1, 'El afiche')]);

    expect(el.querySelector('.lo-de-al-lado')?.textContent).toContain('La tabla y el botón');
  });
});
