import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { PedidosPanel } from './pedidos';
import { PedidoDelPanel, PedidosDeLaTiendaAdmin } from './pedidos.service';

/**
 * T169. La lista de pedidos del panel: por omisión lo que hay que atender, con filtros por
 * estado y canal, y las marcas que el club tiene que ver al tiro.
 */
describe('PedidosPanel', () => {
  const pedido = (datos: Partial<PedidoDelPanel>): PedidoDelPanel => ({
    id: 12,
    canal: 'EN_LINEA',
    estado: 'PAGADO',
    entrega: 'RETIRO',
    nombre: 'Camila Rojas',
    email: 'camila@correo.test',
    totalClp: 263970,
    creadoEn: '2026-10-12T15:00:00.000Z',
    pagadoEn: '2026-10-12T15:03:00.000Z',
    requiereRevision: false,
    sinRetirar: false,
    lineas: 2,
    ...datos,
  });

  const montar = async (lista: PedidoDelPanel[]) => {
    const api = { listar: vi.fn().mockResolvedValue(lista) };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: PedidosDeLaTiendaAdmin, useValue: api }],
    });
    const fixture = TestBed.createComponent(PedidosPanel);
    const elemento = fixture.nativeElement as HTMLElement;
    const estable = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };
    await estable();

    const filas = () => Array.from(elemento.querySelectorAll<HTMLElement>('tbody tr'));
    const elegir = async (etiqueta: string, valor: string) => {
      const select = Array.from(elemento.querySelectorAll('select')).find(
        (s) => s.labels?.[0]?.textContent?.trim() === etiqueta,
      )!;
      select.value = valor;
      select.dispatchEvent(new Event('change'));
      await estable();
    };

    return { elemento, api, filas, elegir };
  };

  it('**por omisión pide lo que hay que atender**, y cada pedido con su enlace', async () => {
    const { api, filas } = await montar([pedido({})]);

    expect(api.listar).toHaveBeenCalledWith({ estado: null, canal: null });
    const fila = filas()[0];
    expect(fila.textContent).toContain('N.º 12');
    expect(fila.textContent).toContain('Camila Rojas');
    expect(fila.textContent).toContain('$263.970');
    expect(fila.textContent).toContain('Retiro');
    expect(fila.querySelector('a')?.getAttribute('href')).toBe('/administracion/tienda/pedidos/12');
  });

  it('filtra por estado y por canal', async () => {
    const { api, elegir } = await montar([]);

    await elegir('Estado', 'EXPIRADO');
    await elegir('Canal', 'MESON');

    expect(api.listar).toHaveBeenLastCalledWith({ estado: 'EXPIRADO', canal: 'MESON' });
  });

  it('**las marcas a la vista**: requiere revisión y 30 días sin retirar', async () => {
    const { filas } = await montar([
      pedido({ id: 1, requiereRevision: true }),
      pedido({ id: 2, estado: 'LISTO_PARA_RETIRO', sinRetirar: true }),
      pedido({ id: 3 }),
    ]);

    expect(filas()[0].textContent).toContain('Requiere revisión');
    expect(filas()[1].textContent).toContain('30 días sin retirar');
    expect(filas()[2].textContent).not.toContain('Requiere revisión');
  });

  it('sin pedidos, lo dice', async () => {
    const { elemento } = await montar([]);

    expect(elemento.textContent).toContain('No hay pedidos');
  });
});
