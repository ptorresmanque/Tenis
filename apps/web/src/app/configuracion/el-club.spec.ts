import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { TestBed } from '@angular/core/testing';
import { MatExpansionPanelHarness } from '@angular/material/expansion/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { ElClub } from './el-club';

/**
 * T290 (SPEC-panel.md D11). La pestaña «El club» junta tres que eran pestañas: los datos del
 * club, los textos del sitio y las preguntas frecuentes. Cada una en su panel, cerrado, y su
 * formulario se crea (y pide lo suyo) recién al abrirlo.
 */
describe('El club, en Configuración', () => {
  const montar = async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(ElClub);
    fixture.detectChanges();
    const paneles = await TestbedHarnessEnvironment.loader(fixture).getAllHarnesses(
      MatExpansionPanelHarness,
    );
    return { fixture, paneles, el: fixture.nativeElement as HTMLElement };
  };

  it('**tres paneles cerrados: Datos del club, Textos del sitio y Preguntas frecuentes**', async () => {
    const { paneles } = await montar();

    expect(await Promise.all(paneles.map((panel) => panel.getTitle()))).toEqual([
      'Datos del club',
      'Textos del sitio',
      'Preguntas frecuentes',
    ]);
    expect(await Promise.all(paneles.map((panel) => panel.isExpanded()))).toEqual([
      false,
      false,
      false,
    ]);
  });

  it('cada formulario se crea al abrir su panel', async () => {
    const { fixture, el } = await montar();
    expect(el.querySelector('app-textos-del-sitio')).toBeNull();

    // Con un clic y sin el harness: el formulario abierto deja su pedido a la API en curso, y
    // el harness esperaría a que termine.
    el.querySelectorAll<HTMLElement>('mat-expansion-panel-header')[1].click();
    fixture.detectChanges();

    expect(el.querySelector('app-textos-del-sitio')).not.toBeNull();
    expect(el.querySelector('app-datos-del-club')).toBeNull();
  });

  it('abrir una parte no cierra otra, que puede tener cambios sin guardar', async () => {
    const { fixture, el } = await montar();
    const cabeceras = el.querySelectorAll<HTMLElement>('mat-expansion-panel-header');

    cabeceras[0].click();
    cabeceras[1].click();
    fixture.detectChanges();

    expect([...cabeceras].map((cabecera) => cabecera.getAttribute('aria-expanded'))).toEqual([
      'true',
      'true',
      'false',
    ]);
  });
});
