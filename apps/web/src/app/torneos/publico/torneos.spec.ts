import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';

import {
  CuadroPublico,
  PartidoPublico,
  Torneos,
  TorneoPublico,
} from '../torneos.service';
import { Club } from '../../club/club.service';
import { avisoDeLoHecho } from '../../testing/snackbar';
import { TorneosPublicos } from './torneos';

/**
 * T53. Los torneos que se ven desde la calle.
 *
 * Lo que este archivo cuida: que **el cuadro se pueda mirar en un teléfono**. Va en
 * columnas que se desplazan de lado y no en una tabla que se encoge; en 375px una tabla
 * de cuatro rondas queda ilegible, y este cuadro se mira sobre todo desde el club.
 */
describe('TorneosPublicos', () => {
  const EN_INSCRIPCION: TorneoPublico = {
    id: 5,
    nombre: 'Copa de verano',
    superficie: 'ARCILLA',
    // Lejos en el futuro: `aceptaInscripciones` compara el cierre con hoy, y con una fecha
    // cercana estas pruebas fallarían solas al pasar el cierre.
    fechaInicio: '2126-12-01',
    fechaFin: '2126-12-07',
    cierreInscripcion: '2126-11-25',
    estado: 'INSCRIPCION',
    categorias: [
      {
        id: 7,
        categoriaJuegoId: 20,
        categoria: '4ª',
        montoClp: 12_000,
        cupo: 8,
        cuposLibres: 3,
        armado: false,
      },
    ],
    tours: [],
    afiches: [],
  };

  const SEMIFINAL: PartidoPublico = {
    ronda: 1,
    ronda_nombre: 'Semifinal',
    posicion: 1,
    jugadorA: 'Ana Uno',
    jugadorB: 'Beto Dos',
    siembraA: null,
    siembraB: null,
    ganador: 'Ana Uno',
    marcador: '6-4 6-2',
    walkover: false,
    inicio: null,
    fin: null,
    cancha: null,
  };

  const CUADRO: CuadroPublico = {
    id: 7,
    torneoId: 5,
    nombre: 'Copa de verano',
    categoria: '4ª',
    estado: 'CUADRO_ARMADO',
    inscritos: [
      { nombre: 'Ana Uno', pago: null },
      { nombre: 'Beto Dos', pago: null },
    ],
    partidos: [
      SEMIFINAL,
      { ...SEMIFINAL, posicion: 2, ganador: null, marcador: null },
      {
        ...SEMIFINAL,
        ronda: 2,
        ronda_nombre: 'Final',
        posicion: 1,
        jugadorA: null,
        jugadorB: null,
        ganador: null,
        marcador: null,
      },
    ],
  };

  let fixture: ComponentFixture<TorneosPublicos>;
  /** `Router.navigate`, espiado: la dirección lleva `?cuadro=<id>` (T135). */
  let navegar: MockInstance<Router['navigate']>;
  let api: {
    calendario: ReturnType<typeof vi.fn>;
    cuadroPublico: ReturnType<typeof vi.fn>;
    transmisionesPublicas: ReturnType<typeof vi.fn>;
    fotos: ReturnType<typeof vi.fn>;
    soltarInscripcion: ReturnType<typeof vi.fn>;
  };

  /** El doble de una consulta: con un `Error`, la promesa se rechaza. */
  const responder = <T>(valor: T | Error) =>
    vi.fn(() => (valor instanceof Error ? Promise.reject(valor) : Promise.resolve(valor)));

  const montar = async (
    torneos: TorneoPublico[] | Error,
    cuadro: typeof CUADRO | Error = CUADRO,
    transmisiones: unknown[] | Error = [],
    fotos: unknown[] | Error = [],
    soltada = { soltada: true },
  ) => {
    api = {
      calendario: responder(torneos),
      cuadroPublico: responder(cuadro),
      transmisionesPublicas: responder(transmisiones),
      fotos: responder(fotos),
      soltarInscripcion: vi.fn().mockResolvedValue(soltada),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Torneos, useValue: api },
        // El lugar de los eventos para Google (T358): el club y su dirección.
        {
          provide: Club,
          useValue: {
            datos: signal({ nombre: 'FEDAL Tennis Center', direccion: 'Lircay lt 42, Temuco' }),
          },
        },
      ],
    });
    navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(TorneosPublicos);
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
    // Sin marca de pago a medias: cada test que la quiere la pone. Sin limpiarla, la
    // de un test suelta el cupo en el siguiente.
    sessionStorage.clear();
    await montar([EN_INSCRIPCION]);
  });

  // T358 (SPEC-seo.md A8): los torneos abiertos, como eventos para Google.
  it('**publica los torneos abiertos en el <head> y los quita al salir**', async () => {
    const bloque = () => document.getElementById('datos-estructurados-torneos');
    // Con un cierre que no vence: el bloque sigue la regla de la página, que mira la fecha de hoy.
    await montar([{ ...EN_INSCRIPCION, cierreInscripcion: '2099-12-31' }]);

    expect(JSON.parse(bloque()?.textContent ?? '{}')['@graph']).toEqual([
      expect.objectContaining({ '@type': 'SportsEvent', name: EN_INSCRIPCION.nombre }),
    ]);

    fixture.destroy();
    expect(bloque()).toBeNull();
  });

  it('la bajada invita a competir, sea socio o no (P14)', () => {
    expect(texto().replace(/\s+/g, ' ')).toContain(
      'Compite en el club, seas socio o no: inscríbete en línea, mira cuántos cupos quedan y ' +
        'sigue el cuadro de cada torneo.',
    );
  });

  it('muestra el torneo con sus categorías y sus fechas en palabras', () => {
    expect(texto()).toContain('Copa de verano');
    expect(texto()).toContain('4ª');
    expect(texto()).toContain('diciembre');
  });

  it('**dice cuántos cupos quedan mientras la inscripción está abierta**', () => {
    expect(texto()).toContain('3');
    expect(texto()).toContain('cupos');
  });

  it('**dice cuánto cuesta inscribirse en cada categoría**', () => {
    // El monto es del cuadro y no del torneo: Honor puede costar el doble que la 5ª el
    // mismo fin de semana, así que un precio único de la tarjeta mentiría.
    expect(texto()).toContain('$12.000');
  });

  describe('para qué tours suma (T197, U6)', () => {
    const tour = (tourId: number, nombre: string, nivel: string) => ({
      tourId,
      tour: nombre,
      temporadaId: tourId * 10,
      temporada: '2026',
      nivelId: tourId * 100,
      nivel,
    });

    it('**lo dice con el nivel, y enlaza a cada tour**', async () => {
      await montar([
        {
          ...EN_INSCRIPCION,
          tours: [tour(1, 'Tour FEDAL', '500'), tour(2, 'Tour Senior', '250')],
        },
      ]);

      expect(texto().replace(/\s+/g, ' ')).toContain(
        'Suma para el Tour FEDAL (500) y el Tour Senior (250).',
      );
      const enlace = elemento().querySelector<HTMLAnchorElement>('a[href="/tours/1"]');
      expect(enlace?.textContent?.trim()).toBe('Tour FEDAL');
      expect(elemento().querySelector('a[href="/tours/2"]')).not.toBeNull();
    });

    it('con tres, comas entre los primeros y «y» antes del último', async () => {
      await montar([
        {
          ...EN_INSCRIPCION,
          tours: [
            tour(1, 'Tour FEDAL', '500'),
            tour(2, 'Tour Senior', '250'),
            tour(3, 'Tour Juvenil', '250'),
          ],
        },
      ]);

      expect(texto().replace(/\s+/g, ' ')).toContain(
        'Suma para el Tour FEDAL (500), el Tour Senior (250) y el Tour Juvenil (250).',
      );
    });

    it('con uno solo, sin «y»', async () => {
      await montar([{ ...EN_INSCRIPCION, tours: [tour(1, 'Tour FEDAL', '500')] }]);

      expect(texto().replace(/\s+/g, ' ')).toContain('Suma para el Tour FEDAL (500).');
    });

    it('un torneo de antes de los tours no inventa la línea', () => {
      expect(texto()).not.toContain('Suma para');
    });
  });

  describe('el cartel del torneo (T315, D3)', () => {
    const foto = (id: number, descripcion: string) => ({
      id,
      partidoId: null,
      momento: 'ANTES' as const,
      descripcion,
      miniatura: `/api/torneos/fotos/${id}/miniatura`,
      imagen: `/api/torneos/fotos/${id}/imagen`,
    });

    it('**cada torneo lleva su afiche al costado, y las otras fotos de antes en miniatura**', async () => {
      await montar([
        { ...EN_INSCRIPCION, afiches: [foto(7, 'El afiche'), foto(8, 'Las bases')] },
      ]);

      const cartel = elemento().querySelector('li app-cartel-del-torneo');
      expect(cartel?.querySelector('[data-afiche] img')?.getAttribute('src')).toBe(
        '/api/torneos/fotos/7/imagen',
      );
      expect(cartel?.querySelector('[data-otras] img')?.getAttribute('src')).toBe(
        '/api/torneos/fotos/8/miniatura',
      );
      // Lo de cada torneo va al lado del afiche, dentro del cartel.
      expect(cartel?.querySelector('h2')?.textContent).toContain('Copa de verano');
      expect(cartel?.querySelector('table')).toBeTruthy();
    });

    it('un torneo sin fotos de antes se ve con la foto del club', () => {
      const cartel = elemento().querySelector('li app-cartel-del-torneo');
      expect(cartel?.querySelector('[data-afiche] app-foto')).toBeTruthy();
    });
  });

  it('una categoría gratis lo dice con la palabra, no con un cero', async () => {
    await montar([
      {
        ...EN_INSCRIPCION,
        categorias: [{ ...EN_INSCRIPCION.categorias[0], montoClp: 0 }],
      },
    ]);

    expect(texto()).toContain('gratis');
    expect(texto()).not.toContain('$0');
  });

  describe('volver atrás sin pagar', () => {
    /**
     * Es el caso que ningún aviso del servidor cubre: apretar "atrás" en el navegador
     * no pasa por el retorno, así que no hay `?pago=` en la URL ni callback que avise.
     * Lo único que queda es la marca que dejó esta pestaña antes de irse a la pasarela.
     */
    beforeEach(() => {
      sessionStorage.setItem('torneo-pago-pendiente', 'llave-9');
    });

    it('**suelta el cupo y lo dice**', async () => {
      await montar([EN_INSCRIPCION]);

      expect(api.soltarInscripcion).toHaveBeenCalledWith('llave-9');
      expect(texto()).toContain('no quedó tomada');
    });

    it('**los cupos que muestra ya cuentan el que se acaba de soltar**', async () => {
      // La propiedad, y no cuántas peticiones se hacen: la **última** lectura del
      // calendario ocurre después de soltar. Da igual si alcanzó a hacerse una sola
      // —el cupo ya estaba suelto— o si hicieron falta dos; lo que no puede pasar es
      // que la lista quede mostrando un cupo menos de los que hay.
      await montar([EN_INSCRIPCION]);

      const soltó = api.soltarInscripcion.mock.invocationCallOrder[0];
      const calendarios = api.calendario.mock.invocationCallOrder;

      expect(calendarios[calendarios.length - 1]).toBeGreaterThan(soltó);
    });

    it('**la marca se borra: recargar no vuelve a soltar nada**', async () => {
      await montar([EN_INSCRIPCION]);

      expect(sessionStorage.getItem('torneo-pago-pendiente')).toBeNull();
    });

    it('si el pago sí entró, no dice que no quedó inscrito', async () => {
      // El servidor no suelta una inscripción que ya está pagada, así que responde
      // `soltada: false` y la pantalla no inventa un fracaso que no ocurrió.
      await montar([EN_INSCRIPCION], CUADRO, [], [], { soltada: false });

      expect(texto()).not.toContain('no quedó tomada');
    });
  });

  describe('la vuelta desde Webpay', () => {
    /** Lo que la pasarela deja en la URL al traer de vuelta al navegador. */
    const volviendo = async (pago: string) => {
      fixture.componentRef.setInput('pago', pago);
      await fixture.whenStable();
      fixture.detectChanges();
    };

    it.each([
      ['listo', 'Pago recibido: tu inscripción quedó confirmada'],
      ['comprobante', 'Recibimos tu comprobante'],
      ['inscrito', 'quedaste inscrito'],
    ])(
      '**`?pago=%s` confirma algo hecho: va al snackbar, no fijo en la página** (T324, S2)',
      async (pago, dice) => {
        // Como «Hora tomada» en la agenda (T283): lo hecho se confirma con el snackbar, y en la
        // página se quedan los errores y lo que hay que leer antes de seguir.
        await volviendo(pago);

        expect(avisoDeLoHecho()).toContain(dice);
        expect(elemento().querySelector('#resultado-del-pago')).toBeNull();
      },
    );


    it('**anular el pago dice que no quedó inscrito**', async () => {
      // Es el arreglo del defecto que encontró el club: cerrar la ventana de pago
      // dejaba la inscripción viva y a la persona creyendo que estaba dentro.
      await volviendo('anulado');

      expect(texto()).toContain('no quedó tomada');
    });

    it('un pago rechazado tampoco deja a nadie inscrito', async () => {
      await volviendo('rechazado');

      expect(texto()).toContain('no quedó tomada');
    });

    it('**la lista de espera se queda fija en la página**: hay que leerla antes de irse (T323)', async () => {
      // No quedó dentro: no es una confirmación que se va sola.
      await volviendo('espera');

      expect(elemento().querySelector('#resultado-del-pago')?.textContent).toContain(
        'lista de espera',
      );
      expect(avisoDeLoHecho()).toBe('');
    });

    it('**la lista de espera dice que no se cobra y que se avisa por correo** (T328)', async () => {
      await volviendo('espera');

      const aviso = elemento().querySelector('#resultado-del-pago')?.textContent ?? '';
      expect(aviso).toContain('sin pagar nada');
      expect(aviso).toContain('te avisamos por correo');
      expect(aviso).not.toContain('el club te llama');
    });

    it('**la página lleva a la vista el aviso que hay que leer** (T323)', async () => {
      // En el escritorio, el hero lo dejaba bajo el borde de la pantalla. jsdom no tiene
      // scrollIntoView: se pone uno que anota sobre qué elemento se llamó.
      const original = Element.prototype.scrollIntoView;
      const llevar = vi.fn();
      Element.prototype.scrollIntoView = llevar;

      await volviendo('espera');
      await fixture.whenStable();

      expect(llevar.mock.contexts[0]).toBe(elemento().querySelector('#resultado-del-pago'));
      Element.prototype.scrollIntoView = original;
    });

    it('sin volver de la pasarela no hay ningún aviso', () => {
      expect(texto()).not.toContain('Pago recibido');
      expect(texto()).not.toContain('no quedó tomada');
    });
  });

  it('**«Inscribirme» lleva a la página de la inscripción** (T316, D4)', () => {
    // Un enlace y no un botón que despliega el formulario en la tarjeta: la inscripción
    // tiene sus pasos, y abierta en la lista empujaba los demás torneos hacia abajo.
    const enlace = Array.from(elemento().querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Inscribirme'),
    );

    expect(enlace?.getAttribute('href')).toBe('/torneos/5/inscripcion');
    expect(elemento().querySelector('app-inscripcion-a-torneo')).toBeNull();
  });

  it('sin cupos lo dice, y explica que se entra en lista de espera', async () => {
    await montar([
      {
        ...EN_INSCRIPCION,
        categorias: [{ ...EN_INSCRIPCION.categorias[0], cuposLibres: 0 }],
      },
    ]);

    expect(texto()).toContain('lista de espera');
  });

  it('**un torneo con la inscripción vencida lo dice, y no ofrece inscribirse** (T321)', async () => {
    // Sigue en estado de inscripción hasta que se arma el cuadro, pero su último día ya pasó y
    // la API rechaza la inscripción: ofrecerla era un botón que termina en error.
    await montar([{ ...EN_INSCRIPCION, cierreInscripcion: '2020-01-01' }]);

    const tarjeta = elemento().querySelector('li')?.textContent ?? '';
    expect(tarjeta).toContain('Inscripción cerrada');
    expect(tarjeta).not.toContain('Inscripción abierta');
    expect(tarjeta).toContain('La inscripción cerró el');
    // Ni el precio ni los cupos: ya no hay a qué entrar.
    expect(tarjeta).not.toContain('quedan');
    const enlaces = Array.from(elemento().querySelectorAll('li a')).map((a) => a.textContent);
    expect(enlaces.some((texto) => texto?.includes('Inscribirme'))).toBe(false);
  });

  it('un torneo que ya empezó no habla de inscripción', async () => {
    await montar([{ ...EN_INSCRIPCION, estado: 'EN_CURSO' }]);

    // Dentro de la tarjeta y no en toda la página: el párrafo de arriba también
    // nombra los cupos, y buscarlo suelto haría pasar el test por otra razón.
    const tarjeta = elemento().querySelector('li')?.textContent ?? '';
    expect(tarjeta).not.toContain('cupos');
    expect(tarjeta).toContain('En curso');
  });

  it('las categorías van como tabla de posiciones: categoría, inscripción y cupos', () => {
    // TV4.2: mientras la inscripción está abierta, lo que se compara entre
    // categorías es cuánto cuesta y cuánto lugar queda.
    const tabla = elemento().querySelector('li table');
    const encabezados = [...(tabla?.querySelectorAll('thead th') ?? [])].map((th) =>
      th.textContent?.trim(),
    );

    expect(encabezados.slice(0, 3)).toEqual(['Categoría', 'Inscripción', 'Cupos']);
    expect(tabla?.querySelector('tbody')?.textContent).toContain('$12.000');
  });

  it('sin torneos este año lo dice, en vez de quedar en blanco', async () => {
    await montar([]);

    expect(texto()).toContain('Todavía no hay torneos este año');
  });

  // `value()` de un resource lanza en estado de error aunque tenga `defaultValue`.
  it('si el calendario no carga, lo dice', async () => {
    await montar(new Error('la API no respondió'));

    expect(texto()).toContain('No se pudo cargar el calendario');
  });

  describe('el modal de la categoría (T135, decisión 6)', () => {
    const boton = (etiqueta: string) =>
      Array.from(elemento().querySelectorAll('button')).find((b) =>
        b.textContent?.trim().startsWith(etiqueta),
      );

    it('**antes de armar dice "Ver quiénes juegan"; armada, "Ver el cuadro"**', async () => {
      expect(boton('Ver quiénes juegan')).toBeDefined();

      await montar([
        {
          ...EN_INSCRIPCION,
          categorias: [{ ...EN_INSCRIPCION.categorias[0], armado: true }],
        },
      ]);

      expect(boton('Ver el cuadro')).toBeDefined();
      expect(boton('Ver quiénes juegan')).toBeUndefined();
    });

    it('**abrir una categoría abre su modal y lo pone en la dirección**', async () => {
      await apretar('Ver quiénes juegan');

      expect(document.querySelector('mat-dialog-container')).not.toBeNull();
      expect(api.cuadroPublico).toHaveBeenCalledWith(7);
      expect(navegar).toHaveBeenLastCalledWith(
        [],
        expect.objectContaining({ queryParams: { cuadro: 7 } }),
      );
    });

    it('**llegar con `?cuadro=7` abre ese modal**: es el enlace del correo', async () => {
      fixture.componentRef.setInput('cuadro', '7');
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(document.querySelector('mat-dialog-container')).not.toBeNull();
      expect(api.cuadroPublico).toHaveBeenCalledWith(7);
    });

    it('cerrarlo lo saca de la dirección', async () => {
      await apretar('Ver quiénes juegan');

      // El cuadro es un MatDialog (T252): se cierra con su botón.
      [...document.querySelectorAll<HTMLButtonElement>('mat-dialog-container button')]
        .find((b) => b.textContent?.trim() === 'Cerrar')!
        .click();
      await fixture.whenStable();

      expect(document.querySelector('mat-dialog-container')).toBeNull();
      expect(navegar).toHaveBeenLastCalledWith(
        [],
        expect.objectContaining({ queryParams: { cuadro: null } }),
      );
    });

    it('el botón avisa que abre un diálogo', () => {
      expect(boton('Ver quiénes juegan')?.getAttribute('aria-haspopup')).toBe(
        'dialog',
      );
    });
  });
});
