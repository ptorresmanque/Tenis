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
  let api: {
    delMes: ReturnType<typeof vi.fn>;
    cobrar: ReturnType<typeof vi.fn>;
    ajustar: ReturnType<typeof vi.fn>;
  };

  const montar = async (mes: MesDeCuotas) => {
    api = {
      delMes: vi.fn().mockResolvedValue(mes),
      cobrar: vi.fn().mockResolvedValue(UNA),
      ajustar: vi.fn().mockResolvedValue(UNA),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: Cuotas, useValue: api }],
    });

    fixture = TestBed.createComponent(PanelDeCuotas);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const apretar = async (etiqueta: string) => {
    Array.from(elemento().querySelectorAll('button'))
      .find((b) => b.textContent?.includes(etiqueta))
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

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

  it('**cobrar en el mesón dice hasta cuándo quedó al día**', async () => {
    // Es lo que el socio pregunta a continuación, y con la fila ya marcada como pagada
    // el admin no tendría de dónde leerlo.
    await apretar('Efectivo');

    expect(api.cobrar).toHaveBeenCalledWith(1, 'EFECTIVO');
    expect(elemento().textContent).toContain('Carolina Díaz');
    expect(elemento().textContent).toContain('hasta fin de 2026-08');
  });

  it('la transferencia es el otro botón, no un menú', async () => {
    await apretar('Transferencia');

    expect(api.cobrar).toHaveBeenCalledWith(1, 'TRANSFERENCIA');
  });

  it('**la ya pagada no ofrece cobrar, y dice con qué se pagó**', async () => {
    await montar({
      ...MES,
      cuotas: [{ ...UNA, estado: 'PAGADA', medio: 'TRANSFERENCIA' }],
    });

    expect(elemento().textContent).toContain('Transferencia');
    expect(
      Array.from(elemento().querySelectorAll('button')).some((b) =>
        b.textContent?.includes('Efectivo'),
      ),
    ).toBe(false);
  });

  it('el rechazo del servidor se muestra tal como viene', async () => {
    // "Esa cuota ya estaba pagada" es el que importa: pasa cuando dos personas cobran
    // desde dos pantallas.
    api.cobrar.mockRejectedValue({
      error: { message: 'Esa cuota ya estaba pagada.' },
    });

    await apretar('Efectivo');

    expect(elemento().textContent).toContain('ya estaba pagada');
  });

  it('**la incorporación se marca: el socio nuevo debe dos cuotas ese mes**', async () => {
    // Sin la marca, el club ve el mismo nombre dos veces con montos distintos.
    await montar({
      ...MES,
      cuotas: [
        UNA,
        { ...UNA, id: 3, tipo: 'INCORPORACION', montoClp: 150000 },
      ],
    });

    expect(elemento().textContent).toContain('Incorporación');
    expect((elemento().textContent ?? '').replace(/\s/g, '')).toContain('$150.000');
  });

  it('**cobrar la incorporación no promete vigencia que no da**', async () => {
    // No extiende `alDiaHasta`: compra la entrada, no tiempo. Decir "queda al día
    // hasta fin de mes" mandaría al admin a no cobrar la mensualidad.
    await montar({
      ...MES,
      cuotas: [{ ...UNA, tipo: 'INCORPORACION', montoClp: 150000 }],
    });

    await apretar('Efectivo');

    expect(elemento().textContent).toContain('su mensualidad va aparte');
    expect(elemento().textContent).not.toContain('Queda al día hasta');
  });

  it('**condonar y anular son botones distintos, y la pantalla lo explica**', async () => {
    // Son decisiones opuestas: una dice que el mes se le dio igual y la otra que la
    // cuota no correspondía. Un solo botón "quitar" obligaría a elegir en silencio.
    vi.spyOn(window, 'prompt').mockReturnValue('Estuvo lesionada');

    await apretar('Condonar');
    expect(api.ajustar).toHaveBeenCalledWith(1, {
      condonar: true,
      motivo: 'Estuvo lesionada',
    });
    expect(elemento().textContent).toContain('Queda al día ese mes igual');

    await apretar('Anular');
    expect(api.ajustar).toHaveBeenCalledWith(1, {
      anular: true,
      motivo: 'Estuvo lesionada',
    });
  });

  it('**sin motivo no se manda nada: el servidor lo exigiría igual**', async () => {
    // Cancelar el prompt, o dejarlo en blanco, no es "condonar sin motivo".
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    await apretar('Condonar');

    vi.spyOn(window, 'prompt').mockReturnValue('   ');
    await apretar('Anular');

    expect(api.ajustar).not.toHaveBeenCalled();
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
