import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { TestBed } from '@angular/core/testing';
import { MatExpansionPanelHarness } from '@angular/material/expansion/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { Contacto } from './contacto.service';
import { PreguntasFrecuentesPublicas } from './preguntas-frecuentes';

/**
 * T146. La página `/preguntas-frecuentes`: lo que el club escribió en su panel (T145),
 * en su orden, cada pregunta en un panel desplegable de Material (T281) que se abre con el
 * teclado y anuncia si está abierto. Al final, el formulario de contacto para la pregunta
 * que no está.
 */
describe('PreguntasFrecuentesPublicas', () => {
  const montar = async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Contacto, useValue: { enviar: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(PreguntasFrecuentesPublicas);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const elemento = fixture.nativeElement as HTMLElement;

    const responder = async (cuerpo: object | null, estado = 200) => {
      const peticion = http.expectOne('/api/preguntas-frecuentes');
      if (estado === 200) peticion.flush(cuerpo);
      else peticion.flush('caída', { status: estado, statusText: 'Error' });
      await fixture.whenStable();
      fixture.detectChanges();
    };

    return { fixture, elemento, responder };
  };

  it('mientras carga, el esqueleto dice qué se está cargando', async () => {
    const { elemento } = await montar();

    expect(elemento.textContent).toContain('Cargando las preguntas frecuentes');
  });

  it('**cada pregunta es un panel desplegable, en el orden en que llegan** (T281)', async () => {
    const { fixture, responder } = await montar();
    await responder([
      { id: 2, pregunta: '¿Necesito ser socio?', respuesta: 'No.' },
      { id: 1, pregunta: '¿Arriendan raquetas?', respuesta: 'Sí, en el mesón.' },
    ]);

    const preguntas = await TestbedHarnessEnvironment.loader(fixture).getAllHarnesses(
      MatExpansionPanelHarness,
    );

    expect(await Promise.all(preguntas.map((p) => p.getTitle()))).toEqual([
      '¿Necesito ser socio?',
      '¿Arriendan raquetas?',
    ]);
    // Cerradas al llegar: la lista de preguntas se lee de un vistazo.
    expect(await Promise.all(preguntas.map((p) => p.isExpanded()))).toEqual([false, false]);

    await preguntas[1].expand();
    expect(await preguntas[1].getTextContent()).toContain('Sí, en el mesón.');
  });

  it('la respuesta se muestra como texto, aunque traiga HTML', async () => {
    const { elemento, responder } = await montar();
    await responder([{ id: 1, pregunta: '¿Y esto?', respuesta: 'Con <b>negrita</b>' }]);

    expect(elemento.querySelector('mat-expansion-panel b')).toBeNull();
    expect(elemento.querySelector('mat-expansion-panel')?.textContent).toContain(
      'Con <b>negrita</b>',
    );
  });

  it('**sin preguntas, lo dice y deja el contacto a mano**', async () => {
    const { elemento, responder } = await montar();
    await responder([]);

    expect(elemento.querySelector('mat-expansion-panel')).toBeNull();
    expect(elemento.textContent).toContain('Todavía no hay preguntas publicadas');
    expect(elemento.querySelector('app-formulario-contacto')).not.toBeNull();
  });

  it('si la API no responde, lo dice y ofrece escribir', async () => {
    const { elemento, responder } = await montar();
    await responder(null, 500);

    expect(elemento.querySelector('[role="alert"]')?.textContent).toContain(
      'No pudimos cargar las preguntas',
    );
    expect(elemento.querySelector('app-formulario-contacto')).not.toBeNull();
  });

  it('el formulario de contacto va al final, para la pregunta que no está', async () => {
    const { elemento, responder } = await montar();
    await responder([{ id: 1, pregunta: '¿Necesito ser socio?', respuesta: 'No.' }]);

    expect(elemento.querySelector('app-formulario-contacto')).not.toBeNull();
  });
});
