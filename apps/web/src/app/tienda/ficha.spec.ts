import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, expect, it, vi } from 'vitest';

import { Auth, UsuarioActual } from '../core/auth/auth';
import { FichaDelProducto } from './ficha';
import { FichaPublica, Tienda } from './tienda.service';

/**
 * T162. La ficha de un producto, `/tienda/:id`: la galería, las variantes con lo
 * disponible, las tallas en los tres sistemas y el precio de socio para quien lo tiene.
 */
describe('FichaDelProducto', () => {
  const foto = (id: number) => ({
    id,
    miniatura: `/api/tienda/fotos/${id}/miniatura`,
    imagen: `/api/tienda/fotos/${id}/imagen`,
  });

  const ASICS: FichaPublica = {
    id: 5,
    nombre: 'Gel Resolution 9',
    descripcion: 'Para canchas duras.\nSuela con garantía de seis meses.',
    categoria: { id: 1, nombre: 'Zapatillas' },
    marca: { id: 3, nombre: 'Asics' },
    precioClp: 119990,
    precioSocioClp: null,
    variantes: [
      { id: 10, etiqueta: '40', talla: 'CL 40 · US 8 · EU 41', disponible: 2 },
      { id: 11, etiqueta: '41', talla: '41', disponible: 0 },
      { id: 12, etiqueta: '42', talla: 'CL 42 · US 9 · EU 43', disponible: 12 },
    ],
    tallas: [
      { tallaCl: '40', tallaUs: '8', tallaEu: '41' },
      { tallaCl: '42', tallaUs: '9', tallaEu: '43' },
    ],
    fotos: [foto(1), foto(2)],
  };

  const SOCIA = { socioId: 7, socioActivo: true, socioAlDia: true } as UsuarioActual;
  const MOROSA = { ...SOCIA, socioAlDia: false };

  const montar = async (
    opciones: {
      ficha?: Promise<FichaPublica | null>;
      usuario?: UsuarioActual | null;
      /** Con una ficha que no llega nunca, esperar a que la página se asiente no termina. */
      esperar?: boolean;
    } = {},
  ) => {
    const ficha = vi.fn().mockReturnValue(opciones.ficha ?? Promise.resolve(ASICS));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [{ path: 'tienda/:id', component: FichaDelProducto }],
          withComponentInputBinding(),
        ),
        { provide: Tienda, useValue: { ficha } },
        { provide: Auth, useValue: { usuario: signal(opciones.usuario ?? null) } },
      ],
    });
    const harness = await RouterTestingHarness.create('/tienda/5');
    const elemento = harness.routeNativeElement!;
    const estable = async () => {
      await harness.fixture.whenStable();
      harness.detectChanges();
    };
    if (opciones.esperar === false) harness.detectChanges();
    else await estable();

    return { elemento, ficha, estable };
  };

  /** Cada variante como se lee: la talla y lo que queda, sin el nombre de los íconos. */
  const variantes = (elemento: HTMLElement) =>
    Array.from(elemento.querySelectorAll('[data-variante]')).map((v) => {
      const copia = v.cloneNode(true) as HTMLElement;
      copia.querySelectorAll('.icono').forEach((icono) => icono.remove());

      return Array.from(copia.children)
        .map((parte) => (parte.textContent ?? '').replace(/\s+/g, ' ').trim())
        .join(' ');
    });

  it('pide la ficha del producto de la URL', async () => {
    const { ficha } = await montar();

    expect(ficha).toHaveBeenCalledWith(5);
  });

  it('muestra el nombre, la marca, el precio y la descripción', async () => {
    const { elemento } = await montar();

    expect(elemento.querySelector('h1')?.textContent).toContain('Gel Resolution 9');
    expect(elemento.textContent).toContain('Asics');
    expect(elemento.textContent).toContain('$119.990');
    expect(elemento.textContent).toContain('Suela con garantía de seis meses.');
  });

  it('**cada variante con su talla y lo que queda**: pocas se cuentan, cero es agotado', async () => {
    const { elemento } = await montar();

    expect(variantes(elemento)).toEqual([
      'CL 40 · US 8 · EU 41 Quedan 2',
      '41 Agotado',
      'CL 42 · US 9 · EU 43 Disponible',
    ]);
  });

  it('la tabla de tallas de la marca, para consultarla', async () => {
    const { elemento } = await montar();

    const filas = Array.from(elemento.querySelectorAll('details tbody tr')).map((f) =>
      Array.from(f.querySelectorAll('td, th')).map((c) => c.textContent?.trim()),
    );
    expect(filas).toEqual([
      ['40', '8', '41'],
      ['42', '9', '43'],
    ]);
  });

  it('sin tabla, no hay nada que desplegar', async () => {
    const { elemento } = await montar({ ficha: Promise.resolve({ ...ASICS, tallas: [] }) });

    expect(elemento.querySelector('details')).toBeNull();
  });

  describe('la galería', () => {
    it('la primera foto en grande, y las demás para cambiarla', async () => {
      const { elemento, estable } = await montar();

      const grande = () => elemento.querySelector<HTMLImageElement>('figure img')!;
      expect(grande().getAttribute('src')).toBe('/api/tienda/fotos/1/imagen');

      const miniaturas = elemento.querySelectorAll<HTMLButtonElement>('figure + ul button');
      expect(miniaturas).toHaveLength(2);
      miniaturas[1].click();
      await estable();

      expect(grande().getAttribute('src')).toBe('/api/tienda/fotos/2/imagen');
      expect(miniaturas[1].getAttribute('aria-pressed')).toBe('true');
    });

    it('con una sola foto, no hay miniaturas', async () => {
      const { elemento } = await montar({
        ficha: Promise.resolve({ ...ASICS, fotos: [foto(1)] }),
      });

      expect(elemento.querySelector('figure + ul')).toBeNull();
    });

    it('sin fotos, un hueco con ícono y no una imagen rota', async () => {
      const { elemento } = await montar({ ficha: Promise.resolve({ ...ASICS, fotos: [] }) });

      expect(elemento.querySelector('figure img')).toBeNull();
    });
  });

  describe('el precio de socio', () => {
    it('**al socio al día le muestra su precio**, y el de siempre como referencia', async () => {
      const { elemento } = await montar({
        ficha: Promise.resolve({ ...ASICS, precioSocioClp: 101992 }),
        usuario: SOCIA,
      });

      const precio = elemento.querySelector('[data-precio]')?.textContent ?? '';
      expect(precio).toContain('Precio socio');
      expect(precio).toContain('$101.992');
      expect(precio).toContain('$119.990');
    });

    it('al socio moroso le dice por qué no lo tiene', async () => {
      const { elemento } = await montar({ usuario: MOROSA });

      expect(elemento.textContent).toContain(
        'Tu descuento de socio vuelve cuando estés al día con la cuota.',
      );
      expect(elemento.querySelector('a[href="/mi-cuenta"]')).not.toBeNull();
    });

    it('a quien no ha entrado lo invita a entrar para verlo', async () => {
      const { elemento } = await montar();

      expect(elemento.querySelector('a[href^="/entrar"]')?.closest('p')?.textContent).toContain(
        'socio',
      );
    });
  });

  it('si la ficha no carga, lo dice, distinto de "no está a la venta"', async () => {
    const { elemento } = await montar({ ficha: Promise.reject(new Error('caída')) });

    expect(elemento.textContent).toContain('No se pudo cargar el producto');
  });

  it('mientras llega, el esqueleto', async () => {
    const { elemento } = await montar({ ficha: new Promise(() => undefined), esperar: false });

    expect(elemento.querySelector('app-esqueleto')).not.toBeNull();
  });

  it('un producto que no está a la venta lo dice y lleva de vuelta a la tienda', async () => {
    // El servicio responde nulo al 404 de la API: un borrador no se distingue de lo que
    // no existe.
    const { elemento } = await montar({ ficha: Promise.resolve(null) });

    expect(elemento.textContent).toContain('Este producto no está a la venta');
    expect(elemento.querySelector('a[href="/tienda"]')).not.toBeNull();
  });
});
