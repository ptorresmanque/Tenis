import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Socios } from '../../identidad/admin/socios.service';
import { Clases, FichaDeClase } from '../clases.service';
import { InscritosDeLaClase } from './inscritos';

/**
 * T47. Quién viene a la clase.
 *
 * Lo que este archivo cuida: que **la pantalla no se crea la dueña del cupo**. Muestra
 * cuántos lugares quedan, pero quien decide es el servidor —entre esta pantalla y el
 * clic alguien pudo bajarse o entrar por teléfono—, y cuando dice que no, ese "no" se
 * muestra con sus palabras en vez de un botón apagado sin explicación.
 */
describe('InscritosDeLaClase', () => {
  const FICHA: FichaDeClase = {
    id: 7,
    cancha: 'Cancha 1',
    profesor: 'Ana Silva',
    inicio: '2026-08-17T21:00:00.000Z',
    fin: '2026-08-17T22:00:00.000Z',
    nivel: 'INICIACION',
    estado: 'PROGRAMADA',
    cupoMaximo: 2,
    cupoTomado: 1,
    notas: null,
    serieId: null,
    inscritos: [
      {
        id: 11,
        socioId: 1,
        nombre: 'Camila Socia',
        telefono: '+56911112222',
        esSocio: true,
        numeroSocio: '001',
        estado: 'INSCRITA',
        inscritaEn: '2026-08-10T12:00:00.000Z',
      },
    ],
  };

  let fixture: ComponentFixture<InscritosDeLaClase>;
  let api: {
    ficha: ReturnType<typeof vi.fn>;
    inscribir: ReturnType<typeof vi.fn>;
    bajar: ReturnType<typeof vi.fn>;
    realizar: ReturnType<typeof vi.fn>;
    inscribirEnLaSerie: ReturnType<typeof vi.fn>;
    salirDeLaSerie: ReturnType<typeof vi.fn>;
  };

  const montar = async (ficha: FichaDeClase | Error) => {
    api = {
      ficha: vi.fn(() =>
        ficha instanceof Error ? Promise.reject(ficha) : Promise.resolve(ficha),
      ),
      inscribir: vi.fn().mockResolvedValue({ id: 12 }),
      bajar: vi.fn().mockResolvedValue({ id: 11 }),
      realizar: vi.fn().mockResolvedValue({ id: 7 }),
      inscribirEnLaSerie: vi.fn().mockResolvedValue({ inscritas: 17, yaEstaba: 1 }),
      salirDeLaSerie: vi.fn().mockResolvedValue({ canceladas: 5 }),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Clases, useValue: api },
        {
          provide: Socios,
          useValue: {
            listado: vi.fn().mockResolvedValue({
              socios: [
                {
                  id: 3,
                  numeroSocio: '002',
                  usuario: { nombre: 'Matías', apellido: 'Rojas' },
                },
              ],
            }),
          },
        },
      ],
    });

    fixture = TestBed.createComponent(InscritosDeLaClase);
    fixture.componentRef.setInput('claseId', 7);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const texto = () => elemento().textContent ?? '';

  const apretar = async (etiqueta: string) => {
    Array.from(elemento().querySelectorAll('button'))
      .find((b) => b.textContent?.trim().startsWith(etiqueta))
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await montar(FICHA);
  });

  it('muestra quién viene, con su teléfono para llamarlo', () => {
    expect(texto()).toContain('Camila Socia');
    expect(texto()).toContain('+56911112222');
    expect(texto()).toContain('Socio 001');
  });

  it('dice cuántos lugares hay tomados, sin hacer contar a nadie', () => {
    expect(texto()).toContain('1 de 2');
  });

  it('inscribe a un socio del club', async () => {
    const select = elemento().querySelector(
      'select[name="socioId"]',
    ) as HTMLSelectElement;
    select.value = '3';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    await apretar('Inscribir');

    expect(api.inscribir).toHaveBeenCalledWith(7, { socioId: 3 });
  });

  it('**con la clase llena el botón sigue disponible: quien decide es el servidor**', async () => {
    // Entre que se dibuja esta pantalla y alguien aprieta, otro pudo bajarse. Un
    // botón apagado obligaría a recargar para descubrirlo.
    await montar({ ...FICHA, cupoTomado: 2 });

    const boton = Array.from(elemento().querySelectorAll('button')).find((b) =>
      b.textContent?.trim().startsWith('Inscribir'),
    ) as HTMLButtonElement;

    expect(boton.disabled).toBe(false);
    expect(texto()).toContain('La clase está llena');
  });

  it('si el servidor dice que no hay cupo, lo dice con sus palabras', async () => {
    api.inscribir.mockRejectedValue({
      error: { message: 'Esa clase ya tiene su cupo completo (2).' },
    });

    await apretar('Inscribir');

    expect(texto()).toContain('cupo completo');
  });

  it('sacar a alguien de la clase lo pide al servidor', async () => {
    await apretar('Sacar de la clase');

    expect(api.bajar).toHaveBeenCalledWith(7, 11);
  });

  it('a quien se bajó no se le ofrece sacarlo de nuevo', async () => {
    await montar({
      ...FICHA,
      cupoTomado: 0,
      inscritos: [{ ...FICHA.inscritos[0], estado: 'CANCELADA' }],
    });

    expect(texto()).toContain('Se bajó');
    expect(
      Array.from(elemento().querySelectorAll('button')).some((b) =>
        b.textContent?.includes('Sacar de la clase'),
      ),
    ).toBe(false);
  });

  it('**a quien ya está en la clase no se le vuelve a ofrecer**', async () => {
    // Elegirlo responde 409 con un mensaje claro, pero sigue siendo un callejón que
    // la lista ofrece y el servidor rechaza siempre.
    await montar({
      ...FICHA,
      inscritos: [{ ...FICHA.inscritos[0], numeroSocio: '002' }],
    });

    const opciones = Array.from(
      elemento().querySelectorAll('select[name="socioId"] option'),
    ).map((o) => o.textContent?.trim());

    expect(opciones.some((o) => o?.startsWith('002'))).toBe(false);
  });

  it('el que se bajó vuelve a la lista: puede reinscribirse', async () => {
    await montar({
      ...FICHA,
      cupoTomado: 0,
      inscritos: [
        { ...FICHA.inscritos[0], numeroSocio: '002', estado: 'CANCELADA' },
      ],
    });

    const opciones = Array.from(
      elemento().querySelectorAll('select[name="socioId"] option'),
    ).map((o) => o.textContent?.trim());

    expect(opciones.some((o) => o?.startsWith('002'))).toBe(true);
  });

  it('pasar lista manda a los que vinieron', async () => {
    const casilla = elemento().querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    casilla.checked = true;
    casilla.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    await apretar('Cerrar la clase con esta lista');

    expect(api.realizar).toHaveBeenCalledWith(7, [11]);
  });

  it('**cerrar sin pasar lista no es lo mismo que decir que no vino nadie**', async () => {
    // Con un solo botón, la lista vacía significaría las dos cosas y el club no
    // tendría cómo decir "no alcancé a pasar lista".
    await apretar('Cerrar sin pasar lista');

    expect(api.realizar).toHaveBeenCalledWith(7, null);
  });

  it('cerrar con nadie marcado dice que no vino nadie', async () => {
    await apretar('Cerrar la clase con esta lista');

    expect(api.realizar).toHaveBeenCalledWith(7, []);
  });

  it('a la clase ya cerrada no se le vuelve a pasar lista', async () => {
    await montar({
      ...FICHA,
      estado: 'REALIZADA',
      inscritos: [{ ...FICHA.inscritos[0], estado: 'ASISTIO' }],
    });

    expect(texto()).toContain('Vino');
    expect(
      Array.from(elemento().querySelectorAll('button')).some((b) =>
        b.textContent?.includes('Cerrar la clase'),
      ),
    ).toBe(false);
    // Ni se inscribe a nadie más: la clase ya pasó.
    expect(elemento().querySelector('select[name="socioId"]')).toBeNull();
  });

  it('sin nadie inscrito lo dice, en vez de una lista vacía', async () => {
    await montar({ ...FICHA, cupoTomado: 0, inscritos: [] });

    expect(texto()).toContain('Todavía no hay nadie inscrito');
  });

  // `value()` de un resource lanza en estado de error aunque tenga `defaultValue`.
  it('si la clase no carga, lo dice', async () => {
    await montar(new Error('la API no respondió'));

    expect(texto()).toContain('No se pudieron cargar los inscritos');
  });

  it('si la lista de socios no carga, la clase se ve igual', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Clases, useValue: { ficha: () => Promise.resolve(FICHA) } },
        {
          provide: Socios,
          useValue: { listado: () => Promise.reject(new Error('la API no respondió')) },
        },
      ],
    });

    fixture = TestBed.createComponent(InscritosDeLaClase);
    fixture.componentRef.setInput('claseId', 7);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(texto()).toContain('Camila Socia');
  });

  /** T116. En una clase de una serie, se inscribe y se sale de la serie completa. */
  describe('la serie', () => {
    const DE_UNA_SERIE: FichaDeClase = { ...FICHA, serieId: 9 };

    it('en una clase suelta no ofrece la serie', () => {
      expect(texto()).not.toContain('toda la serie');
      expect(texto()).not.toContain('Sacar de la serie');
    });

    it('**inscribe al socio elegido en toda la serie y dice en cuántas clases**', async () => {
      await montar(DE_UNA_SERIE);
      const select = elemento().querySelector('select[name="socioId"]') as HTMLSelectElement;
      select.value = '3';
      select.dispatchEvent(new Event('change'));
      await fixture.whenStable();

      await apretar('Inscribir en toda la serie');

      expect(api.inscribirEnLaSerie).toHaveBeenCalledWith(9, { socioId: 3 });
      expect(api.inscribir).not.toHaveBeenCalled();
      expect(texto()).toContain('Inscrito en 17 clases de la serie; en 1 ya estaba.');
    });

    it('**sacar de la serie cancela las clases que vienen**', async () => {
      await montar(DE_UNA_SERIE);

      await apretar('Sacar de la serie');

      expect(api.salirDeLaSerie).toHaveBeenCalledWith(9, { socioId: 1 });
      expect(texto()).toContain('Salió de la serie: se cancelaron 5 clases que venían.');
    });

    it('al alumno de afuera se lo reconoce por su nombre y su teléfono', async () => {
      await montar({
        ...DE_UNA_SERIE,
        inscritos: [
          {
            ...FICHA.inscritos[0],
            socioId: null,
            esSocio: false,
            numeroSocio: null,
            nombre: 'Pedro Afuera',
            telefono: '+56933334444',
          },
        ],
      });

      await apretar('Sacar de la serie');

      expect(api.salirDeLaSerie).toHaveBeenCalledWith(9, {
        nombre: 'Pedro Afuera',
        telefono: '+56933334444',
      });
    });

    it('si una clase de la serie está llena, lo dice con las palabras del servidor', async () => {
      await montar(DE_UNA_SERIE);
      api.inscribirEnLaSerie.mockRejectedValue({
        status: 409,
        error: {
          message:
            'No hay cupo en la clase del jueves 22 de octubre: no se inscribió en ninguna clase de la serie.',
        },
      });
      const select = elemento().querySelector('select[name="socioId"]') as HTMLSelectElement;
      select.value = '3';
      select.dispatchEvent(new Event('change'));
      await fixture.whenStable();

      await apretar('Inscribir en toda la serie');

      expect(texto()).toContain('jueves 22 de octubre');
    });
  });
});

