import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { simularDialogoNativo } from '../../testing/dialogo-nativo';
import { GaleriaDeFotos } from '../../ui/galeria-de-fotos';
import { Foto } from '../torneos.service';
import { Galeria } from './galeria';

beforeAll(simularDialogoNativo);

/**
 * T69. La galería del torneo.
 *
 * Lo que este archivo cuida: que **la grilla cargue solo miniaturas**. Sesenta fotos en
 * tamaño web son 240 MB para quien la abre con datos móviles parado en la cancha, que
 * es exactamente dónde y cuándo se va a abrir.
 */
describe('Galeria', () => {
  const foto = (id: number, extra: Partial<Foto> = {}): Foto => ({
    id,
    partidoId: null,
    momento: 'DURANTE',
    descripcion: null,
    miniatura: `/api/torneos/fotos/${id}/miniatura`,
    imagen: `/api/torneos/fotos/${id}/imagen`,
    ...extra,
  });

  let fixture: ComponentFixture<Galeria>;

  const montar = async (fotos: Foto[]) => {
    TestBed.resetTestingModule();
    fixture = TestBed.createComponent(Galeria);
    fixture.componentRef.setInput('fotos', fotos);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const texto = () => elemento().textContent ?? '';
  const fuentes = () =>
    Array.from(elemento().querySelectorAll('img')).map((i) =>
      i.getAttribute('src'),
    );

  beforeEach(async () => {
    await montar([foto(1), foto(2)]);
  });

  it('**la grilla pide miniaturas, no las imágenes grandes**', () => {
    expect(fuentes()).toEqual([
      '/api/torneos/fotos/1/miniatura',
      '/api/torneos/fotos/2/miniatura',
    ]);
  });

  afterEach(() => {
    document.querySelectorAll('dialog').forEach((dialogo) => dialogo.remove());
    vi.restoreAllMocks();
  });

  /** Toca una miniatura y espera a que la galería, que llega diferida, se abra. */
  const tocar = async (miniatura: HTMLButtonElement) => {
    miniatura.click();
    for (let i = 0; i < 25 && !document.querySelector('dialog[open]'); i++) {
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 20));
    }
    fixture.detectChanges();
    return document.querySelector<HTMLDialogElement>('dialog[open]');
  };

  it('**la versión grande se pide recién al abrir la foto**, en la galería de ng-gallery', async () => {
    expect(document.querySelector('img[src="/api/torneos/fotos/1/imagen"]')).toBeNull();

    const dialogo = await tocar(elemento().querySelector('button')!);

    expect(dialogo).not.toBeNull();
    expect(dialogo!.querySelector('gallery img[src="/api/torneos/fotos/1/imagen"]')).not.toBeNull();
  });

  it('**ya no tiene visor propio**: la página no dibuja la foto grande', async () => {
    await tocar(elemento().querySelector('button')!);

    expect(fuentes()).not.toContain('/api/torneos/fotos/1/imagen');
    expect(texto()).not.toContain('Cerrar la foto');
  });

  it('**abre en la foto tocada**, con las de la lista en el orden de la grilla', async () => {
    const abrir = vi.spyOn(GaleriaDeFotos.prototype, 'abrir');
    await montar([foto(1, { momento: 'DESPUES' }), foto(2, { momento: 'ANTES' }), foto(3)]);
    // En la grilla: antes (2), durante (3), después (1). Se toca la de después.
    const miniaturas = [...elemento().querySelectorAll<HTMLButtonElement>('ul button')];
    miniaturas[2].click();

    expect(abrir).toHaveBeenCalledWith(2);
  });

  it('cada miniatura dice qué abre', () => {
    const miniatura = elemento().querySelector('ul button')!;

    expect(miniatura.getAttribute('aria-label')).toBe('Ver la foto: Foto del torneo');
  });

  it('las miniaturas se cargan a medida que se baja', () => {
    const diferidas = Array.from(elemento().querySelectorAll('img')).filter(
      (i) => i.getAttribute('loading') === 'lazy',
    );

    expect(diferidas).toHaveLength(2);
  });

  it('**los tramos vacíos no llevan título**', async () => {
    await montar([foto(1, { momento: 'DESPUES' })]);

    expect(texto()).toContain('Después del torneo');
    expect(texto()).not.toContain('Antes del torneo');
  });

  it('el álbum se cuenta en orden: antes, durante y después', async () => {
    await montar([
      foto(1, { momento: 'DESPUES' }),
      foto(2, { momento: 'ANTES' }),
    ]);

    const titulos = Array.from(elemento().querySelectorAll('h4')).map((h) =>
      h.textContent?.trim(),
    );

    expect(titulos).toEqual(['Antes del torneo', 'Después del torneo']);
  });

  it('**sin pie de foto el lector de pantalla no oye un UUID**', () => {
    expect(elemento().querySelector('img')?.getAttribute('alt')).toBe(
      'Foto del torneo',
    );
  });

  it('el pie de foto es lo que se lee cuando lo hay', async () => {
    await montar([foto(1, { descripcion: 'La entrega de premios' })]);

    expect(elemento().querySelector('img')?.getAttribute('alt')).toBe(
      'La entrega de premios',
    );
  });

  it('un torneo sin fotos no dibuja el bloque', async () => {
    await montar([]);

    expect(texto()).not.toContain('Fotos');
  });

  describe('fuera de los torneos (T186)', () => {
    /** Una foto de la tienda o la cafetería: no tiene momento ni partido. */
    const deLugar = (id: number) => ({
      id,
      descripcion: null,
      miniatura: `/api/club/fotos/${id}/miniatura`,
      imagen: `/api/club/fotos/${id}/imagen`,
    });

    const montarSinMomento = async (extra: Record<string, string> = {}) => {
      TestBed.resetTestingModule();
      fixture = TestBed.createComponent(Galeria);
      fixture.componentRef.setInput('fotos', [deLugar(1), deLugar(2)]);
      for (const [nombre, valor] of Object.entries(extra)) {
        fixture.componentRef.setInput(nombre, valor);
      }
      await fixture.whenStable();
      fixture.detectChanges();
    };

    it('**sin momento van todas en una sola grilla, sin títulos de tramo**', async () => {
      await montarSinMomento();

      expect(fuentes()).toEqual(['/api/club/fotos/1/miniatura', '/api/club/fotos/2/miniatura']);
      expect(elemento().querySelectorAll('h4')).toHaveLength(0);
    });

    it('el texto alternativo por omisión es el de quien la usa', async () => {
      await montarSinMomento({ porOmision: 'Foto de la tienda del club' });

      expect(elemento().querySelector('img')?.getAttribute('alt')).toBe(
        'Foto de la tienda del club',
      );
    });

    it('sin título no dibuja encabezado: lo pone quien la usa', async () => {
      await montarSinMomento({ titulo: '' });

      expect(elemento().querySelector('h3')).toBeNull();
      expect(fuentes()).toHaveLength(2);
    });
  });
});
