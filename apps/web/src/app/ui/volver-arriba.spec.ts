import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VolverArriba } from './volver-arriba';

/**
 * T149. El botón que lleva al comienzo de la página en el sitio público. Aparece
 * después de bajar una pantalla y media, y al usarlo el foco vuelve al contenido.
 */
describe('VolverArriba', () => {
  let contenido: HTMLElement;
  let reducirMovimiento = false;

  beforeEach(() => {
    // El destino del foco, como el <main id="contenido"> del cascarón.
    contenido = document.createElement('main');
    contenido.id = 'contenido';
    contenido.tabIndex = -1;
    document.body.append(contenido);

    reducirMovimiento = false;
    vi.stubGlobal('scrollTo', vi.fn());
    vi.stubGlobal(
      'matchMedia',
      vi.fn((consulta: string) => ({
        matches: consulta.includes('reduce') && reducirMovimiento,
      })),
    );
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  });

  afterEach(() => {
    contenido.remove();
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  const montar = () => {
    const fixture = TestBed.createComponent(VolverArriba);
    fixture.detectChanges();
    const boton = (fixture.nativeElement as HTMLElement).querySelector('button')!;

    const bajar = (y: number) => {
      Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
      window.dispatchEvent(new Event('scroll'));
      fixture.detectChanges();
    };

    return { fixture, boton, bajar };
  };

  it('arriba de la página está inerte: ni se ve ni se alcanza con Tab', () => {
    const { boton } = montar();

    expect(boton.inert).toBe(true);
  });

  it('aparece después de bajar una pantalla y media, no antes', () => {
    const { boton, bajar } = montar();

    bajar(1100);
    expect(boton.inert).toBe(true);

    bajar(1300);
    expect(boton.inert).toBe(false);

    bajar(200);
    expect(boton.inert).toBe(true);
  });

  it('quien recarga a mitad de la página lo ve sin tener que mover el scroll', () => {
    Object.defineProperty(window, 'scrollY', { value: 2000, configurable: true });

    const { boton, fixture } = montar();
    fixture.detectChanges();

    expect(boton.inert).toBe(false);
  });

  it('se llama "Volver arriba"', () => {
    const { boton } = montar();

    expect(boton.getAttribute('aria-label')).toBe('Volver arriba');
  });

  it('**sube con scroll suave y deja el foco al comienzo del contenido**', () => {
    // Sin mover el foco, el teclado se queda en un botón que acaba de desaparecer.
    const { boton, bajar } = montar();
    bajar(2000);

    boton.click();

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(document.activeElement).toBe(contenido);
  });

  it('con "reducir movimiento" sube de una vez', () => {
    reducirMovimiento = true;
    const { boton, bajar } = montar();
    bajar(2000);

    boton.click();

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
  });
});
