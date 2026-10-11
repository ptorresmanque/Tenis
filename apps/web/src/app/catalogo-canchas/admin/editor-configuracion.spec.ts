import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminCanchas, ReglasDelClub } from './admin-canchas.service';
import { EditorConfiguracion } from './editor-configuracion';

/**
 * T30. Las reglas del club. Hasta acá el panel las nombraba —"vale el general del
 * club"— sin decir dónde se cambian.
 */
describe('EditorConfiguracion', () => {
  const REGLAS: ReglasDelClub = {
    cupoDiarioSocioReservas: 1,
    cupoPicoSemanalReservas: 2,
    invitadosPorMes: 4,
    horasMinModificacion: 6,
    horasReembolsoTotal: 24,
    diasSancionNoUso: 15,
    cuotaMensualClp: 25000,
    cuotaIncorporacionClp: 150000,
  };

  let fixture: ComponentFixture<EditorConfiguracion>;
  let api: {
    configuracion: ReturnType<typeof vi.fn>;
    fijarConfiguracion: ReturnType<typeof vi.fn>;
  };

  const montar = async (reglas: ReglasDelClub | Error = REGLAS) => {
    api = {
      configuracion: vi.fn(() =>
        reglas instanceof Error ? Promise.reject(reglas) : Promise.resolve(reglas),
      ),
      fijarConfiguracion: vi.fn().mockResolvedValue(reglas),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: AdminCanchas, useValue: api }],
    });

    fixture = TestBed.createComponent(EditorConfiguracion);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  const campo = (id: string) =>
    (fixture.nativeElement as HTMLElement).querySelector(
      `#${id}`,
    ) as HTMLInputElement;

  const escribir = async (id: string, valor: string) => {
    const input = campo(id);
    input.value = valor;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const guardar = async () => {
    (
      (fixture.nativeElement as HTMLElement).querySelector(
        'button[type="submit"]',
      ) as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await montar();
  });

  it('la sección se encabeza con un rótulo, como el resto del panel (TV7.2)', () => {
    const titulo = (fixture.nativeElement as HTMLElement).querySelector('section > h2');

    expect(titulo?.textContent).toContain('Reglas del club');
    expect(titulo?.classList.contains('rotulo-seccion')).toBe(true);
  });

  it('llega con las reglas vigentes puestas, no con campos vacíos', () => {
    // Un formulario en blanco obliga a adivinar qué había antes, y guardar sin
    // querer cambiaría las seis reglas de una vez.
    expect(campo('cupoDiarioSocioReservas').value).toBe('1');
    expect(campo('invitadosPorMes').value).toBe('4');
    expect(campo('horasReembolsoTotal').value).toBe('24');
  });

  it('la regla de invitados dice que cuenta reservas, no personas (T105)', () => {
    const texto = (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ');

    expect(texto).toContain('Reservas con invitados por mes');
    expect(texto).toContain('cuenta como una');
  });

  it('**ya no ofrece la duración del bloque: la elige quien reserva** (T92)', () => {
    // Desde T78 la grilla empieza cada media hora y cada reserva dura 1 hora o 1 hora y
    // media. Un campo que no manda sobre nada invita a cambiarlo y esperar un efecto.
    expect(campo('duracionBloqueMin')).toBeNull();
    expect(texto()).not.toContain('Duración del bloque');
  });

  it('guarda lo que quedó en el formulario', async () => {
    await escribir('invitadosPorMes', '6');
    await guardar();

    expect(api.fijarConfiguracion).toHaveBeenCalledWith(
      expect.objectContaining({ invitadosPorMes: 6 }),
    );
  });

  it('**los cupos dicen "reservas", no "horas"** (T84)', () => {
    // Cuentan reservas: una de 1 hora y media también es una. "(horas)" haría que el
    // club pusiera 2 creyendo que así el socio puede jugar 1 hora y media.
    expect(texto()).toContain('Cupo diario del socio (reservas)');
    expect(texto()).toContain('Cupo semanal en horario pico (reservas)');
    expect(texto()).not.toMatch(/Cupo[^(]*\(horas\)/);
  });

  it('no manda un campo vacío, ni lo convierte en cero', async () => {
    // `Number('')` es 0. Sin este freno, borrar el cupo diario y guardar dejaría al
    // club en "cero reservas por socio", que es cerrar las reservas sin querer.
    await escribir('cupoDiarioSocioReservas', '');
    await guardar();

    expect(api.fijarConfiguracion).not.toHaveBeenCalled();
    expect(texto()).toContain('ninguna puede quedar vacía');
  });

  describe('las cuotas del socio', () => {
    it('**trae la mensualidad y la incorporación con su monto vigente**', () => {
      expect(texto()).toContain('Cuotas del socio');
      expect(campo('cuotaMensualClp').value).toBe('25000');
      expect(campo('cuotaIncorporacionClp').value).toBe('150000');
    });

    it('**cambiar la mensualidad la manda**', async () => {
      await escribir('cuotaMensualClp', '32000');
      await guardar();

      expect(api.fijarConfiguracion).toHaveBeenCalledWith(
        expect.objectContaining({ cuotaMensualClp: 32000 }),
      );
    });

    it('**avisa que las cuotas ya emitidas no cambian**', () => {
      expect(texto()).toContain('las ya emitidas mantienen su monto');
    });
  });

  it('muestra el motivo que dio el servidor, no uno genérico', async () => {
    api.fijarConfiguracion.mockRejectedValue({
      error: { message: 'El cupo diario del socio tiene que ser un número entero desde 0.' },
    });

    await guardar();

    expect(texto()).toContain('tiene que ser un número entero desde 0');
  });

  // `value()` de un resource lanza en estado de error aunque tenga `defaultValue`.
  it('si las reglas no cargan, lo dice', async () => {
    await montar(new Error('la API no respondió'));

    expect(texto()).toContain('No se pudieron cargar las reglas del club');
  });
});
