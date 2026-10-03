import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AdminCanchas,
  Bloqueo,
  CanchaAdmin,
  HoraAfectada,
} from './admin-canchas.service';
import { EditorBloqueos } from './editor-bloqueos';

/**
 * T14 y T36. Cerrar una cancha por mantención. El rango se escribe en hora del club
 * y viaja así: la conversión a instantes la hace el servidor, donde está probada
 * contra los dos domingos en que Chile cambia la hora.
 *
 * Desde T36 el cierre tiene dos pasos, y lo que este archivo ataja es que el
 * segundo no se salte: **cancelar la hora de un socio no tiene deshacer**, así que
 * el admin tiene que ver a quién deja sin cancha antes de apretar.
 */
describe('EditorBloqueos', () => {
  const CANCHA: CanchaAdmin = {
    id: 4,
    nombre: 'Cancha 4',
    superficie: 'CEMENTO',
    techada: false,
    tieneCamara: false,
    iluminacion: false,
    activa: true,
    orden: 1,
    horarios: [],
    franjas: [],
  };

  /** Un bloqueo que termina a las 22:00 del lunes en Santiago: martes en UTC. */
  const DE_NOCHE: Bloqueo = {
    id: 11,
    canchaId: 4,
    inicio: '2026-08-18T00:00:00.000Z',
    fin: '2026-08-18T02:00:00.000Z',
    motivo: 'MANTENCION',
    descripcion: 'Riego',
  };

  let fixture: ComponentFixture<EditorBloqueos>;
  let api: {
    bloqueos: ReturnType<typeof vi.fn>;
    simularCierre: ReturnType<typeof vi.fn>;
    cerrar: ReturnType<typeof vi.fn>;
    borrarBloqueo: ReturnType<typeof vi.fn>;
  };

  /** Una hora tomada y pagada, de las que el cierre se llevaría por delante. */
  const TOMADA: HoraAfectada = {
    id: 77,
    folio: 'AB23CDE',
    inicio: '2026-08-18T14:00:00.000Z',
    fin: '2026-08-18T15:00:00.000Z',
    nombre: 'Rafael Nadal',
    email: 'rafa@ejemplo.cl',
    esSocio: false,
    pagada: true,
    pagoEnCurso: false,
  };

  const montar = async (bloqueos: Bloqueo[] | Error, afectadas: HoraAfectada[] = []) => {
    api = {
      bloqueos: vi.fn(() =>
        bloqueos instanceof Error ? Promise.reject(bloqueos) : Promise.resolve(bloqueos),
      ),
      simularCierre: vi.fn().mockResolvedValue({ afectadas }),
      cerrar: vi.fn().mockResolvedValue({ bloqueoId: 9, canceladas: afectadas }),
      borrarBloqueo: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: AdminCanchas, useValue: api }],
    });

    fixture = TestBed.createComponent(EditorBloqueos);
    fixture.componentRef.setInput('cancha', CANCHA);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const enviar = async () => {
    elemento().querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await montar([DE_NOCHE]);
  });

  it('sin bloqueos lo dice, en vez de quedar en blanco', async () => {
    await montar([]);

    // "Próximos": la API no lista los que ya terminaron, y decir "sin bloqueos"
    // haría dudar de si el de la semana pasada se guardó.
    expect(elemento().textContent).toContain('Sin bloqueos próximos');
  });

  it('muestra el motivo en castellano, no el enum de la base', () => {
    expect(elemento().textContent).toContain('Mantención');
    expect(elemento().textContent).not.toContain('MANTENCION');
  });

  it('muestra las horas en la hora del club', () => {
    // 00:00Z y 02:00Z de un martes de agosto son las 20:00 y 22:00 del lunes.
    expect(elemento().textContent).toContain('20:00');
    expect(elemento().textContent).toContain('22:00');
  });

  it('fecha el bloqueo en el día del club, no en el de UTC', () => {
    // El instante cae un martes en UTC; en el club sigue siendo lunes. Cortar el
    // ISO en vez de convertir mostraría un día más que el que el admin escribió.
    expect(elemento().textContent).toContain('lunes');
    expect(elemento().textContent).not.toContain('martes');
  });

  it('manda el rango en hora del club, sin convertirlo acá', async () => {
    await enviar();

    expect(api.cerrar).toHaveBeenCalledWith(
      expect.objectContaining({
        canchaId: 4,
        horaDesde: '10:00',
        horaHasta: '12:00',
        motivo: 'MANTENCION',
        fechaDesde: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        fechaHasta: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );
  });

  it('un detalle en blanco viaja como nulo, no como cadena vacía', async () => {
    await enviar();

    expect(api.cerrar).toHaveBeenCalledWith(
      expect.objectContaining({ descripcion: null }),
    );
  });

  it('sin horas tomadas debajo, cierra directo y no pregunta nada', async () => {
    // Preguntar por preguntar entrena a la gente a apretar sin leer, y entonces la
    // confirmación del caso que sí importa tampoco se lee.
    await enviar();

    expect(api.cerrar).toHaveBeenCalled();
    expect(elemento().textContent).not.toContain('Cerrar igual');
  });

  it('**con horas tomadas no cierra: muestra a quién deja sin cancha**', async () => {
    await montar([DE_NOCHE], [TOMADA]);

    await enviar();

    expect(api.cerrar).not.toHaveBeenCalled();
    expect(elemento().textContent).toContain('Rafael Nadal');
    expect(elemento().textContent).toContain('1 hora tomada');
    // Que se devuelve, dicho antes de decidir y no después.
    expect(elemento().textContent).toContain('pagada, se devuelve');
  });

  it('avisa que quitar el bloqueo después no devuelve las horas', async () => {
    // Es lo primero que el admin va a suponer, y suponerlo mal significa prometerle
    // a un socio una hora que ya no existe.
    await montar([DE_NOCHE], [TOMADA]);

    await enviar();

    expect(elemento().textContent).toContain('no las devuelve');
  });

  it('confirmar cierra y cuenta a cuántas personas se avisó', async () => {
    await montar([DE_NOCHE], [TOMADA]);
    await enviar();

    Array.from(elemento().querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Cerrar igual'))
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.cerrar).toHaveBeenCalled();
    expect(elemento().textContent).toContain('Avisamos a la persona');
  });

  it('"Mejor no" deja todo como estaba', async () => {
    await montar([DE_NOCHE], [TOMADA]);
    await enviar();

    Array.from(elemento().querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Mejor no'))
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.cerrar).not.toHaveBeenCalled();
    expect(elemento().textContent).not.toContain('Rafael Nadal');
  });

  it('con un pago en curso no deja confirmar, y dice por qué', async () => {
    // El servidor lo rechaza igual; apagar el botón evita ofrecer algo que va a
    // fallar, y la frase explica que no es un capricho: cancelarla ahora dejaría a
    // esa persona sin cancha y sin su plata.
    await montar([DE_NOCHE], [{ ...TOMADA, pagada: false, pagoEnCurso: true }]);

    await enviar();

    expect(elemento().textContent).toContain('pagándose ahora');

    const confirmar = Array.from(elemento().querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Cerrar igual'),
    ) as HTMLButtonElement;

    expect(confirmar.disabled).toBe(true);
  });

  it('quitar un bloqueo lo borra por su número', async () => {
    Array.from(elemento().querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Quitar'))
      ?.click();
    await fixture.whenStable();

    expect(api.borrarBloqueo).toHaveBeenCalledWith(11);
  });

  it('muestra el motivo que dio el servidor cuando rechaza el rango', async () => {
    api.simularCierre.mockRejectedValue({
      error: { message: 'El bloqueo tiene que terminar después de empezar.' },
    });

    await enviar();

    expect(elemento().textContent).toContain(
      'El bloqueo tiene que terminar después de empezar.',
    );
  });

  // `value()` de un resource lanza en estado de error aunque tenga `defaultValue`.
  it('si los bloqueos no cargan, lo dice', async () => {
    await montar(new Error('la API no respondió'));

    expect(elemento().textContent).toContain('No se pudieron cargar los bloqueos');
  });
});
