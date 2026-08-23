import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { Campo, CampoControl } from './campo';
import { Paginacion } from './paginacion';
import { Selector } from './selector';

/**
 * Las tres primitivas que tienen lógica y no solo clases.
 *
 * Las otras cuatro —insignia, aviso, estado vacío y barra fija— son marcado con
 * una tabla de variantes, y lo único que puede romperse en ellas es el
 * contraste, que mide `design-tokens.spec.ts` leyendo esa misma tabla.
 */

describe('Campo', () => {
  @Component({
    imports: [Campo, CampoControl],
    template: `
      <app-campo etiqueta="Correo" [ayuda]="ayuda()" [error]="error()">
        <input appCampoControl type="email" class="campo" />
      </app-campo>
      <!-- Dos en la misma vista: es el caso que rompía con una variable de
           plantilla, porque las dos se habrían llamado #control. -->
      <app-campo etiqueta="Teléfono" ayuda="Con el +56 adelante">
        <input appCampoControl type="tel" class="campo" />
      </app-campo>
    `,
  })
  class Host {
    readonly ayuda = signal('Te llega ahí la confirmación');
    readonly error = signal('');
  }

  function montar() {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    const elemento = fixture.nativeElement as HTMLElement;

    return {
      fixture,
      host: fixture.componentInstance,
      input: elemento.querySelector('input')!,
      campos: [...elemento.querySelectorAll('app-campo')],
      descripcion: () =>
        (elemento.querySelector('input')!.getAttribute('aria-describedby') ?? '')
          .split(' ')
          .filter(Boolean)
          .map((id) => elemento.querySelector(`#${id}`)?.textContent?.trim()),
    };
  }

  it('dos campos en el mismo formulario no se pisan los ids', () => {
    const { campos } = montar();

    const ids = campos.map((campo) => campo.querySelector('span[id]')?.id);

    expect(ids.filter(Boolean)).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('la etiqueta envuelve al control, así que enfocarla lo enfoca', () => {
    const { input } = montar();

    // Sin `for`/`id`: el <label> de arriba ya es el ancestro del control. Un id
    // que se pierde en un refactor rompe la asociación sin que se note.
    expect(input.closest('label')).not.toBeNull();
  });

  it('el control apunta a su ayuda', () => {
    const { descripcion } = montar();

    expect(descripcion()).toEqual(['Te llega ahí la confirmación']);
  });

  it('cuando hay error, el control apunta a los dos y se marca inválido', () => {
    const { fixture, host, input, descripcion } = montar();

    host.error.set('Ese correo ya tiene cuenta');
    fixture.detectChanges();

    expect(descripcion()).toEqual([
      'Te llega ahí la confirmación',
      'Ese correo ya tiene cuenta',
    ]);
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('al corregirlo deja de estar inválido', () => {
    // El campo que queda marcado para siempre se anuncia mal en cada visita
    // siguiente, y quien lo escucha no tiene forma de saber que ya está bien.
    const { fixture, host, input } = montar();

    host.error.set('Ese correo ya tiene cuenta');
    fixture.detectChanges();
    host.error.set('');
    fixture.detectChanges();

    expect(input.hasAttribute('aria-invalid')).toBe(false);
  });
});

describe('Paginación', () => {
  @Component({
    imports: [Paginacion],
    template: `
      <app-paginacion [(pagina)]="pagina" [total]="total()" [porPagina]="10" />
    `,
  })
  class Host {
    readonly pagina = signal(1);
    readonly total = signal(25);
  }

  function montar() {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    const elemento = fixture.nativeElement as HTMLElement;
    const botones = [...elemento.querySelectorAll('button')];

    return {
      fixture,
      host: fixture.componentInstance,
      anterior: botones[0],
      siguiente: botones[1],
      cuenta: () => elemento.querySelector('p')?.textContent?.trim(),
    };
  }

  it('cuenta las páginas por lo alto: 25 en tandas de 10 son 3', () => {
    expect(montar().cuenta()).toBe('Página 1 de 3');
  });

  it('en la primera no se puede ir atrás, y en la última no adelante', () => {
    const { fixture, host, anterior, siguiente } = montar();

    expect(anterior.disabled).toBe(true);

    host.pagina.set(3);
    fixture.detectChanges();

    expect(siguiente.disabled).toBe(true);
  });

  it('avanzar y retroceder le avisan al de afuera', () => {
    const { fixture, host, anterior, siguiente } = montar();

    siguiente.click();
    fixture.detectChanges();
    expect(host.pagina()).toBe(2);

    anterior.click();
    fixture.detectChanges();
    expect(host.pagina()).toBe(1);
  });

  it('una lista vacía sigue siendo una página, no cero', () => {
    const { fixture, host, cuenta } = montar();

    host.total.set(0);
    fixture.detectChanges();

    expect(cuenta()).toBe('Página 1 de 1');
  });
});

describe('Selector', () => {
  @Component({
    imports: [Selector],
    template: `
      <app-selector
        etiqueta="Filtrar canchas"
        [(valor)]="filtro"
        [opciones]="[
          { valor: 'todas', etiqueta: 'Todas' },
          { valor: 'techadas', etiqueta: 'Techadas' },
          { valor: 'luz', etiqueta: 'Con iluminación', deshabilitada: true },
        ]"
      />
    `,
  })
  class Host {
    readonly filtro = signal('todas');
  }

  function montar() {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    const elemento = fixture.nativeElement as HTMLElement;

    return {
      fixture,
      host: fixture.componentInstance,
      radios: [...elemento.querySelectorAll<HTMLInputElement>('input[type=radio]')],
      grupo: elemento.querySelector('fieldset')!,
    };
  }

  it('son radios de verdad, con nombre de grupo compartido', () => {
    // De ahí salen gratis las flechas del teclado y el "opción 2 de 3" del
    // lector de pantalla, que con botones sueltos habría que escribir a mano.
    const { radios } = montar();

    expect(radios).toHaveLength(3);
    expect(new Set(radios.map((r) => r.name)).size).toBe(1);
  });

  it('el grupo se anuncia con su nombre', () => {
    expect(montar().grupo.textContent).toContain('Filtrar canchas');
  });

  it('marca el elegido y avisa el cambio', () => {
    const { fixture, host, radios } = montar();

    expect(radios[0].checked).toBe(true);

    radios[1].click();
    fixture.detectChanges();

    expect(host.filtro()).toBe('techadas');
    expect(radios[1].checked).toBe(true);
  });

  it('una opción deshabilitada no se puede elegir', () => {
    const { fixture, host, radios } = montar();

    expect(radios[2].disabled).toBe(true);

    radios[2].click();
    fixture.detectChanges();

    expect(host.filtro()).toBe('todas');
  });
});
