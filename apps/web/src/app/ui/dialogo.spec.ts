import { Component, signal, TemplateRef, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialogClose } from '@angular/material/dialog';
import { describe, expect, it } from 'vitest';

import { dialogoSegun } from './dialogo';

/**
 * T252. El MatDialog que reemplaza al `<dialog>` nativo: se abre y se cierra con una señal, y
 * se cierre como se cierre, la señal vuelve a apagarse.
 */
describe('dialogoSegun', () => {
  @Component({
    imports: [MatDialogClose],
    template: `
      <ng-template #plantilla>
        <p>Contenido del diálogo</p>
        <button type="button" mat-dialog-close>Cancelar</button>
      </ng-template>
    `,
  })
  class ConDialogo {
    readonly abierto = signal(false);
    readonly plantilla = viewChild.required<TemplateRef<unknown>>('plantilla');
    cierres = 0;

    constructor() {
      dialogoSegun(this.abierto, this.plantilla, () => {
        this.abierto.set(false);
        this.cierres++;
      });
    }
  }

  const contenedor = () => document.querySelector('mat-dialog-container');

  const montar = async () => {
    const fixture = TestBed.createComponent(ConDialogo);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  };

  const esperar = async (fixture: Awaited<ReturnType<typeof montar>>) => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  it('prender la señal abre el diálogo con la plantilla', async () => {
    const fixture = await montar();
    expect(contenedor()).toBeNull();

    fixture.componentInstance.abierto.set(true);
    await esperar(fixture);

    expect(contenedor()?.textContent).toContain('Contenido del diálogo');
  });

  it('cerrarlo desde adentro apaga la señal', async () => {
    const fixture = await montar();
    fixture.componentInstance.abierto.set(true);
    await esperar(fixture);

    contenedor()!.querySelector<HTMLButtonElement>('button')!.click();
    await esperar(fixture);

    expect(fixture.componentInstance.abierto()).toBe(false);
    expect(fixture.componentInstance.cierres).toBe(1);
    expect(contenedor()).toBeNull();
  });

  it('apagar la señal lo cierra', async () => {
    const fixture = await montar();
    fixture.componentInstance.abierto.set(true);
    await esperar(fixture);

    fixture.componentInstance.abierto.set(false);
    await esperar(fixture);

    expect(contenedor()).toBeNull();
  });

  it('si el componente se va con el diálogo abierto, el diálogo se va con él', async () => {
    const fixture = await montar();
    fixture.componentInstance.abierto.set(true);
    await esperar(fixture);

    fixture.destroy();
    await Promise.resolve();

    expect(contenedor()).toBeNull();
  });
});
