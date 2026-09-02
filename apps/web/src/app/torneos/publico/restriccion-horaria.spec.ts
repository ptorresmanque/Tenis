import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { Franja, RestriccionHoraria } from './restriccion-horaria';

/**
 * T65. Las franjas en que un inscrito no puede jugar.
 *
 * Lo que este archivo cuida: que **el fin de semana ni se ofrezca** —el torneo se juega
 * sábado y domingo— y que editar una franja no mute el arreglo, porque entonces la
 * señal no avisa y el formulario manda al servidor lo que había antes.
 */
describe('RestriccionHoraria', () => {
  let fixture: ComponentFixture<RestriccionHoraria>;

  const montar = async (franjas: Franja[]) => {
    TestBed.resetTestingModule();
    fixture = TestBed.createComponent(RestriccionHoraria);
    fixture.componentRef.setInput('franjas', franjas);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;

  const apretar = async (etiqueta: string) => {
    Array.from(elemento().querySelectorAll('button'))
      .find((b) => b.textContent?.trim().startsWith(etiqueta))
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await montar([]);
  });

  it('**no ofrece sábado ni domingo**', async () => {
    await apretar('Agregar');

    const dias = Array.from(elemento().querySelectorAll('option')).map((o) =>
      o.textContent?.trim(),
    );
    expect(dias).toEqual(['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']);
  });

  it('empieza sin ninguna: casi nadie tiene restricciones', () => {
    expect(elemento().querySelectorAll('li')).toHaveLength(0);
    expect(fixture.componentInstance.franjas()).toEqual([]);
  });

  it('agregar deja una franja de lunes a viernes, no del fin de semana', async () => {
    await apretar('Agregar');

    const [franja] = fixture.componentInstance.franjas();
    expect(franja.diaSemana).toBeGreaterThanOrEqual(1);
    expect(franja.diaSemana).toBeLessThanOrEqual(5);
    expect(franja.horaDesde < franja.horaHasta).toBe(true);
  });

  it('se pueden agregar varias, que es el caso del que trabaja', async () => {
    await apretar('Agregar');
    await apretar('Agregar');
    await apretar('Agregar');

    expect(fixture.componentInstance.franjas()).toHaveLength(3);
  });

  it('quitar saca la que se apretó y deja las demás', async () => {
    await montar([
      { diaSemana: 1, horaDesde: '09:00', horaHasta: '12:00' },
      { diaSemana: 3, horaDesde: '18:00', horaHasta: '21:00' },
    ]);

    await apretar('Quitar');

    expect(fixture.componentInstance.franjas()).toEqual([
      { diaSemana: 3, horaDesde: '18:00', horaHasta: '21:00' },
    ]);
  });

  it('**editar una franja no muta el arreglo**', async () => {
    // Con `mutate` la señal no avisa del cambio y el formulario manda al servidor lo
    // que había antes. Se comprueba por identidad, no por contenido.
    const original: Franja[] = [
      { diaSemana: 1, horaDesde: '09:00', horaHasta: '12:00' },
    ];
    await montar(original);

    const campo = elemento().querySelector<HTMLInputElement>(
      'input[type="time"]',
    )!;
    campo.value = '10:00';
    campo.dispatchEvent(new Event('input'));
    campo.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.franjas()).not.toBe(original);
    expect(original[0].horaDesde).toBe('09:00');
  });

  it('dice que el club no lo publica, que es lo que la gente duda', () => {
    expect(elemento().textContent).toContain('no se publica');
  });
});
