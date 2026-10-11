import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AdminCanchas,
  CanchaAdmin,
} from '../../catalogo-canchas/admin/admin-canchas.service';
import { Torneos, Transmision } from '../torneos.service';
import { TransmisionesDelTorneo } from './transmisiones';

/**
 * T68. Anunciar los lives del torneo.
 *
 * Lo que este archivo cuida: que **solo se ofrezcan canchas con cámara**. El servidor
 * rechaza las otras, pero descubrirlo después de anunciar el partido es tarde.
 */
describe('TransmisionesDelTorneo', () => {
  const CON_CAMARA = { id: 1, nombre: 'Cancha 1', tieneCamara: true } as CanchaAdmin;
  const SIN_CAMARA = { id: 2, nombre: 'Cancha 2', tieneCamara: false } as CanchaAdmin;

  const EN_VIVO: Transmision = {
    id: 3,
    canchaId: 1,
    cancha: 'Cancha 1',
    url: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    miniatura: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    titulo: null,
    inicio: '2026-11-07T13:00:00.000Z',
    fin: '2026-11-07T22:00:00.000Z',
  };

  let fixture: ComponentFixture<TransmisionesDelTorneo>;
  let api: {
    transmisiones: ReturnType<typeof vi.fn>;
    anunciarTransmision: ReturnType<typeof vi.fn>;
    quitarTransmision: ReturnType<typeof vi.fn>;
  };

  const montar = async (
    transmisiones: Transmision[] | Error,
    canchas: CanchaAdmin[] | Error = [CON_CAMARA, SIN_CAMARA],
  ) => {
    api = {
      transmisiones: vi.fn(() =>
        transmisiones instanceof Error
          ? Promise.reject(transmisiones)
          : Promise.resolve(transmisiones),
      ),
      anunciarTransmision: vi.fn().mockResolvedValue(EN_VIVO),
      quitarTransmision: vi.fn().mockResolvedValue({ id: 3 }),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Torneos, useValue: api },
        {
          provide: AdminCanchas,
          useValue: {
            canchas: () =>
              canchas instanceof Error ? Promise.reject(canchas) : Promise.resolve(canchas),
          },
        },
      ],
    });

    fixture = TestBed.createComponent(TransmisionesDelTorneo);
    fixture.componentRef.setInput('torneoId', 5);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const texto = () => elemento().textContent ?? '';

  const escribir = async (name: string, valor: string) => {
    // `input`: el `name` también queda en el `app-campo-fecha` que envuelve al campo.
    const campo = elemento().querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
    campo.value = valor;
    campo.dispatchEvent(new Event('input'));
    campo.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const anunciar = async () => {
    elemento().querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await montar([]);
  });

  it('se titula con un h2, como las otras pestañas de la ficha', () => {
    // En la ficha, cada pestaña cuelga del h1 con el nombre del torneo, y en
    // Ajustes sus secciones ya eran h2: con h3 se saltaba un nivel y las
    // pestañas no se oían iguales (revisión de TV7.6).
    expect(elemento().querySelector('section > h2')?.textContent).toContain('Transmisiones');
  });

  it('**solo ofrece las canchas con cámara**', () => {
    const opciones = Array.from(elemento().querySelectorAll('option')).map((o) =>
      o.textContent?.trim(),
    );

    expect(opciones).toContain('Cancha 1');
    expect(opciones).not.toContain('Cancha 2');
  });

  it('**dice que es una cancha por jornada, no un video por partido**', () => {
    expect(texto()).toContain('una cancha durante una jornada');
  });

  it('sin ninguna cámara dice dónde marcarla, en vez de un selector vacío', async () => {
    await montar([], [SIN_CAMARA]);

    expect(texto()).toContain('Márcala en Canchas');
  });

  it('anunciar manda enlace, cancha y ventana', async () => {
    await escribir('enlace', 'https://youtu.be/dQw4w9WgXcQ');
    await escribir('fecha', '2026-11-07');
    const cancha = elemento().querySelector<HTMLSelectElement>('[name="cancha"]')!;
    cancha.value = '1';
    cancha.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    await anunciar();

    expect(api.anunciarTransmision).toHaveBeenCalledWith(5, {
      canchaId: 1,
      enlace: 'https://youtu.be/dQw4w9WgXcQ',
      fecha: '2026-11-07',
      horaDesde: '09:00',
      horaHasta: '19:00',
      titulo: undefined,
    });
  });

  it('**sin día no se manda**: la ventana no se puede adivinar', async () => {
    await escribir('enlace', 'https://youtu.be/dQw4w9WgXcQ');
    const cancha = elemento().querySelector<HTMLSelectElement>('[name="cancha"]')!;
    cancha.value = '1';
    cancha.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    await anunciar();

    expect(api.anunciarTransmision).not.toHaveBeenCalled();
    expect(texto()).toContain('Falta el día');
  });

  it('**la razón del servidor se lee tal cual**: dice qué enlace no sirve', async () => {
    await montar([]);
    api.anunciarTransmision.mockRejectedValue({
      error: { message: 'Ese enlace no es de YouTube.' },
    });
    await escribir('enlace', 'https://vimeo.com/1');
    await escribir('fecha', '2026-11-07');
    const cancha = elemento().querySelector<HTMLSelectElement>('[name="cancha"]')!;
    cancha.value = '1';
    cancha.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    await anunciar();

    expect(texto()).toContain('no es de YouTube');
  });

  it('las anunciadas se listan con su horario', async () => {
    await montar([EN_VIVO]);

    expect(texto()).toContain('Cancha 1');
  });

  it('quitar una la manda al servidor', async () => {
    await montar([EN_VIVO]);
    Array.from(elemento().querySelectorAll('button'))
      .find((b) => b.textContent?.trim().startsWith('Quitar'))
      ?.click();
    await fixture.whenStable();

    expect(api.quitarTransmision).toHaveBeenCalledWith(5, 3);
  });

  // `value()` de un resource lanza en estado de error aunque tenga `defaultValue`.
  it('si la API no responde, lo dice en vez de reventar', async () => {
    await montar(new Error('la API no respondió'), new Error('la API no respondió'));

    expect(texto()).toContain('No se pudieron cargar las transmisiones');
    expect(texto()).toContain('No se pudieron cargar las canchas');
    expect(texto()).not.toContain('Ninguna cancha está marcada con cámara');
  });
});
