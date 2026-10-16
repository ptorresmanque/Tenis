import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { MatExpansionPanelHarness } from '@angular/material/expansion/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { LugarDelClubPanel } from './lugar-del-club';
import { Servicios } from './servicios';

/**
 * T290 (SPEC-panel.md D11). La pestaña «Servicios» junta la tienda, la cafetería y el gimnasio,
 * que eran tres pestañas con el mismo formulario (T236). Cada uno en su panel, cerrado, y el
 * formulario se crea al abrirlo con su lugar.
 */
describe('Servicios, en Configuración', () => {
  const montar = async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(Servicios);
    fixture.detectChanges();
    const paneles = await TestbedHarnessEnvironment.loader(fixture).getAllHarnesses(
      MatExpansionPanelHarness,
    );
    return { fixture, paneles };
  };

  it('**tres paneles cerrados: Tienda, Cafetería y Gimnasio**', async () => {
    const { paneles } = await montar();

    expect(await Promise.all(paneles.map((panel) => panel.getTitle()))).toEqual([
      'Tienda',
      'Cafetería',
      'Gimnasio',
    ]);
    expect(await Promise.all(paneles.map((panel) => panel.isExpanded()))).toEqual([
      false,
      false,
      false,
    ]);
  });

  it('**al abrir el gimnasio, su formulario es el del gimnasio**', async () => {
    const { fixture } = await montar();
    expect(fixture.debugElement.query(By.directive(LugarDelClubPanel))).toBeNull();

    // Con un clic y sin el harness: el formulario abierto deja su pedido a la API en curso, y
    // el harness esperaría a que termine.
    (fixture.nativeElement as HTMLElement)
      .querySelectorAll<HTMLElement>('mat-expansion-panel-header')[2]
      .click();
    fixture.detectChanges();

    const formulario = fixture.debugElement.query(By.directive(LugarDelClubPanel));
    expect((formulario.componentInstance as LugarDelClubPanel).lugar()).toBe('GIMNASIO');
  });
});
