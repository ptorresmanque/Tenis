import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { FichaDeCuenta, Usuarios } from '../usuarios.service';
import { FichaPersona } from './ficha-persona';

/**
 * T298 (SPEC-panel.md D2 y A7). La ficha de una cuenta, en su ruta: Datos · Tipos · Cuota.
 * «Cuota» es solo de los socios.
 */
describe('La ficha de una cuenta', () => {
  const ANA: FichaDeCuenta = {
    id: 7,
    nombre: 'Ana',
    apellido: 'Rojas',
    email: 'ana@ejemplo.cl',
    telefono: '56911112222',
    creadoEn: '2026-01-10T12:00:00.000Z',
    esAdmin: false,
    esGestor: false,
    socio: null,
    profesor: null,
  };

  const montar = async (cuenta: FichaDeCuenta | Error) => {
    const ficha = vi.fn(() =>
      cuenta instanceof Error ? Promise.reject(cuenta) : Promise.resolve(cuenta),
    );
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Usuarios, useValue: { ficha } }],
    });
    const fixture = TestBed.createComponent(FichaPersona);
    // El id de la ruta: el router se lo da como input.
    fixture.componentRef.setInput('id', '7');
    await fixture.whenStable();
    fixture.detectChanges();
    return { el: fixture.nativeElement as HTMLElement, ficha };
  };

  const pestanas = (el: HTMLElement) =>
    [...el.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent?.trim());

  it('**pide la cuenta de la ruta y se titula con su nombre**, con la vuelta a Personas', async () => {
    const { el, ficha } = await montar(ANA);

    expect(ficha).toHaveBeenCalledWith(7);
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Ana Rojas');
    expect(el.querySelector('a[href="/administracion/personas"]')).not.toBeNull();
  });

  it('**sin ser socia: Datos y Tipos**', async () => {
    const { el } = await montar(ANA);

    expect(pestanas(el)).toEqual(['Datos', 'Tipos']);
  });

  it('**socia: Datos, Tipos y Cuota**', async () => {
    const { el } = await montar({
      ...ANA,
      socio: {
        id: 3,
        numeroSocio: '012',
        estado: 'ACTIVO',
        alDiaHasta: '2099-12-31T00:00:00.000Z',
        sancionadoHasta: null,
      },
    });

    expect(pestanas(el)).toEqual(['Datos', 'Tipos', 'Cuota']);
  });

  it('«Datos» muestra su correo y su teléfono', async () => {
    const { el } = await montar(ANA);
    const texto = el.textContent!.replace(/\s+/g, ' ');

    expect(texto).toContain('ana@ejemplo.cl');
    expect(texto).toContain('+56 9 1111 2222');
  });

  it('si la cuenta no carga, lo dice', async () => {
    const { el } = await montar(new Error('404'));

    expect(el.textContent).toContain('No se pudo cargar esta cuenta');
  });
});
