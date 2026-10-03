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
    duracionBloqueMin: 60,
    cupoDiarioSocioHoras: 1,
    cupoPicoSemanalHoras: 2,
    invitadosPorMes: 4,
    horasMinModificacion: 6,
    horasReembolsoTotal: 24,
    diasSancionNoUso: 15,
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
    expect(campo('duracionBloqueMin').value).toBe('60');
    expect(campo('invitadosPorMes').value).toBe('4');
    expect(campo('horasReembolsoTotal').value).toBe('24');
  });

  it('guarda lo que quedó en el formulario', async () => {
    await escribir('invitadosPorMes', '6');
    await guardar();

    expect(api.fijarConfiguracion).toHaveBeenCalledWith(
      expect.objectContaining({ invitadosPorMes: 6 }),
    );
  });

  it('avisa qué pasa al cambiar la duración del bloque, antes de guardar', async () => {
    expect(texto()).not.toContain('redibuja la grilla');

    await escribir('duracionBloqueMin', '90');

    // Es el único cambio de esta pantalla que se ve en la grilla de todas las
    // canchas. Y lo que más asusta —"¿se me caen las reservas?"— se responde acá,
    // no después de guardar.
    expect(texto()).toContain('redibuja la grilla');
    expect(texto()).toContain('no toca ninguna reserva');
  });

  it('no manda un campo vacío, ni lo convierte en cero', async () => {
    // `Number('')` es 0. Sin este freno, borrar el cupo diario y guardar dejaría al
    // club en "cero horas por socio", que es cerrar las reservas sin querer.
    await escribir('cupoDiarioSocioHoras', '');
    await guardar();

    expect(api.fijarConfiguracion).not.toHaveBeenCalled();
    expect(texto()).toContain('ninguna puede quedar vacía');
  });

  it('muestra el motivo que dio el servidor, no uno genérico', async () => {
    api.fijarConfiguracion.mockRejectedValue({
      error: { message: 'La duración del bloque no puede pasar de 240.' },
    });

    await guardar();

    expect(texto()).toContain('no puede pasar de 240');
  });

  it('al guardar avisa al panel, que relee lo que depende de las reglas', async () => {
    // Cambiar la duración cambia qué horas quedan sin tarifa: la advertencia de
    // arriba del panel se calcula sobre los bloques.
    const avisado = vi.fn();
    fixture.componentRef.instance.guardado.subscribe(avisado);

    await guardar();

    expect(avisado).toHaveBeenCalled();
  });

  // `value()` de un resource lanza en estado de error aunque tenga `defaultValue`.
  it('si las reglas no cargan, lo dice', async () => {
    await montar(new Error('la API no respondió'));

    expect(texto()).toContain('No se pudieron cargar las reglas del club');
  });
});
