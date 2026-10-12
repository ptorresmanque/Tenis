import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { PreguntasFrecuentesPanel } from './preguntas-frecuentes';
import { PreguntaFrecuente, PreguntasFrecuentes } from './preguntas-frecuentes.service';

/**
 * T145. La sección del panel donde el club escribe sus preguntas frecuentes: agregar,
 * corregir, reordenar y borrar, sin salir de la pantalla.
 */
describe('PreguntasFrecuentesPanel', () => {
  const RESERVAR: PreguntaFrecuente = {
    id: 1,
    pregunta: '¿Necesito ser socio para reservar?',
    respuesta: 'No. Cualquiera puede arrendar una hora.',
    orden: 1,
  };
  const ESTACIONAMIENTO: PreguntaFrecuente = {
    id: 2,
    pregunta: '¿Hay estacionamiento?',
    respuesta: 'Sí, frente al club.',
    orden: 2,
  };

  const montar = async (lista: PreguntaFrecuente[] = [RESERVAR, ESTACIONAMIENTO]) => {
    const api = {
      listar: vi.fn().mockResolvedValue(lista),
      crear: vi.fn().mockResolvedValue(RESERVAR),
      editar: vi.fn().mockResolvedValue(RESERVAR),
      borrar: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: PreguntasFrecuentes, useValue: api }] });
    const fixture = TestBed.createComponent(PreguntasFrecuentesPanel);
    await fixture.whenStable();
    fixture.detectChanges();
    const elemento = fixture.nativeElement as HTMLElement;

    const estable = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };

    const boton = (texto: string, dentro: ParentNode = elemento) =>
      Array.from(dentro.querySelectorAll('button')).find((b) =>
        b.textContent?.replace(/\s+/g, ' ').includes(texto),
      )!;

    const campo = (etiqueta: string, dentro: ParentNode = elemento) =>
      Array.from(dentro.querySelectorAll('label'))
        .find((l) => l.textContent?.includes(etiqueta))
        ?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');

    const escribir = async (control: HTMLInputElement | HTMLTextAreaElement, valor: string) => {
      control.value = valor;
      control.dispatchEvent(new Event('input'));
      await estable();
    };

    const filas = () => Array.from(elemento.querySelectorAll<HTMLElement>('ol > li'));

    return { fixture, api, elemento, estable, boton, campo, escribir, filas };
  };

  it('lista las preguntas en su orden, con un adelanto de la respuesta', async () => {
    const { filas } = await montar();

    expect(filas().map((f) => f.querySelector('h3')?.textContent?.trim())).toEqual([
      '¿Necesito ser socio para reservar?',
      '¿Hay estacionamiento?',
    ]);
    expect(filas()[0].textContent).toContain('Cualquiera puede arrendar una hora.');
  });

  it('sin preguntas, dice qué pasa en el sitio y qué hacer', async () => {
    const { elemento } = await montar([]);

    expect(elemento.textContent).toContain('Todavía no hay preguntas');
  });

  describe('agregar', () => {
    it('manda la pregunta y la respuesta, y vacía el formulario', async () => {
      const { api, boton, campo, escribir, estable } = await montar();

      await escribir(campo('Pregunta')!, '  ¿Arriendan raquetas?  ');
      await escribir(campo('Respuesta')!, 'Sí, en el mesón.');
      boton('Agregar la pregunta').click();
      await estable();

      expect(api.crear).toHaveBeenCalledWith('¿Arriendan raquetas?', 'Sí, en el mesón.');
      expect(campo('Pregunta')!.value).toBe('');
    });

    it('sin respuesta no manda nada, y dice qué falta', async () => {
      const { api, boton, campo, escribir, estable, elemento } = await montar();

      await escribir(campo('Pregunta')!, '¿Arriendan raquetas?');
      boton('Agregar la pregunta').click();
      await estable();

      expect(api.crear).not.toHaveBeenCalled();
      expect(elemento.textContent).toContain('Escribe la respuesta');
    });

    it('la respuesta dice cuántos caracteres quedan y no deja pasar 2.000', async () => {
      const { campo } = await montar();
      const respuesta = campo('Respuesta')!;

      expect(respuesta.maxLength).toBe(2000);
      expect(respuesta.closest('label')?.textContent).toContain('Quedan 2000 caracteres');
    });
  });

  describe('corregir', () => {
    it('Editar abre la pregunta en su fila, con lo guardado, y Guardar manda el cambio', async () => {
      const { api, boton, campo, escribir, estable, filas } = await montar();

      boton('Editar', filas()[1]).click();
      await estable();

      const fila = filas()[1];
      expect(campo('Pregunta', fila)!.value).toBe('¿Hay estacionamiento?');

      await escribir(campo('Respuesta', fila)!, 'Sí, gratis.');
      boton('Guardar', fila).click();
      await estable();

      expect(api.editar).toHaveBeenCalledWith(2, {
        pregunta: '¿Hay estacionamiento?',
        respuesta: 'Sí, gratis.',
      });
    });

    it('**al guardar, el foco vuelve al botón Editar de esa fila**', async () => {
      // La lista se recarga después de guardar. Si se redibujara entera, el botón
      // enfocado se destruiría y el teclado quedaría al comienzo de la página.
      const { boton, estable, filas } = await montar();

      boton('Editar', filas()[1]).click();
      await estable();
      boton('Guardar', filas()[1]).click();
      await estable();
      await estable();

      expect(document.activeElement).toBe(boton('Editar', filas()[1]));
    });

    it('**guardar una no cierra la edición de otra que se abrió mientras tanto** (T153)', async () => {
      const { api, boton, estable, filas } = await montar();
      let terminar: (valor: PreguntaFrecuente) => void = () => undefined;
      api.editar.mockReturnValue(new Promise<PreguntaFrecuente>((ok) => (terminar = ok)));

      boton('Editar', filas()[0]).click();
      await estable();
      boton('Guardar', filas()[0]).click();
      // Mientras la primera viaja, se abre la segunda.
      boton('Editar', filas()[1]).click();
      await estable();

      terminar(RESERVAR);
      await estable();
      await estable();

      expect(filas()[1].querySelector('textarea')).not.toBeNull();
    });

    it('Cancelar cierra la edición sin mandar nada', async () => {
      const { api, boton, estable, filas } = await montar();

      boton('Editar', filas()[0]).click();
      await estable();
      boton('Cancelar', filas()[0]).click();
      await estable();

      expect(api.editar).not.toHaveBeenCalled();
      expect(filas()[0].querySelector('textarea')).toBeNull();
    });

    it('cambiar el orden de una fila la mueve', async () => {
      const { api, estable, filas } = await montar();
      const orden = filas()[1].querySelector<HTMLInputElement>('input[type="number"]')!;

      orden.value = '0';
      orden.dispatchEvent(new Event('change'));
      await estable();

      expect(api.editar).toHaveBeenCalledWith(2, { orden: 0 });
    });
  });

  describe('borrar', () => {
    it('**pide confirmación** en la misma fila antes de borrar', async () => {
      const { api, boton, estable, filas } = await montar();

      boton('Borrar', filas()[0]).click();
      await estable();

      expect(api.borrar).not.toHaveBeenCalled();
      expect(filas()[0].textContent).toContain('deja de aparecer');

      boton('Sí, borrar', filas()[0]).click();
      await estable();

      expect(api.borrar).toHaveBeenCalledWith(1);
    });

    it('"Mejor no" no borra nada', async () => {
      const { api, boton, estable, filas } = await montar();

      boton('Borrar', filas()[0]).click();
      await estable();
      boton('Mejor no', filas()[0]).click();
      await estable();

      expect(api.borrar).not.toHaveBeenCalled();
      expect(filas()[0].textContent).not.toContain('deja de aparecer');
    });
  });

  it('**el error de una fila sale en esa fila**, no arriba junto al formulario', async () => {
    // Con veinte preguntas, quien corrige la décima no ve un mensaje que sale arriba.
    const { api, boton, estable, filas, elemento } = await montar();
    api.editar.mockRejectedValue({ error: { message: 'No hay una pregunta frecuente con ese número.' } });

    boton('Editar', filas()[1]).click();
    await estable();
    boton('Guardar', filas()[1]).click();
    await estable();

    expect(filas()[1].textContent).toContain('No hay una pregunta frecuente con ese número.');
    expect(elemento.querySelector('section')!.textContent).not.toContain('No hay una pregunta');
  });

  it('si el servidor rechaza, muestra su mensaje', async () => {
    const { api, boton, campo, escribir, estable, elemento } = await montar();
    api.crear.mockRejectedValue({ error: { message: 'Acorta la pregunta: tiene más de 191 caracteres.' } });

    await escribir(campo('Pregunta')!, '¿Larga?');
    await escribir(campo('Respuesta')!, 'Sí.');
    boton('Agregar la pregunta').click();
    await estable();

    expect(elemento.textContent).toContain('Acorta la pregunta');
  });
});
