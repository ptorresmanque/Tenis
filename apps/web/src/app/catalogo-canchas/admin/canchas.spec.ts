import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { AdminCanchas, Advertencia, HorasSinTarifa } from './admin-canchas.service';
import { PantallaDeCanchas } from './canchas';

/**
 * T288 (SPEC-panel.md D1). Las canchas, el horario y las tarifas del club, que iban una debajo
 * de la otra, en una pantalla con pestañas. La alarma de horas sin tarifa queda arriba de las
 * tres: es lo único de la pantalla que cuesta plata si nadie lo mira.
 */
describe('La pantalla de canchas', () => {
  const montar = async (advertencias: Advertencia[] = []) => {
    const api = { advertencias: vi.fn().mockResolvedValue(advertencias) };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AdminCanchas, useValue: api }],
    });
    const fixture = TestBed.createComponent(PantallaDeCanchas);
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, api, el: fixture.nativeElement as HTMLElement };
  };

  const SIN_TARIFA: Advertencia = {
    canchaId: 1,
    nombre: 'Cancha 1',
    // 11:00Z son las 07:00 en el club: la alarma se lee en la hora del club, que es la que el
    // admin va a buscar en el horario.
    sinTarifa: ['2026-08-17T11:00:00.000Z'],
  };

  it('se titula como su ítem del menú, sin acciones en la cabecera (TV7.2)', async () => {
    const { el } = await montar();
    const cabecera = el.querySelector('.cabecera-panel');

    expect(cabecera?.querySelector('h1')?.textContent?.trim()).toBe('Canchas');
    expect(cabecera?.querySelectorAll('button, a').length).toBe(0);
  });

  it('**tiene las pestañas Canchas, Horario y Tarifas, cada una con su ruta**', async () => {
    const { el } = await montar();
    const pestanas = [...el.querySelectorAll('nav[mat-tab-nav-bar] a')];

    expect(pestanas.map((a) => a.textContent?.trim())).toEqual(['Canchas', 'Horario', 'Tarifas']);
    expect(pestanas.map((a) => a.getAttribute('href'))).toEqual([
      '/administracion/canchas',
      '/administracion/canchas/horario',
      '/administracion/canchas/tarifas',
    ]);
  });

  it('**la alarma va arriba de las pestañas**, con qué horas y en qué cancha', async () => {
    const { el } = await montar([SIN_TARIFA]);
    const alarma = el.querySelector('section[aria-labelledby="titulo-advertencias"]');

    expect(alarma?.textContent).toContain('Horas sin tarifa hoy');
    expect(alarma?.textContent).toContain('Cancha 1');
    expect(alarma?.textContent).toContain('07:00');
    // Antes de la barra: se ve en las tres pestañas.
    const barra = el.querySelector('nav[mat-tab-nav-bar]');
    expect(alarma!.compareDocumentPosition(barra!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('el rótulo de la alarma va en rojo: es lo único que pide hacer algo hoy (TV7.2)', async () => {
    const { el } = await montar([SIN_TARIFA]);
    const rotulo = el.querySelector('#titulo-advertencias');

    expect(rotulo?.classList).toContain('rotulo-seccion');
    expect(rotulo?.classList).toContain('bg-destructive');
  });

  it('sin horas sueltas no muestra la alarma', async () => {
    const { el } = await montar();

    expect(el.textContent).not.toContain('Horas sin tarifa hoy');
  });

  it('**lo que se guarda en una pestaña relee la alarma**: lo piden con HorasSinTarifa', async () => {
    const { fixture, api } = await montar();
    api.advertencias.mockResolvedValue([SIN_TARIFA]);

    fixture.debugElement.injector.get(HorasSinTarifa).recargar();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.advertencias).toHaveBeenCalledTimes(2);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Horas sin tarifa hoy');
  });
});
