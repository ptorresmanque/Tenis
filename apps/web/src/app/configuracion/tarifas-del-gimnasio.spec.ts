import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminCanchas, TarifaDelGimnasio } from '../catalogo-canchas/admin/admin-canchas.service';
import { Club } from '../club/club.service';
import { TarifasDelGimnasio } from './tarifas-del-gimnasio';

/**
 * T236. Las tarifas del gimnasio: filas de nombre, precio socio y precio no socio, que se
 * agregan, se quitan y se guardan todas juntas, en el orden de la pantalla.
 */
describe('TarifasDelGimnasio', () => {
  const club = { recargar: vi.fn() };
  beforeEach(() => club.recargar.mockClear());

  const GRUPAL: TarifaDelGimnasio = {
    nombre: 'Clase grupal',
    precioSocioClp: 5000,
    precioNoSocioClp: 8000,
  };
  const PASE: TarifaDelGimnasio = {
    nombre: 'Pase diario',
    precioSocioClp: 3000,
    precioNoSocioClp: 4500,
  };

  const montar = async (
    tarifas: () => Promise<TarifaDelGimnasio[]> = () => Promise.resolve([GRUPAL, PASE]),
    guardar: (lista: TarifaDelGimnasio[]) => Promise<unknown> = (lista) => Promise.resolve(lista),
  ) => {
    const api = {
      tarifasDelGimnasio: vi.fn(tarifas),
      guardarTarifasDelGimnasio: vi.fn(guardar),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AdminCanchas, useValue: api },
        { provide: Club, useValue: club },
      ],
    });
    const fixture = TestBed.createComponent(TarifasDelGimnasio);
    await fixture.whenStable();
    fixture.detectChanges();

    const elemento = fixture.nativeElement as HTMLElement;
    const listo = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };

    /** El campo de una fila, por la leyenda de la fila y su etiqueta. */
    const campo = (fila: number, etiqueta: string) => {
      const grupo = Array.from(elemento.querySelectorAll('fieldset')).find(
        (f) => f.querySelector('legend')?.textContent?.trim() === `Tarifa ${fila}`,
      );

      return Array.from(grupo?.querySelectorAll('label') ?? [])
        .find((l) => l.textContent?.trim().startsWith(etiqueta))
        ?.querySelector('input');
    };

    const escribir = async (fila: number, etiqueta: string, valor: string) => {
      const control = campo(fila, etiqueta)!;
      control.value = valor;
      control.dispatchEvent(new Event('input'));
      await listo();
    };

    const boton = (texto: string) =>
      Array.from(elemento.querySelectorAll('button')).find((b) =>
        b.textContent?.trim().startsWith(texto),
      )!;

    const apretar = async (texto: string) => {
      boton(texto).click();
      await listo();
    };

    return { api, elemento, campo, escribir, boton, apretar };
  };

  it('**muestra las guardadas, en su orden**', async () => {
    const { campo } = await montar();

    expect(campo(1, 'Nombre')?.value).toBe('Clase grupal');
    expect(campo(1, 'Socio')?.value).toBe('5000');
    expect(campo(1, 'No socio')?.value).toBe('8000');
    expect(campo(2, 'Nombre')?.value).toBe('Pase diario');
  });

  it('**agregar, escribir y guardar manda la lista completa, en el orden de la pantalla**', async () => {
    const { api, elemento, escribir, apretar } = await montar();

    await apretar('Agregar una tarifa');
    await escribir(3, 'Nombre', 'Mensual');
    await escribir(3, 'Socio', '20000');
    await escribir(3, 'No socio', '30000');
    await apretar('Guardar las tarifas');

    expect(api.guardarTarifasDelGimnasio).toHaveBeenCalledWith([
      GRUPAL,
      PASE,
      { nombre: 'Mensual', precioSocioClp: 20000, precioNoSocioClp: 30000 },
    ]);
    expect(club.recargar).toHaveBeenCalledTimes(1);
    expect(elemento.textContent).toContain('Guardadas');
  });

  it('quitar una fila la saca de la lista que se guarda', async () => {
    const { api, apretar } = await montar();

    await apretar('Quitar');
    await apretar('Guardar las tarifas');

    expect(api.guardarTarifasDelGimnasio).toHaveBeenCalledWith([PASE]);
  });

  it('con diez no deja agregar otra, y lo dice', async () => {
    const diez = Array.from({ length: 10 }, (_, n) => ({ ...GRUPAL, nombre: `Plan ${n + 1}` }));
    const { boton, elemento } = await montar(() => Promise.resolve(diez));

    expect(boton('Agregar una tarifa').disabled).toBe(true);
    expect(elemento.textContent).toContain('Ya tiene diez');
  });

  it('**un monto en blanco viaja vacío, y el servidor dice cuál falta**', async () => {
    const { api, elemento, escribir, apretar } = await montar(undefined, () =>
      Promise.reject({
        error: {
          message: 'El precio socio de "Clase grupal" tiene que ser un número entero desde 0.',
        },
      }),
    );

    await escribir(1, 'Socio', '');
    await apretar('Guardar las tarifas');

    expect(api.guardarTarifasDelGimnasio).toHaveBeenCalledWith([
      { ...GRUPAL, precioSocioClp: null },
      PASE,
    ]);
    expect(elemento.textContent).toContain('El precio socio de "Clase grupal"');
    expect(club.recargar).not.toHaveBeenCalled();
  });

  it('**si no cargan, lo dice y no deja guardar**: guardar una lista vacía borraría las del club', async () => {
    const { boton, elemento } = await montar(() => Promise.reject(new Error('sin API')));

    expect(elemento.textContent).toContain('No se pudieron cargar las tarifas');
    expect(boton('Guardar las tarifas').disabled).toBe(true);
  });
});
