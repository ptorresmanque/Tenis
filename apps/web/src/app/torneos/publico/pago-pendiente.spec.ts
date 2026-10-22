import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Torneos } from '../torneos.service';
import {
  olvidarPagoPendiente,
  recordarPagoPendiente,
  soltarSiVolvioSinPagar,
} from './pago-pendiente';

/** Una página que se vuelve de pagar, como Torneos o la de la inscripción. */
@Component({ template: '' })
class Pagina {
  readonly soltada = vi.fn();

  constructor() {
    soltarSiVolvioSinPagar(this.soltada);
  }
}

describe('soltarSiVolvioSinPagar', () => {
  const montar = () => {
    const soltarInscripcion = vi.fn().mockResolvedValue({ soltada: true });
    TestBed.configureTestingModule({
      providers: [{ provide: Torneos, useValue: { soltarInscripcion } }],
    });
    const fixture = TestBed.createComponent(Pagina);
    fixture.detectChanges();
    return { fixture, soltarInscripcion };
  };

  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it('en el navegador, si la pestaña volvió de un pago a medias, suelta el cupo', async () => {
    recordarPagoPendiente('llave-1');
    const { fixture, soltarInscripcion } = montar();
    await fixture.whenStable();

    expect(soltarInscripcion).toHaveBeenCalledWith('llave-1');
    expect(fixture.componentInstance.soltada).toHaveBeenCalled();
  });

  // T363. En el prerender no hay window ni sessionStorage: tocarlos al construir la página
  // dejaba /torneos sin dibujar («window is not defined»).
  it('**en el servidor no toca window ni sessionStorage, ni al crearse ni al destruirse**', () => {
    vi.stubGlobal('ngServerMode', true);
    const agregar = vi.spyOn(window, 'addEventListener');
    const quitar = vi.spyOn(window, 'removeEventListener');
    // Por lo que queda guardado y no con un espía: con Node 26, `sessionStorage` es el de Node, y
    // un espía en `Storage.prototype` no veía sus lecturas.
    recordarPagoPendiente('llave-1');

    const { fixture, soltarInscripcion } = montar();
    fixture.destroy();

    expect(agregar).not.toHaveBeenCalledWith('pageshow', expect.anything());
    expect(quitar).not.toHaveBeenCalledWith('pageshow', expect.anything());
    expect(olvidarPagoPendiente()).toBe('llave-1');
    expect(soltarInscripcion).not.toHaveBeenCalled();
  });
});
