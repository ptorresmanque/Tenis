import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CuotaDelMes, Cuotas, MesDeCuotas } from '../cuotas.service';
import { PanelDeCuotas } from './panel-cuotas';

/**
 * T40. Las cuotas del mes.
 *
 * Lo que este archivo fija: que **abrir el mes sea lo que lo emite**, sin botón. Un
 * botón de "generar cuotas" tiene el mismo problema que el cron que se decidió no
 * tener —falla en silencio si nadie lo aprieta— y encima invita a apretarlo dos veces.
 */
describe('PanelDeCuotas', () => {
  const UNA: CuotaDelMes = {
    id: 1,
    socioId: 7,
    tipo: 'MENSUAL',
    periodo: '2026-08',
    montoClp: 25000,
    descuentoClp: 0,
    motivoDescuento: null,
    estado: 'PENDIENTE',
    pagadaEn: null,
    medio: null,
    socio: { numeroSocio: '001', nombre: 'Carolina Díaz', email: 'caro@club.cl' },
  };

  const MES: MesDeCuotas = {
    periodo: '2026-08',
    cuotas: [UNA, { ...UNA, id: 2, socioId: 8, estado: 'PAGADA' }],
    totalEmitidoClp: 50000,
    totalPagadoClp: 25000,
  };

  let fixture: ComponentFixture<PanelDeCuotas>;
  let api: { delMes: ReturnType<typeof vi.fn> };

  const montar = async (mes: MesDeCuotas) => {
    api = { delMes: vi.fn().mockResolvedValue(mes) };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: Cuotas, useValue: api }],
    });

    fixture = TestBed.createComponent(PanelDeCuotas);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await montar(MES);
  });

  it('**pide el mes al abrir: no hay botón de emitir**', async () => {
    expect(api.delMes).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}$/));

    const emitir = Array.from(elemento().querySelectorAll('button')).find((b) =>
      /emitir|generar/i.test(b.textContent ?? ''),
    );
    expect(emitir).toBeUndefined();
  });

  it('muestra lo emitido, lo pagado y lo que falta cobrar', () => {
    const texto = elemento().textContent ?? '';

    expect(texto.replace(/\s/g, '')).toContain('$50.000');
    expect(texto.replace(/\s/g, '')).toContain('$25.000');
  });

  it('**lo que falta cobrar es la resta de los dos que ya viajaron**', async () => {
    // Un tercer total pedido aparte puede quedar en desacuerdo con estos dos, y en
    // dinero eso es una pantalla que se contradice sola.
    await montar({ ...MES, totalEmitidoClp: 90000, totalPagadoClp: 20000 });

    expect((elemento().textContent ?? '').replace(/\s/g, '')).toContain('$70.000');
  });

  it('distingue la pagada de la que falta', () => {
    const texto = elemento().textContent ?? '';

    expect(texto).toContain('Pagada');
    expect(texto).toContain('Por cobrar');
  });

  it('el descuento se ve, y el monto que se muestra ya lo resta', async () => {
    // Sin esto, el club lee 25.000 en la fila y 15.000 en el total, y no entiende.
    await montar({
      ...MES,
      cuotas: [{ ...UNA, descuentoClp: 10000, motivoDescuento: 'Lesión' }],
      totalEmitidoClp: 15000,
      totalPagadoClp: 0,
    });

    const texto = (elemento().textContent ?? '').replace(/\s/g, '');
    expect(texto).toContain('$15.000');
    expect(texto).toContain('dedescuento');
  });

  it('cambiar el mes vuelve a pedirlo', async () => {
    const campo = elemento().querySelector<HTMLInputElement>('#mes')!;
    campo.value = '2026-09';
    campo.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(api.delMes).toHaveBeenCalledWith('2026-09');
  });

  it('un mes vacío no pide nada al servidor', async () => {
    // El `<input type="month">` devuelve "" al borrarlo, y el servidor lo rechazaría.
    const pedidos = api.delMes.mock.calls.length;
    const campo = elemento().querySelector<HTMLInputElement>('#mes')!;
    campo.value = '';
    campo.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(api.delMes.mock.calls).toHaveLength(pedidos);
  });

  it('un mes sin socios lo dice, en vez de una tabla vacía', async () => {
    await montar({
      periodo: '2026-08',
      cuotas: [],
      totalEmitidoClp: 0,
      totalPagadoClp: 0,
    });

    expect(elemento().textContent).toContain('Ninguna cuota en este mes');
  });
});
