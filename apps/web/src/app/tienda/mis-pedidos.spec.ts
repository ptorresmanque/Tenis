import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { Auth, UsuarioActual } from '../core/auth/auth';
import { MisPedidos } from './mis-pedidos';
import { PedidoMio, Tienda } from './tienda.service';

/** T166. "Mis pedidos": las compras de quien tiene cuenta, con su enlace. */
describe('MisPedidos', () => {
  const PEDIDO: PedidoMio = {
    id: 12,
    token: 'tok-1',
    estado: 'LISTO_PARA_RETIRO',
    entrega: 'RETIRO',
    totalClp: 263970,
    creadoEn: '2026-10-12T15:00:00.000Z',
    _count: { lineas: 2 },
  };

  const montar = async (usuario: UsuarioActual | null, lista: PedidoMio[] = [PEDIDO]) => {
    const tienda = { misPedidos: vi.fn().mockResolvedValue(lista) };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Tienda, useValue: tienda },
        { provide: Auth, useValue: { usuario: signal(usuario) } },
      ],
    });
    const fixture = TestBed.createComponent(MisPedidos);
    await fixture.whenStable();
    fixture.detectChanges();

    return { elemento: fixture.nativeElement as HTMLElement, tienda };
  };

  const CAMILA = { id: 2, nombre: 'Camila' } as UsuarioActual;

  it('**cada pedido con su número, su fecha, su total, su estado y su enlace**', async () => {
    const { elemento } = await montar(CAMILA);

    const fila = elemento.querySelector('li')!;
    expect(fila.textContent).toContain('N.º 12');
    expect(fila.textContent).toContain('12 de octubre de 2026');
    expect(fila.textContent).toContain('$263.970');
    expect(fila.textContent).toContain('Listo para retirar');
    expect(fila.querySelector('a')?.getAttribute('href')).toBe('/tienda/pedido/tok-1');
  });

  it('sin compras, lo dice y lleva a la tienda', async () => {
    const { elemento } = await montar(CAMILA, []);

    expect(elemento.textContent).toContain('Todavía no tienes compras');
    expect(elemento.querySelector('a[href="/tienda"]')).not.toBeNull();
  });

  it('sin sesión, invita a entrar y no le pregunta nada a la API', async () => {
    const { elemento, tienda } = await montar(null);

    expect(elemento.querySelector('a[href^="/entrar"]')).not.toBeNull();
    expect(tienda.misPedidos).not.toHaveBeenCalled();
  });
});
