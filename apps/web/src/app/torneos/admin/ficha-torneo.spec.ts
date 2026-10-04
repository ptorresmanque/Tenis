import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminCanchas } from '../../catalogo-canchas/admin/admin-canchas.service';
import { Torneo, Torneos } from '../torneos.service';
import { FichaDeTorneo } from './ficha-torneo';

/**
 * La ficha de un torneo del panel.
 *
 * Lo que este archivo cuida es lo que motivó el rediseño: que **cada tarea tenga su
 * lugar** en vez de vivir anidada cuatro niveles dentro de un acordeón, y que el
 * cuadro que se está mirando se elija una vez y no se arrastre de un torneo a otro.
 */
describe('FichaDeTorneo', () => {
  const TORNEO: Torneo = {
    id: 5,
    nombre: 'Torneo Aniversario',
    superficie: 'DURA',
    fechaInicio: '2026-12-05',
    fechaFin: '2026-12-07',
    cierreInscripcion: '2026-12-01',
    estado: 'INSCRIPCION',
    cuadros: [
      {
        id: 7,
        categoria: 'Honor',
        cupo: 8,
        categoriaId: 1,
        valor: 'Club 500',
        puntosCampeon: 500,
      },
      {
        id: 8,
        categoria: '4ª',
        cupo: 32,
        categoriaId: 2,
        valor: 'Club 250',
        puntosCampeon: 250,
      },
    ],
    pagosPorRevisar: 3,
    enEspera: 0,
  };

  let fixture: ComponentFixture<FichaDeTorneo>;

  const montar = async (torneos: Torneo[] | Error = [TORNEO], id = '5') => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        // Las transmisiones y la programación necesitan las canchas del club: son de
        // otro módulo, y sin doble el componente ni se construye.
        {
          provide: AdminCanchas,
          useValue: { canchas: vi.fn().mockResolvedValue([]) },
        },
        {
          provide: Torneos,
          useValue: {
            torneos: vi.fn(() =>
              torneos instanceof Error ? Promise.reject(torneos) : Promise.resolve(torneos),
            ),
            inscripciones: vi.fn().mockResolvedValue({
              torneoId: 5,
              torneoCategoriaId: 7,
              categoria: 'Honor',
              cupo: 8,
              montoClp: 15000,
              estado: 'INSCRIPCION',
              inscritos: [],
              enEspera: [],
              retirados: [],
            }),
            jugadores: vi.fn().mockResolvedValue([]),
            cuadro: vi.fn().mockResolvedValue({
              torneoId: 5,
              torneoCategoriaId: 7,
              categoria: 'Honor',
              estado: 'INSCRIPCION',
              armado: false,
              rondas: 0,
              semillaSorteo: null,
              partidos: [],
            }),
            canchas: vi.fn().mockResolvedValue([]),
            transmisiones: vi.fn().mockResolvedValue([]),
            fotos: vi.fn().mockResolvedValue([]),
            cuadrosDelTorneo: vi.fn().mockResolvedValue([]),
            categoriasDeJuego: vi.fn().mockResolvedValue([]),
            categorias: vi.fn().mockResolvedValue([]),
            editarTorneo: vi.fn().mockResolvedValue({}),
            cancelarTorneo: vi.fn().mockResolvedValue({ id: 5, estado: 'CANCELADO' }),
            reactivarTorneo: vi
              .fn()
              .mockResolvedValue({ id: 5, estado: 'INSCRIPCION' }),
          },
        },
      ],
    });

    fixture = TestBed.createComponent(FichaDeTorneo);
    fixture.componentRef.setInput('id', id);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const texto = () => elemento().textContent ?? '';

  /** Aprieta una pestaña por su nombre. El ícono va dentro del botón. */
  const pestana = async (nombre: string) => {
    Array.from(elemento().querySelectorAll<HTMLElement>('[role="tab"]'))
      .find((b) => b.textContent?.includes(nombre))
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const apretar = async (etiqueta: string) => {
    Array.from(elemento().querySelectorAll('button'))
      .find((b) => b.textContent?.trim().startsWith(etiqueta))
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await montar();
  });

  it('muestra el torneo con su estado y sus fechas', () => {
    expect(texto()).toContain('Torneo Aniversario');
    expect(texto()).toContain('Inscripción abierta');
    expect(texto()).toContain('diciembre');
  });

  it('**abre en inscritos**, que es donde está el trabajo del día', () => {
    expect(elemento().querySelector('app-inscritos-torneo')).not.toBeNull();
    expect(elemento().querySelector('app-cuadro-torneo')).toBeNull();
  });

  it('**la pestaña de inscritos avisa de los pagos por revisar**', () => {
    // Sin esto hay que entrar a la pestaña para descubrir que había trabajo.
    const pestana = Array.from(elemento().querySelectorAll('[role="tab"]')).find(
      (b) => b.textContent?.includes('Inscritos'),
    );

    expect(pestana?.textContent).toContain('3');
  });

  it('cambiar de pestaña cambia lo que se muestra', async () => {
    await pestana('Cuadro');

    expect(elemento().querySelector('app-cuadro-torneo')).not.toBeNull();
    expect(elemento().querySelector('app-inscritos-torneo')).toBeNull();
  });

  it('**el cuadro se elige una vez y vale para las dos pestañas**', async () => {
    await apretar('4ª');
    await pestana('Cuadro');

    const elegido = Array.from(elemento().querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-pressed') === 'true',
    );
    expect(elegido?.textContent?.trim()).toBe('4ª');
  });

  it('multimedia junta las transmisiones y las fotos', async () => {
    await pestana('Multimedia');

    expect(elemento().querySelector('app-transmisiones-del-torneo')).not.toBeNull();
    expect(elemento().querySelector('app-fotos-del-torneo')).not.toBeNull();
  });

  it('un torneo sin categorías lo dice y manda a ajustes', async () => {
    await montar([{ ...TORNEO, cuadros: [] }]);

    expect(texto()).toContain('no corre ninguna categoría');
  });

  it('**un id que no existe no deja la pantalla en blanco**', async () => {
    await montar([TORNEO], '999');

    expect(texto()).toContain('No encontramos ese torneo');
  });

  /**
   * Cancelar el torneo.
   *
   * Faltaba entero: `CANCELADO` era un estado que medio módulo respetaba y que nadie
   * podía poner. Lo encontró el club buscando el botón.
   */
  describe('cancelar el torneo', () => {
    const ajustes = () => pestana('Ajustes');

    it('**la opción vive en ajustes**, no en medio de la operación diaria', async () => {
      await ajustes();

      expect(texto()).toContain('Cancelar el torneo');
    });

    it('**dice lo que no hace: no devuelve la plata**', async () => {
      // Esconderlo sería dejar que alguien cancele creyendo que el sistema le devuelve
      // el dinero a los inscritos. Los reembolsos están fuera de alcance.
      await ajustes();

      expect(texto()).toContain('no devuelve el dinero');
    });

    it('**un clic no alcanza**: pregunta antes de esconder el torneo', async () => {
      await ajustes();

      await apretar('Cancelar el torneo');

      expect(TestBed.inject(Torneos).cancelarTorneo).not.toHaveBeenCalled();
      expect(texto()).toContain('¿Seguro?');
    });

    it('confirmado, cancela', async () => {
      await ajustes();
      await apretar('Cancelar el torneo');

      await apretar('Sí, cancelar');

      expect(TestBed.inject(Torneos).cancelarTorneo).toHaveBeenCalledWith(5);
    });

    it('un torneo cancelado ofrece volver, no cancelar otra vez', async () => {
      await montar([{ ...TORNEO, estado: 'CANCELADO' }]);
      await ajustes();

      expect(texto()).toContain('Reactivar el torneo');
      expect(texto()).not.toContain('¿Seguro?');
    });

    it('**uno que ya se jugó no ofrece el botón**, y explica por qué', async () => {
      await montar([{ ...TORNEO, estado: 'FINALIZADO' }]);
      await ajustes();

      expect(texto()).toContain('ya se jugó');
      expect(
        Array.from(elemento().querySelectorAll('button')).some((b) =>
          b.textContent?.includes('Cancelar el torneo'),
        ),
      ).toBe(false);
    });
  });

  describe('editar los datos del torneo', () => {
    const escribir = async (name: string, valor: string) => {
      const campo = elemento().querySelector<HTMLInputElement>(
        `[name="${name}"]`,
      )!;
      campo.value = valor;
      campo.dispatchEvent(new Event('input'));
      campo.dispatchEvent(new Event('change'));
      await fixture.whenStable();
      fixture.detectChanges();
    };

    beforeEach(async () => {
      await pestana('Ajustes');
    });

    it('**el formulario llega con lo que el torneo ya tiene**', async () => {
      // Un formulario vacío obliga a reescribir las cinco cosas para corregir una.
      const nombre = elemento().querySelector<HTMLInputElement>(
        '[name="nombre"]',
      )!;

      expect(nombre.value).toBe('Torneo Aniversario');
    });

    it('**guarda mandando las tres fechas juntas**', async () => {
      // El servidor las exige así: comprobar una contra las guardadas deja llegar a un
      // torneo que termina antes de empezar, en dos pasos que por separado se ven bien.
      await escribir('nombre', 'Torneo Aniversario 2027');

      await apretar('Guardar');

      expect(TestBed.inject(Torneos).editarTorneo).toHaveBeenCalledWith(5, {
        nombre: 'Torneo Aniversario 2027',
        superficie: 'DURA',
        fechaInicio: '2026-12-05',
        fechaFin: '2026-12-07',
        cierreInscripcion: '2026-12-01',
      });
    });

    it('el error del servidor se muestra tal cual', async () => {
      // La comparación entre las tres fechas vive en el servidor, que es la misma
      // regla para el panel y para cualquier otra cosa que edite torneos.
      (
        TestBed.inject(Torneos).editarTorneo as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce({
        error: { message: 'El torneo no puede terminar antes de empezar.' },
      });

      await apretar('Guardar');

      expect(texto()).toContain('no puede terminar antes de empezar');
    });
  });

  // `value()` de un resource lanza en estado de error aunque tenga `defaultValue`.
  it('si la lista no carga, lo dice en vez de dar el torneo por borrado', async () => {
    await montar(new Error('la API no respondió'));

    expect(texto()).toContain('No se pudo cargar el torneo');
    expect(texto()).not.toContain('No encontramos ese torneo');
  });
});
