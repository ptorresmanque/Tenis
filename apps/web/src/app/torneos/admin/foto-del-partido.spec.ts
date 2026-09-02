import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Foto, Torneos } from '../torneos.service';
import { FotoDelPartido } from './foto-del-partido';

/**
 * T69. La foto de un partido: los dos jugadores antes de salir a la cancha.
 *
 * Lo que este archivo cuida: que **se suba desde el partido y llegue con su número**.
 * Es la foto que el club más va a subir, y elegir el partido en una lista de dieciséis
 * después de sacarla es exactamente el paso que nadie da.
 */
describe('FotoDelPartido', () => {
  const FOTO: Foto = {
    id: 7,
    partidoId: 12,
    momento: 'ANTES',
    descripcion: null,
    miniatura: '/api/torneos/fotos/7/miniatura',
    imagen: '/api/torneos/fotos/7/imagen',
  };

  let fixture: ComponentFixture<FotoDelPartido>;
  let api: { subirFoto: ReturnType<typeof vi.fn> };

  const montar = async (fotos: Foto[] = []) => {
    api = { subirFoto: vi.fn().mockResolvedValue(FOTO) };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: Torneos, useValue: api }],
    });

    fixture = TestBed.createComponent(FotoDelPartido);
    fixture.componentRef.setInput('torneoId', 5);
    fixture.componentRef.setInput('partidoId', 12);
    fixture.componentRef.setInput('fotos', fotos);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;

  const elegir = async (archivo = new File(['x'], 'previa.jpg')) => {
    const entrada = elemento().querySelector<HTMLInputElement>(
      'input[type="file"]',
    )!;
    Object.defineProperty(entrada, 'files', {
      value: [archivo],
      configurable: true,
    });
    entrada.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    return archivo;
  };

  beforeEach(async () => {
    await montar();
  });

  it('**la foto llega con el número de su partido**', async () => {
    const archivo = await elegir();

    expect(api.subirFoto).toHaveBeenCalledWith(5, archivo, {
      momento: 'ANTES',
      partidoId: 12,
    });
  });

  it('**es la previa: el momento por omisión es ANTES**', async () => {
    await elegir();

    expect(api.subirFoto.mock.calls[0][2].momento).toBe('ANTES');
  });

  it('las que ya tiene el partido se ven en miniatura', async () => {
    await montar([FOTO]);

    expect(elemento().querySelector('img')?.getAttribute('src')).toBe(
      '/api/torneos/fotos/7/miniatura',
    );
  });

  it('**avisa al cuadro que recargue**: las fotos las tiene él', async () => {
    const avisos: void[] = [];
    fixture.componentInstance.subida.subscribe(() => avisos.push(undefined));

    await elegir();

    expect(avisos).toHaveLength(1);
  });

  it('**el campo se limpia**: la misma foto se puede reintentar', async () => {
    await elegir();

    const entrada = elemento().querySelector<HTMLInputElement>(
      'input[type="file"]',
    )!;
    expect(entrada.value).toBe('');
  });

  it('la razón del servidor se lee tal cual', async () => {
    api.subirFoto.mockRejectedValue({
      error: { message: 'Ese archivo no es una imagen que podamos leer.' },
    });

    await elegir();

    expect(elemento().textContent).toContain('no es una imagen');
  });

  it('cancelar el explorador no manda nada', async () => {
    const entrada = elemento().querySelector<HTMLInputElement>(
      'input[type="file"]',
    )!;
    Object.defineProperty(entrada, 'files', { value: [], configurable: true });
    entrada.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(api.subirFoto).not.toHaveBeenCalled();
  });
});
