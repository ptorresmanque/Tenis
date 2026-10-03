import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CuadroPublico,
  PartidoPublico,
  Torneos,
  TorneoPublico,
} from '../torneos.service';
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
    categoria: 'Club 250',
    superficie: 'ARCILLA',
    fechaInicio: '2026-12-01',
    fechaFin: '2026-12-07',
    cierreInscripcion: '2026-11-25',
    estado: 'INSCRIPCION',
    categorias: [
      {
        id: 7,
        categoriaJuegoId: 20,
        categoria: '4ª',
        valor: 'Club 250',
        montoClp: 12_000,
        cupo: 8,
        cuposLibres: 3,
        armado: false,
      },
    ],
  };

  const SEMIFINAL: PartidoPublico = {
    ronda: 1,
    ronda_nombre: 'Semifinal',
    posicion: 1,
    jugadorA: 'Ana Uno',
    jugadorB: 'Beto Dos',
    ganador: 'Ana Uno',
    marcador: '6-4 6-2',
    walkover: false,
  };

  const CUADRO: CuadroPublico = {
    id: 7,
    torneoId: 5,
    nombre: 'Copa de verano',
    categoria: 'Club 250',
    estado: 'CUADRO_ARMADO',
    inscritos: ['Ana Uno', 'Beto Dos'],
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

  const EN_VIVO = {
    id: 3,
    canchaId: 1,
    cancha: 'Cancha 1',
    url: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    miniatura: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    titulo: null,
    inicio: '2026-11-07T13:00:00.000Z',
    fin: '2026-11-07T22:00:00.000Z',
  };

  let fixture: ComponentFixture<TorneosPublicos>;
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
    transmisiones: (typeof EN_VIVO)[] | Error = [],
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
      providers: [{ provide: Torneos, useValue: api }],
    });

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

  it('muestra el torneo con su categoría y sus fechas en palabras', () => {
    expect(texto()).toContain('Copa de verano');
    expect(texto()).toContain('Club 250');
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

    it('**pagar y volver lo dice: la inscripción quedó confirmada**', async () => {
      await volviendo('listo');

      expect(texto()).toContain('Pago recibido');
    });

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

    it('sin volver de la pasarela no hay ningún aviso', () => {
      expect(texto()).not.toContain('Pago recibido');
      expect(texto()).not.toContain('no quedó tomada');
    });
  });

  it('**llegar con `?inscripcion=5` abre el formulario de ese torneo**', async () => {
    // Es el botón "Inscribirme" de la portada: sin esto aterriza en la lista y hay
    // que volver a buscar el torneo que ya se había elegido.
    fixture.componentRef.setInput('inscripcion', '5');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(elemento().querySelector('app-inscripcion-a-torneo')).not.toBeNull();
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

  it('un torneo que ya empezó no habla de inscripción', async () => {
    await montar([{ ...EN_INSCRIPCION, estado: 'EN_CURSO' }]);

    // Dentro de la tarjeta y no en toda la página: el párrafo de arriba también
    // nombra los cupos, y buscarlo suelto haría pasar el test por otra razón.
    const tarjeta = elemento().querySelector('li')?.textContent ?? '';
    expect(tarjeta).not.toContain('cupos');
    expect(tarjeta).toContain('En curso');
  });

  it('**el cuadro va en columnas que se desplazan, no en una tabla que se encoge**', async () => {
    // En 375px una tabla de cuatro rondas queda ilegible, y este cuadro se mira sobre
    // todo desde el teléfono, en el club.
    //
    // Reescrito en TV4.2: antes pedía que no hubiera ninguna tabla en la página, y
    // desde entonces las categorías sí son una. Vigila lo mismo, ahora en el cuadro.
    await apretar('Ver quiénes juegan');
    const cuadro = elemento().querySelector('[data-cuadro]');

    expect(cuadro).not.toBeNull();
    expect(cuadro?.querySelector('table')).toBeNull();
    expect(cuadro?.matches('.overflow-x-auto')).toBe(true);
  });

  it('las categorías van como tabla de posiciones: categoría, inscripción y cupos', () => {
    // TV4.2: mientras la inscripción está abierta, lo que se compara entre
    // categorías es cuánto cuesta y cuánto lugar queda.
    const tabla = elemento().querySelector('li table.tabla');
    const encabezados = [...(tabla?.querySelectorAll('thead th') ?? [])].map((th) =>
      th.textContent?.trim(),
    );

    expect(encabezados.slice(0, 3)).toEqual(['Categoría', 'Inscripción', 'Cupos']);
    expect(tabla?.querySelector('tbody')?.textContent).toContain('$12.000');
  });

  it('el cuadro muestra el marcador y quién ganó', async () => {
    await apretar('Ver quiénes juegan');

    expect(texto()).toContain('6-4 6-2');
    const enNegrita = elemento().querySelector('li li .font-semibold');
    expect(enNegrita?.textContent).toContain('Ana Uno');
  });

  it('antes de armarse muestra los inscritos, que es lo que se quiere saber', async () => {
    await montar([EN_INSCRIPCION], {
      ...CUADRO,
      estado: 'INSCRIPCION',
      partidos: [],
    });

    await apretar('Ver quiénes juegan');

    expect(texto()).toContain('Ana Uno, Beto Dos');
  });

  it('**no publica el teléfono de nadie: no viene en la respuesta**', async () => {
    await apretar('Ver quiénes juegan');

    expect(texto()).not.toMatch(/\+?56\d{8}/);
  });

  it('**el cuadro de un torneo no se muestra bajo el nombre de otro**', async () => {
    // Al cambiar de cuadro, el `resource` conserva el valor anterior hasta que llega
    // el nuevo: sin comprobar de quién es el cuadro que se tiene en la mano, la
    // tarjeta del segundo dibuja el del primero mientras carga. Acá el servidor
    // devuelve siempre el cuadro 7, y el que se abre es el 99.
    //
    // **La identidad que se compara es la del cuadro y no la del torneo** (T62): un
    // torneo corre varios, así que "el cuadro del torneo 5" ya no distingue nada.
    const otro = {
      ...EN_INSCRIPCION,
      id: 9,
      nombre: 'Copa de invierno',
      categorias: [{ ...EN_INSCRIPCION.categorias[0], id: 99 }],
    };
    await montar([otro]);

    await apretar('Ver quiénes juegan');

    expect(texto()).not.toContain('6-4 6-2');
  });

  it('sin torneos este año lo dice, en vez de quedar en blanco', async () => {
    await montar([]);

    expect(texto()).toContain('Todavía no hay torneos este año');
  });

  describe('las transmisiones (T68)', () => {
    it('**el live se ve en la página, sin ir a YouTube**', async () => {
      await montar([{ ...EN_INSCRIPCION, estado: 'EN_CURSO' }], CUADRO, [EN_VIVO]);
      await apretar('Ver quiénes juegan');

      expect(texto()).toContain('En vivo');
      expect(texto()).toContain('Cancha 1');
    });

    it('**no carga nada de Google hasta que alguien aprieta play**', async () => {
      await montar([{ ...EN_INSCRIPCION, estado: 'EN_CURSO' }], CUADRO, [EN_VIVO]);
      await apretar('Ver quiénes juegan');

      expect(elemento().querySelector('iframe')).toBeNull();
    });

    it('sin transmisiones no aparece el bloque vacío', async () => {
      await montar([{ ...EN_INSCRIPCION, estado: 'EN_CURSO' }], CUADRO, []);
      await apretar('Ver quiénes juegan');

      expect(texto()).not.toContain('En vivo');
    });
  });

  it('**las fotos del torneo salen en su tarjeta** (T69)', async () => {
    await montar([{ ...EN_INSCRIPCION, estado: 'EN_CURSO' }], CUADRO, [], [
      {
        id: 4,
        partidoId: null,
        momento: 'DURANTE',
        descripcion: 'La entrega de premios',
        miniatura: '/api/torneos/fotos/4/miniatura',
        imagen: '/api/torneos/fotos/4/imagen',
      },
    ]);
    await apretar('Ver quiénes juegan');

    expect(texto()).toContain('Fotos');
    expect(
      elemento().querySelector('img')?.getAttribute('src'),
    ).toBe('/api/torneos/fotos/4/miniatura');
  });

  // `value()` de un resource lanza en estado de error aunque tenga `defaultValue`.
  it('si el calendario no carga, lo dice', async () => {
    await montar(new Error('la API no respondió'));

    expect(texto()).toContain('No se pudo cargar el calendario');
  });

  it('si el cuadro no carga, lo dice bajo su categoría', async () => {
    await montar([EN_INSCRIPCION], new Error('la API no respondió'));

    await apretar('Ver quiénes juegan');

    expect(texto()).toContain('No se pudo cargar el cuadro');
  });

  it('si las fotos y los lives no cargan, el cuadro se ve igual', async () => {
    await montar([{ ...EN_INSCRIPCION, estado: 'EN_CURSO' }], CUADRO, new Error('la API no respondió'), new Error('la API no respondió'));

    await apretar('Ver quiénes juegan');

    expect(texto()).toContain('6-4 6-2');
  });
});
