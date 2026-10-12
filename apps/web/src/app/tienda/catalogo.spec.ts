import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, expect, it, vi } from 'vitest';

import { Auth, UsuarioActual } from '../core/auth/auth';
import { TiendaEnLinea } from './catalogo';
import { FiltrosDelCatalogo, ProductoDelCatalogo, Tienda } from './tienda.service';

/**
 * T162. El catálogo público, `/tienda`: categorías, filtros y orden.
 *
 * **Los filtros viven en la URL**: quien abre una ficha y vuelve atrás encuentra la lista
 * como la dejó, y un enlace con filtros se puede compartir.
 */
describe('TiendaEnLinea', () => {
  const FILTROS: FiltrosDelCatalogo = {
    categorias: [
      { id: 1, nombre: 'Zapatillas' },
      { id: 2, nombre: 'Raquetas' },
    ],
    marcas: [{ id: 7, nombre: 'Babolat' }],
    tallas: ['40', '41'],
    precioMin: 9990,
    precioMax: 249990,
  };

  const producto = (datos: Partial<ProductoDelCatalogo>): ProductoDelCatalogo => ({
    id: 1,
    nombre: 'Pure Drive',
    categoria: { id: 2, nombre: 'Raquetas' },
    marca: { id: 7, nombre: 'Babolat' },
    precioClp: 249990,
    precioSocioClp: null,
    foto: '/api/tienda/fotos/9/miniatura',
    agotado: false,
    ...datos,
  });

  const PURE_DRIVE = producto({});
  const TUBO = producto({
    id: 2,
    nombre: 'Tubo Head Tour',
    marca: null,
    precioClp: 6990,
    foto: null,
    agotado: true,
  });

  const SOCIA = { socioId: 7, socioActivo: true, socioAlDia: true } as UsuarioActual;

  const montar = async (
    url = '/tienda',
    opciones: {
      lista?: ProductoDelCatalogo[];
      usuario?: UsuarioActual | null;
      /** La lista no llega nunca: esperar a que la página se asiente no terminaría. */
      pendiente?: boolean;
    } = {},
  ) => {
    const productos = opciones.pendiente
      ? vi.fn().mockReturnValue(new Promise(() => undefined))
      : vi.fn().mockResolvedValue(opciones.lista ?? [PURE_DRIVE, TUBO]);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'tienda', component: TiendaEnLinea }]),
        {
          provide: Tienda,
          useValue: {
            filtros: signal(FILTROS),
            productos,
          },
        },
        { provide: Auth, useValue: { usuario: signal(opciones.usuario ?? null) } },
      ],
    });
    const harness = await RouterTestingHarness.create(url);
    const elemento = harness.routeNativeElement!;
    const router = TestBed.inject(Router);

    const estable = async () => {
      await harness.fixture.whenStable();
      harness.detectChanges();
    };

    const tarjetas = () =>
      Array.from(elemento.querySelectorAll<HTMLElement>('ul[aria-label] > li'));
    if (opciones.pendiente) harness.detectChanges();
    else await estable();

    return { elemento, router, productos, estable, tarjetas };
  };

  describe('la lista', () => {
    it('cada producto con su marca, su precio y su enlace a la ficha', async () => {
      const { tarjetas } = await montar();

      const [pureDrive, tubo] = tarjetas();
      expect(pureDrive.textContent).toContain('Babolat');
      expect(pureDrive.textContent).toContain('Pure Drive');
      expect(pureDrive.textContent).toContain('$249.990');
      expect(pureDrive.querySelector('a')?.getAttribute('href')).toBe('/tienda/1');
      expect(pureDrive.querySelector('img')?.getAttribute('src')).toBe(
        '/api/tienda/fotos/9/miniatura',
      );
      // Sin foto, un hueco con su ícono y no una imagen rota.
      expect(tubo.querySelector('img')).toBeNull();
    });

    it('mientras llega, el esqueleto', async () => {
      const { elemento } = await montar('/tienda', { pendiente: true });

      expect(elemento.querySelector('app-esqueleto')).not.toBeNull();
    });

    it('lo agotado lo dice, sin esconderlo', async () => {
      const { tarjetas } = await montar();

      expect(tarjetas()[0].textContent).not.toContain('Agotado');
      expect(tarjetas()[1].textContent).toContain('Agotado');
    });

    it('**el precio de socio sale cuando la API lo manda**, junto al de siempre', async () => {
      const { tarjetas } = await montar('/tienda', {
        lista: [producto({ precioSocioClp: 212491 })],
        usuario: SOCIA,
      });

      expect(tarjetas()[0].textContent).toContain('$249.990');
      expect(tarjetas()[0].textContent).toContain('Socio $212.491');
    });

    it('a quien no ha entrado le cuenta que el socio paga menos', async () => {
      const { elemento } = await montar();

      const entrar = elemento.querySelector<HTMLAnchorElement>('a[href^="/entrar"]');
      expect(entrar?.closest('p')?.textContent).toContain('socio');
    });

    it('con sesión, no se lo repite', async () => {
      const { elemento } = await montar('/tienda', { usuario: SOCIA });

      expect(elemento.querySelector('a[href^="/entrar"]')).toBeNull();
    });
  });

  describe('los filtros, en la URL', () => {
    it('**los lee de la URL** y se los pasa a la API', async () => {
      const { productos } = await montar(
        '/tienda?categoriaId=2&marcaId=7&talla=40&precioMin=10000&precioMax=90000&orden=precio-desc',
      );

      expect(productos).toHaveBeenLastCalledWith({
        categoriaId: 2,
        marcaId: 7,
        talla: '40',
        precioMin: 10000,
        precioMax: 90000,
        orden: 'precio-desc',
      });
    });

    it('elegir una categoría la pone en la URL y vuelve a pedir la lista', async () => {
      const { elemento, router, productos, estable } = await montar('/tienda?orden=precio-asc');

      const raquetas = Array.from(elemento.querySelectorAll('label')).find(
        (l) => l.textContent?.trim() === 'Raquetas',
      );
      raquetas!.querySelector('input')!.click();
      await estable();

      expect(router.url).toBe('/tienda?orden=precio-asc&categoriaId=2');
      expect(productos).toHaveBeenLastCalledWith(
        expect.objectContaining({ categoriaId: 2, orden: 'precio-asc' }),
      );
    });

    it('"Todo" saca la categoría de la URL', async () => {
      const { elemento, router, estable } = await montar('/tienda?categoriaId=2');

      const todo = Array.from(elemento.querySelectorAll('label')).find(
        (l) => l.textContent?.trim() === 'Todo',
      );
      todo!.querySelector('input')!.click();
      await estable();

      expect(router.url).toBe('/tienda');
    });

    it('la marca, la talla y el orden se eligen de listas con lo que hay', async () => {
      const { elemento, router, estable } = await montar();

      const elegir = async (etiqueta: string, valor: string) => {
        const select = Array.from(elemento.querySelectorAll('select')).find(
          (s) => s.labels?.[0]?.textContent?.trim() === etiqueta,
        )!;
        select.value = valor;
        select.dispatchEvent(new Event('change'));
        await estable();
      };

      await elegir('Marca', '7');
      await elegir('Talla', '41');
      await elegir('Ordenar por', 'precio-asc');

      expect(router.url).toBe('/tienda?marcaId=7&talla=41&orden=precio-asc');
    });

    it('**al volver con filtros en la URL, cada lista muestra lo elegido**', async () => {
      // Las opciones llegan después que el valor del select: con [value] en el select, el
      // navegador lo descartaba y "Talla" se veía en "Todas" con la lista filtrada.
      const { elemento } = await montar('/tienda?marcaId=7&talla=41&orden=precio-asc');

      const valor = (id: string) => elemento.querySelector<HTMLSelectElement>(`#${id}`)!.value;
      expect([valor('filtro-marca'), valor('filtro-talla'), valor('filtro-orden')]).toEqual([
        '7',
        '41',
        'precio-asc',
      ]);
    });

    it('el rango de precio entra al salir del campo', async () => {
      const { elemento, router, estable } = await montar();

      const desde = elemento.querySelector<HTMLInputElement>('input[name="precioMin"]')!;
      desde.value = '50000';
      desde.dispatchEvent(new Event('change'));
      await estable();

      expect(router.url).toBe('/tienda?precioMin=50000');
    });

    it('sin nada que calce con los filtros, lo dice y ofrece quitarlos', async () => {
      const { elemento, router, estable } = await montar('/tienda?talla=48', { lista: [] });

      expect(elemento.textContent).toContain('Nada calza con esos filtros');
      Array.from(elemento.querySelectorAll('button'))
        .find((b) => b.textContent?.includes('Quitar los filtros'))!
        .click();
      await estable();

      expect(router.url).toBe('/tienda');
    });
  });
});
