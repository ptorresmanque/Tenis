import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Foto, Torneos } from '../torneos.service';
import { FotosDelTorneo } from './fotos';

/**
 * T69. Subir fotos al torneo desde el panel.
 *
 * Lo que este archivo cuida: que la pantalla **diga que las fotos se ven sin cuenta**.
 * Es la diferencia con el comprobante de pago, y quien sube una foto tiene derecho a
 * saber dónde va a quedar antes de subirla.
 */
describe('FotosDelTorneo', () => {
  const FOTO: Foto = {
    id: 3,
    partidoId: null,
    momento: 'DURANTE',
    descripcion: 'La entrega de premios',
    miniatura: '/api/torneos/fotos/3/miniatura',
    imagen: '/api/torneos/fotos/3/imagen',
  };

  let fixture: ComponentFixture<FotosDelTorneo>;
  let api: {
    fotos: ReturnType<typeof vi.fn>;
    subirFoto: ReturnType<typeof vi.fn>;
    quitarFoto: ReturnType<typeof vi.fn>;
  };

  const montar = async (fotos: Foto[] | Error) => {
    api = {
      fotos: vi.fn(() =>
        fotos instanceof Error ? Promise.reject(fotos) : Promise.resolve(fotos),
      ),
      subirFoto: vi.fn().mockResolvedValue(FOTO),
      quitarFoto: vi.fn().mockResolvedValue({ id: 3 }),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: Torneos, useValue: api }],
    });

    fixture = TestBed.createComponent(FotosDelTorneo);
    fixture.componentRef.setInput('torneoId', 5);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const texto = () => elemento().textContent ?? '';

  /** Elegir un archivo, como lo haría el explorador del sistema. */
  const elegir = async (archivo = new File(['x'], 'cancha.jpg')) => {
    const entrada = elemento().querySelector<HTMLInputElement>(
      'input[type="file"]',
    )!;
    Object.defineProperty(entrada, 'files', { value: [archivo] });
    entrada.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    return archivo;
  };

  const mandar = async () => {
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
    expect(elemento().querySelector('section > h2')?.textContent).toContain('Fotos');
  });

  it('**dice que las fotos se ven sin cuenta**, al revés que el comprobante', () => {
    expect(texto()).toContain('sin necesidad de tener cuenta');
  });

  it('**avisa que se les quitan los datos de dónde se sacaron**', () => {
    expect(texto()).toContain('el lugar donde se sacaron');
  });

  it('subir manda el archivo con su momento', async () => {
    const archivo = await elegir();
    await mandar();

    expect(api.subirFoto).toHaveBeenCalledWith(5, archivo, {
      momento: 'DURANTE',
      descripcion: undefined,
    });
  });

  it('**sin archivo no se manda nada**', async () => {
    await mandar();

    expect(api.subirFoto).not.toHaveBeenCalled();
  });

  it('el pie de foto viaja cuando se escribe', async () => {
    const campo = elemento().querySelector<HTMLInputElement>(
      '[name="descripcion"]',
    )!;
    campo.value = 'La final';
    campo.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    const archivo = await elegir();
    await mandar();

    expect(api.subirFoto).toHaveBeenCalledWith(5, archivo, {
      momento: 'DURANTE',
      descripcion: 'La final',
    });
  });

  it('**la razón del servidor se lee tal cual**: dice qué archivo no sirve', async () => {
    api.subirFoto.mockRejectedValue({
      error: { message: 'Ese archivo no es una imagen que podamos leer.' },
    });

    await elegir();
    await mandar();

    expect(texto()).toContain('no es una imagen');
  });

  it('las que ya están se muestran en miniatura', async () => {
    await montar([FOTO]);

    expect(
      elemento().querySelector('img')?.getAttribute('src'),
    ).toBe('/api/torneos/fotos/3/miniatura');
  });

  it('quitar una la manda al servidor', async () => {
    await montar([FOTO]);

    Array.from(elemento().querySelectorAll('button'))
      .find((b) => b.textContent?.trim().startsWith('Quitar'))
      ?.click();
    await fixture.whenStable();

    expect(api.quitarFoto).toHaveBeenCalledWith(5, 3);
  });

  // `value()` de un resource lanza en estado de error aunque tenga `defaultValue`.
  it('si las fotos no cargan, lo dice', async () => {
    await montar(new Error('la API no respondió'));

    expect(texto()).toContain('No se pudieron cargar las fotos');
  });
});
