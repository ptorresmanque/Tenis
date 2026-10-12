import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { CatalogoDeLaTienda, FilaDeTallas, Marca } from './catalogo.service';
import { MarcasPanel } from './marcas';

/**
 * T157. Las marcas en el panel y la tabla de tallas de cada una.
 *
 * La tabla se edita como una planilla corta y **se guarda entera**: el servidor la
 * reemplaza (T156). Lo que importa acá es que lo que se manda sea la tabla que el admin
 * ve, sin filas a medio llenar ni una talla chilena dos veces.
 */
describe('MarcasPanel', () => {
  const BABOLAT: Marca = { id: 7, nombre: 'Babolat' };
  const WILSON: Marca = { id: 8, nombre: 'Wilson' };
  const TABLA: FilaDeTallas[] = [
    { tallaCl: '40', tallaUs: '8', tallaEu: '41' },
    { tallaCl: '41', tallaUs: '9', tallaEu: '42' },
  ];

  const montar = async (
    lista: Marca[] = [BABOLAT, WILSON],
    tallasGuardadas: FilaDeTallas[] = TABLA,
  ) => {
    const api = {
      listarMarcas: vi.fn().mockResolvedValue(lista),
      crearMarca: vi.fn().mockResolvedValue(BABOLAT),
      editarMarca: vi.fn().mockResolvedValue(BABOLAT),
      tallas: vi.fn().mockResolvedValue(tallasGuardadas),
      guardarTallas: vi.fn().mockImplementation((_id: number, filas: FilaDeTallas[]) =>
        Promise.resolve(filas),
      ),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: CatalogoDeLaTienda, useValue: api }],
    });
    const fixture = TestBed.createComponent(MarcasPanel);
    await fixture.whenStable();
    fixture.detectChanges();
    const elemento = fixture.nativeElement as HTMLElement;

    const estable = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };

    const boton = (texto: string, dentro: ParentNode = elemento) =>
      Array.from(dentro.querySelectorAll('button')).find((b) =>
        b.textContent?.replace(/\s+/g, ' ').includes(texto),
      )!;

    const campo = (etiqueta: string, dentro: ParentNode = elemento) =>
      Array.from(dentro.querySelectorAll('label'))
        .find((l) => l.textContent?.includes(etiqueta))
        ?.querySelector<HTMLInputElement>('input');

    const escribir = async (control: HTMLInputElement, valor: string) => {
      control.value = valor;
      control.dispatchEvent(new Event('input'));
      await estable();
    };

    const filas = () => Array.from(elemento.querySelectorAll<HTMLElement>('ol > li'));

    /** Las celdas de la tabla de tallas abierta, fila por fila. */
    const tabla = () =>
      Array.from(elemento.querySelectorAll<HTMLTableRowElement>('tbody tr')).map((fila) =>
        Array.from(fila.querySelectorAll<HTMLInputElement>('input')),
      );

    const abrirTabla = async (fila: HTMLElement) => {
      boton('Tabla de tallas', fila).click();
      await estable();
    };

    return { api, elemento, estable, boton, campo, escribir, filas, tabla, abrirTabla };
  };

  it('lista las marcas', async () => {
    const { filas } = await montar();

    expect(filas().map((f) => f.querySelector('h3')?.textContent?.trim())).toEqual([
      'Babolat',
      'Wilson',
    ]);
  });

  it('sin marcas, dice que todavía no hay', async () => {
    const { elemento } = await montar([]);

    expect(elemento.textContent).toContain('Todavía no hay marcas');
  });

  describe('agregar y corregir', () => {
    it('agregar manda el nombre sin espacios y vacía el formulario', async () => {
      const { api, boton, campo, escribir, estable } = await montar();

      await escribir(campo('Nombre')!, '  Head  ');
      boton('Agregar la marca').click();
      await estable();

      expect(api.crearMarca).toHaveBeenCalledWith('Head');
      expect(campo('Nombre')!.value).toBe('');
    });

    it('si la marca ya existe, muestra lo que dice el servidor', async () => {
      const { api, boton, campo, escribir, estable, elemento } = await montar();
      api.crearMarca.mockRejectedValue({
        status: 409,
        error: { message: 'Ya hay una marca con ese nombre.' },
      });

      await escribir(campo('Nombre')!, 'babolat');
      boton('Agregar la marca').click();
      await estable();

      expect(elemento.textContent).toContain('Ya hay una marca con ese nombre.');
    });

    it('Editar corrige el nombre en la fila', async () => {
      const { api, boton, campo, escribir, estable, filas } = await montar();

      boton('Editar', filas()[1]).click();
      await estable();
      await escribir(campo('Nombre', filas()[1])!, 'Wilson Sporting');
      boton('Guardar', filas()[1]).click();
      await estable();

      expect(api.editarMarca).toHaveBeenCalledWith(8, 'Wilson Sporting');
    });
  });

  describe('la tabla de tallas', () => {
    it('se abre en la fila de la marca, con las tallas guardadas', async () => {
      const { api, filas, tabla, abrirTabla } = await montar();

      await abrirTabla(filas()[0]);

      expect(api.tallas).toHaveBeenCalledWith(7);
      expect(tabla().map((celdas) => celdas.map((c) => c.value))).toEqual([
        ['40', '8', '41'],
        ['41', '9', '42'],
      ]);
    });

    it('cada celda tiene una etiqueta que dice qué talla y de qué fila es', async () => {
      const { filas, tabla, abrirTabla } = await montar();

      await abrirTabla(filas()[0]);

      const etiquetas = tabla()[1].map((c) => c.getAttribute('aria-label'));
      expect(etiquetas).toEqual(['Talla CL, fila 2', 'Talla US, fila 2', 'Talla EU, fila 2']);
      expect(tabla()[0][0].maxLength).toBe(10);
    });

    it('**se guarda entera**: con la fila agregada y sin espacios', async () => {
      const { api, boton, estable, filas, tabla, abrirTabla, escribir } = await montar();

      await abrirTabla(filas()[0]);
      boton('Agregar una talla', filas()[0]).click();
      await estable();
      const [cl, us, eu] = tabla()[2];
      await escribir(cl, ' 42 ');
      await escribir(us, '10');
      await escribir(eu, '43');
      boton('Guardar la tabla', filas()[0]).click();
      await estable();

      expect(api.guardarTallas).toHaveBeenCalledWith(7, [
        ...TABLA,
        { tallaCl: '42', tallaUs: '10', tallaEu: '43' },
      ]);
      expect(filas()[0].textContent).toContain('Tabla de Babolat guardada: 3 tallas.');
    });

    it('quitar una fila la saca de lo que se guarda', async () => {
      const { api, boton, estable, filas, abrirTabla } = await montar();

      await abrirTabla(filas()[0]);
      boton('Quitar la talla 40', filas()[0]).click();
      await estable();
      boton('Guardar la tabla', filas()[0]).click();
      await estable();

      expect(api.guardarTallas).toHaveBeenCalledWith(7, [TABLA[1]]);
    });

    it('**una talla CL repetida no se manda**, y el mensaje dice cuál', async () => {
      const { api, boton, estable, filas, tabla, abrirTabla, escribir } = await montar();

      await abrirTabla(filas()[0]);
      await escribir(tabla()[1][0], '40');
      boton('Guardar la tabla', filas()[0]).click();
      await estable();

      expect(api.guardarTallas).not.toHaveBeenCalled();
      expect(filas()[0].textContent).toContain('La talla CL 40 está dos veces');
    });

    it('una fila a medio llenar no se manda', async () => {
      const { api, boton, estable, filas, tabla, abrirTabla, escribir } = await montar();

      await abrirTabla(filas()[0]);
      await escribir(tabla()[0][1], '  ');
      boton('Guardar la tabla', filas()[0]).click();
      await estable();

      expect(api.guardarTallas).not.toHaveBeenCalled();
      expect(filas()[0].textContent).toContain('Completa las tres tallas de la fila 1');
    });

    it('una marca sin tabla lo dice, y deja empezarla', async () => {
      const { boton, filas, tabla, abrirTabla, estable } = await montar([BABOLAT], []);

      await abrirTabla(filas()[0]);
      expect(filas()[0].textContent).toContain('Babolat todavía no tiene tabla de tallas');

      boton('Agregar una talla', filas()[0]).click();
      await estable();
      expect(tabla()).toHaveLength(1);
    });
  });
});
