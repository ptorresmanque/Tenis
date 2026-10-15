import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { elegir as elegirOpcion, textosDe } from '../../testing/elegir';
import { HoraAfectada } from '../../catalogo-canchas/admin/admin-canchas.service';
import { Disponibilidad } from '../../catalogo-canchas/disponibilidad';
import { SelectorDeDia } from '../../catalogo-canchas/grilla/selector-de-dia';
import { Auth, UsuarioActual } from '../../core/auth/auth';
import { ClaseDelDia, Clases } from '../clases.service';
import { Profesores } from '../profesores.service';
import { AgendaDeClases } from './agenda-clases';
import { darMotivo, textoDelDialogo } from '../../testing/dialogos';
import { avisoDeLoHecho } from '../../testing/snackbar';

/**
 * T46. Agendar una clase es cerrar la cancha, y esta pantalla lo trata como tal.
 *
 * Lo que este archivo cuida: que **con horas tomadas debajo no se agende de una**.
 * El admin ve a quién le va a quitar la hora y recién ahí decide. Sin ese paso,
 * cancelar reservas automáticamente es un descuido esperando ocurrir.
 */
describe('AgendaDeClases', () => {
  const CLASE: ClaseDelDia = {
    id: 7,
    tipo: 'TENIS',
    lugar: 'Cancha 1',
    canchaId: 1,
    profesor: 'Ana Silva',
    inicio: '2026-08-17T21:00:00.000Z',
    fin: '2026-08-17T22:00:00.000Z',
    nivel: 'INICIACION',
    estado: 'PROGRAMADA',
    cupoMaximo: 6,
    notas: null,
    serieId: null,
  };

  const TOMADA: HoraAfectada = {
    id: 3,
    folio: 'AB23CDE',
    inicio: '2026-08-17T21:00:00.000Z',
    fin: '2026-08-17T22:00:00.000Z',
    nombre: 'Camila Socia',
    email: 'camila@ejemplo.cl',
    esSocio: true,
    pagada: false,
    pagoEnCurso: false,
  };

  const ADMIN: UsuarioActual = {
    id: 1,
    nombre: 'Rodrigo',
    apellido: 'Torres',
    email: 'admin@clubdetenis.cl',
    telefono: null,
    esAdmin: true,
    esGestor: false,
    socioId: null,
    socioActivo: false,
    socioAlDia: false,
    profesorId: null,
  };
  const PROFESORA: UsuarioActual = { ...ADMIN, esAdmin: false, profesorId: 9 };

  let fixture: ComponentFixture<AgendaDeClases>;
  let listarProfesores: ReturnType<typeof vi.fn>;
  let canchasPublicas: ReturnType<typeof vi.fn>;
  let api: {
    delDia: ReturnType<typeof vi.fn>;
    simular: ReturnType<typeof vi.fn>;
    agendar: ReturnType<typeof vi.fn>;
    cancelar: ReturnType<typeof vi.fn>;
    cancelarSerieDesde: ReturnType<typeof vi.fn>;
    ficha: ReturnType<typeof vi.fn>;
    socios: ReturnType<typeof vi.fn>;
  };

  const montar = async (
    clases: ClaseDelDia[],
    afectadas: HoraAfectada[] = [],
    usuario: UsuarioActual = ADMIN,
  ) => {
    listarProfesores = vi.fn().mockResolvedValue([
      {
        id: 4,
        nombreVisible: 'Ana Silva',
        especialidad: 'Iniciación',
        telefono: '',
        tarifaHoraClp: null,
        activo: true,
        usuarioId: null,
      },
    ]);
    // La lista pública, que el servidor ya da sin las canchas desactivadas (T222).
    canchasPublicas = vi.fn().mockResolvedValue([{ id: 2, nombre: 'Cancha 1' }]);
    api = {
      delDia: vi.fn().mockResolvedValue(clases),
      simular: vi.fn().mockResolvedValue({ afectadas }),
      agendar: vi.fn().mockResolvedValue({ id: 1, bloqueoId: 2, canceladas: [] }),
      cancelar: vi.fn().mockResolvedValue({ id: 7 }),
      cancelarSerieDesde: vi.fn().mockResolvedValue({ canceladas: 5 }),
      // Los piden los inscritos de una clase, al abrir su panel (T293). Sin responder: las
      // pruebas que abren uno solo miran que se pidan.
      ficha: vi.fn(() => new Promise(() => undefined)),
      socios: vi.fn(() => new Promise(() => undefined)),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Clases, useValue: api },
        { provide: Profesores, useValue: { listar: listarProfesores } },
        { provide: Disponibilidad, useValue: { canchas: canchasPublicas } },
        { provide: Auth, useValue: { usuario: signal(usuario).asReadonly() } },
      ],
    });

    fixture = TestBed.createComponent(AgendaDeClases);
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
    await montar([CLASE]);
  });

  it('lista las clases del día con su profesor y su nivel', () => {
    expect(texto()).toContain('Ana Silva');
    expect(texto()).toContain('Iniciación');
    expect(texto()).toContain('Cancha 1');
  });

  it('**el día se elige con el selector de la agenda**, y la lista es la de ese día (T293)', async () => {
    // Las flechas y el calendario propios de Clases se fueron: el mismo selector que la agenda.
    expect(elemento().querySelector('[aria-label="Día anterior"]')).toBeNull();
    const selector = fixture.debugElement.query(By.directive(SelectorDeDia));

    (selector.componentInstance as SelectorDeDia).fecha.set('2026-08-20');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.delDia).toHaveBeenLastCalledWith('2026-08-20');
  });

  describe('cada clase es un panel (T293)', () => {
    const cabeceras = () => [
      ...elemento().querySelectorAll<HTMLElement>('mat-expansion-panel-header'),
    ];
    /** Abre con un clic y sin esperar: los inscritos dejan su pedido abierto. */
    const abrir = async (indice: number) => {
      cabeceras()[indice].click();
      fixture.detectChanges();
      await new Promise((listo) => setTimeout(listo));
    };

    it('**cerrado, con la hora, el lugar, el tipo, el profesor y el cupo en su cabecera**', () => {
      const [cabecera] = cabeceras();
      const resumen = cabecera.textContent!.replace(/\s+/g, ' ');

      expect(resumen).toMatch(/\d\d:\d\d–\d\d:\d\d/);
      expect(resumen).toContain('Cancha 1');
      expect(resumen).toContain('Iniciación');
      expect(resumen).toContain('Ana Silva');
      expect(resumen).toContain('hasta 6 alumnos');
      expect(cabecera.getAttribute('aria-expanded')).toBe('false');
    });

    it('**los inscritos se piden recién al abrirla**; ya no hay «Ver inscritos»', async () => {
      expect(texto()).not.toContain('Ver inscritos');
      expect(elemento().querySelector('app-inscritos')).toBeNull();

      await abrir(0);

      expect(cabeceras()[0].getAttribute('aria-expanded')).toBe('true');
      expect(elemento().querySelector('app-inscritos')).not.toBeNull();
      expect(api.ficha).toHaveBeenCalledWith(7);
    });

    it('abrir una clase no cierra otra', async () => {
      await montar([CLASE, { ...CLASE, id: 8, lugar: 'Cancha 2' }]);

      await abrir(0);
      await abrir(1);

      expect(cabeceras().map((c) => c.getAttribute('aria-expanded'))).toEqual(['true', 'true']);
    });
  });

  it('**la del gimnasio dice "Gimnasio", "Preparación física" y si es grupal** (T234)', async () => {
    await montar([
      { ...CLASE, tipo: 'PREPARACION_FISICA', lugar: 'Gimnasio', canchaId: null, nivel: null, cupoMaximo: 8 },
    ]);

    const fila = texto().replace(/\s+/g, ' ');
    expect(fila).toContain('Gimnasio');
    expect(fila).toContain('Preparación física · Grupal');
    expect(fila).toContain('Ana Silva · hasta 8 alumnos');
  });

  it('sin nadie debajo, agendar no pregunta nada', async () => {
    // Preguntar por preguntar entrena a la gente a apretar sin leer, y entonces la
    // advertencia que sí importa tampoco se lee.
    await apretar('Agendar clase');

    expect(api.agendar).toHaveBeenCalled();
    expect(texto()).not.toContain('hora tomada');
  });

  it('**con una hora tomada debajo, no agenda hasta que el admin la ve**', async () => {
    await montar([CLASE], [TOMADA]);

    await apretar('Agendar clase');

    expect(api.agendar).not.toHaveBeenCalled();
    expect(texto()).toContain('1 hora tomada');
    expect(texto()).toContain('Camila Socia');
  });

  it('recién al confirmar se agenda y se avisa', async () => {
    await montar([CLASE], [TOMADA]);
    api.agendar.mockResolvedValue({ id: 1, bloqueoId: 2, canceladas: [TOMADA] });
    await apretar('Agendar clase');

    await apretar('Agendar igual');

    expect(api.agendar).toHaveBeenCalled();
    // En singular de verdad: "1 persona que tenían esa hora" es lo que sale de
    // pluralizar media frase y dejar el verbo en plural.
    expect(avisoDeLoHecho()).toContain('Avisamos a la persona que tenía esa hora');
  });

  it('"Mejor no" deja todo como estaba', async () => {
    await montar([CLASE], [TOMADA]);
    await apretar('Agendar clase');

    await apretar('Mejor no');

    expect(api.agendar).not.toHaveBeenCalled();
    expect(texto()).not.toContain('hora tomada');
  });

  it('**con un pago en curso no deja confirmar**', async () => {
    // El servidor lo rechaza igual, pero el botón lo dice antes: cancelarla dejaría
    // a esa persona sin cancha y sin su dinero.
    await montar([CLASE], [{ ...TOMADA, pagoEnCurso: true }]);
    await apretar('Agendar clase');

    const boton = Array.from(elemento().querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Agendar igual'),
    ) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    expect(texto()).toContain('pagándose ahora');
  });

  it('cancelar una clase exige un motivo, y sin él no llama al servidor', async () => {
    await apretar('Cancelar clase');

    // El motivo se pide en un diálogo (T253): en blanco no deja confirmar, y descartar no hace nada.
    expect(textoDelDialogo()).toContain('¿Cancelar la clase de');
    expect(
      document.querySelector<HTMLButtonElement>('mat-dialog-container button[type="submit"]')!
        .disabled,
    ).toBe(true);
    await darMotivo(fixture, null);

    expect(api.cancelar).not.toHaveBeenCalled();
  });

  it('con motivo, la cancela y lo dice', async () => {
    await apretar('Cancelar clase');
    await darMotivo(fixture, 'Se enfermó');

    expect(api.cancelar).toHaveBeenCalledWith(7, 'Se enfermó');
    expect(avisoDeLoHecho()).toContain('vuelve a estar disponible');
  });

  it('si el servidor rechaza, lo dice con sus palabras', async () => {
    api.simular.mockRejectedValue({
      error: { message: 'Esa cancha ya está cerrada en ese rango.' },
    });

    await apretar('Agendar clase');

    expect(texto()).toContain('ya está cerrada');
  });

  it('**las canchas salen de la lista pública, sin las desactivadas**', async () => {
    // Una desactivada no tiene grilla, así que agendar sobre ella responde 404. Desde
    // T222 la lista es la pública, que el servidor ya da solo con las activas: la misma
    // para el admin y el profesor, que no puede leer las del panel.
    const opciones = textosDe(fixture, 'mat-select[name="canchaId"]');

    expect(canchasPublicas).toHaveBeenCalled();
    expect(opciones).toContain('Cancha 1');
  });

  it('**a una clase que ya se dio no se le ofrece cancelarla**', async () => {
    // El servidor lo rechaza con un 409; ofrecerlo solo sirve para descubrirlo
    // apretando. Es el mismo criterio de las canchas desactivadas.
    await montar([{ ...CLASE, estado: 'REALIZADA' }]);

    expect(texto()).toContain('Ya se dio');
    expect(
      Array.from(elemento().querySelectorAll('button')).some((b) =>
        b.textContent?.includes('Cancelar clase'),
      ),
    ).toBe(false);
  });

  it('sin clases el día lo dice, en vez de quedar en blanco', async () => {
    await montar([]);

    expect(texto()).toContain('No hay clases este día');
  });

  // `value()` de un resource lanza en estado de error aunque tenga `defaultValue`.
  it('si la API no responde, lo dice en vez de reventar', async () => {
    const caida = () => Promise.reject(new Error('la API no respondió'));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Clases, useValue: { delDia: caida } },
        { provide: Profesores, useValue: { listar: caida } },
        { provide: Disponibilidad, useValue: { canchas: caida } },
        { provide: Auth, useValue: { usuario: signal(ADMIN).asReadonly() } },
      ],
    });

    fixture = TestBed.createComponent(AgendaDeClases);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(texto()).toContain('No se pudieron cargar las clases');
    expect(texto()).toContain('No se pudieron cargar los profesores');
  });

  /** T115. La agenda también agenda series: el formulario vive en `NuevaSerie`. */
  describe('las series', () => {
    it('**ofrece agendar una serie, con las canchas activas y los profesores**', () => {
      const serie = fixture.debugElement.query((nodo) => nodo.name === 'app-nueva-serie');

      expect(serie).not.toBeNull();
      expect(serie.componentInstance.canchas()).toEqual([{ id: 2, nombre: 'Cancha 1' }]);
      expect(serie.componentInstance.profesores()).toHaveLength(1);
    });

    it('al agendarla, la agenda lo dice y vuelve a cargar el día', async () => {
      const serie = fixture.debugElement.query((nodo) => nodo.name === 'app-nueva-serie');

      serie.componentInstance.agendada.emit('Serie agendada: 18 clases.');
      await fixture.whenStable();
      fixture.detectChanges();

      expect(avisoDeLoHecho()).toContain('Serie agendada: 18 clases.');
      expect(api.delDia).toHaveBeenCalledTimes(2);
    });
  });

  /** T117. Una clase de una serie se puede cancelar con las que le siguen. */
  describe('cancelar la serie desde una fecha', () => {
    it('en una clase suelta no se ofrece', () => {
      expect(texto()).not.toContain('Cancelar desde esta fecha');
    });

    it('**en una clase de una serie, cancela esa y las siguientes, con el motivo**', async () => {
      await montar([{ ...CLASE, serieId: 9 }]);

      await apretar('Cancelar desde esta fecha');
      expect(textoDelDialogo()).toContain('¿Cancelar la serie de');
      await darMotivo(fixture, 'Fin de temporada');

      // El día de la clase, en hora del club: 21:00Z del 17 de agosto son las 17:00 del 17.
      expect(api.cancelarSerieDesde).toHaveBeenCalledWith(9, '2026-08-17', 'Fin de temporada');
      expect(avisoDeLoHecho()).toContain('Se cancelaron 5 clases de la serie');
    });

    it('sin motivo no cancela nada', async () => {
      await montar([{ ...CLASE, serieId: 9 }]);

      await apretar('Cancelar desde esta fecha');
      await darMotivo(fixture, null);

      expect(api.cancelarSerieDesde).not.toHaveBeenCalled();
    });
  });

  /** T222. El profesor agenda lo suyo, sin elegir profesor y sin cancelar reservas. */
  describe('el profesor', () => {
    it('no elige profesor ni pide la lista de profesores: la clase queda a su nombre', async () => {
      await montar([], [], PROFESORA);

      expect(elemento().querySelector('mat-select[name="profesorId"]')).toBeNull();
      expect(listarProfesores).not.toHaveBeenCalled();
      expect(texto()).toContain('Solo en horas libres');

      await apretar('Agendar clase');

      expect(api.agendar).toHaveBeenCalledWith(expect.objectContaining({ profesorId: 9 }));
    });

    it('**sobre una hora reservada ve el aviso, y ningún botón que la cancele**', async () => {
      await montar([], [TOMADA], PROFESORA);

      await apretar('Agendar clase');

      expect(texto()).toContain(
        'Esta hora tiene reservas. Para agendar encima, habla con administración.',
      );
      expect(texto()).not.toContain('Agendar igual y avisarles');
      expect(api.agendar).not.toHaveBeenCalled();
    });

    it('la serie también queda a su nombre', async () => {
      await montar([], [], PROFESORA);

      const serie = fixture.debugElement.query((nodo) => nodo.name === 'app-nueva-serie');
      expect(serie.componentInstance.profesorFijo()).toBe(9);
    });

    it('al admin la serie le deja elegir', () => {
      const serie = fixture.debugElement.query((nodo) => nodo.name === 'app-nueva-serie');
      expect(serie.componentInstance.profesorFijo()).toBeNull();
    });
  });

  /** T233. La clase del gimnasio: sin cancha ni nivel, grupal o individual. */
  describe('preparación física', () => {
    /**
     * Marca la opción de un grupo de botones de radio por su etiqueta. En el radio de Material
     * la etiqueta va al lado del input, y un clic en ella lo marca, como en el navegador (T250).
     */
    const elegir = async (etiqueta: string) => {
      Array.from(elemento().querySelectorAll('label'))
        .find((label) => label.textContent?.trim() === etiqueta)!
        .click();
      await fixture.whenStable();
      fixture.detectChanges();
    };

    const profesor = async () => {
      await elegirOpcion(fixture, `mat-select[name="profesorId"]`, '4');
      await fixture.whenStable();
      fixture.detectChanges();
    };

    it('**no pide cancha ni nivel, y la clase viaja con su tipo y sin ellos**', async () => {
      await elegir('Preparación física');
      await profesor();

      expect(elemento().querySelector('mat-select[name="canchaId"]')).toBeNull();
      expect(elemento().querySelector('mat-select[name="nivel"]')).toBeNull();

      await apretar('Agendar clase');

      const enviada = api.simular.mock.calls[0][0] as Record<string, unknown>;
      expect(enviada).toMatchObject({ tipo: 'PREPARACION_FISICA', profesorId: 4, cupoMaximo: 6 });
      expect(enviada).not.toHaveProperty('canchaId');
      expect(enviada).not.toHaveProperty('nivel');
      expect(avisoDeLoHecho()).toContain('Clase agendada en el gimnasio');
    });

    it('**"Individual" manda un alumno, y no pregunta el cupo**', async () => {
      await elegir('Preparación física');
      await elegir('Individual');

      expect(elemento().querySelector('input[name="cupoMaximo"]')).toBeNull();

      await apretar('Agendar clase');

      expect(api.simular).toHaveBeenCalledWith(expect.objectContaining({ cupoMaximo: 1 }));
    });

    it('el gimnasio ocupado se dice con las palabras del servidor', async () => {
      api.simular.mockRejectedValue({
        status: 409,
        error: {
          motivo: 'GIMNASIO_OCUPADO',
          message: 'El gimnasio ya tiene una clase de 18:00 a 19:00, con Ana Silva: es una a la vez.',
        },
      });
      await elegir('Preparación física');

      await apretar('Agendar clase');

      expect(texto()).toContain('El gimnasio ya tiene una clase de 18:00 a 19:00');
    });

    it('volviendo a "Tenis" vuelven la cancha y el nivel, y la clase viaja como tenis', async () => {
      await elegir('Preparación física');
      await elegir('Tenis');

      expect(elemento().querySelector('mat-select[name="canchaId"]')).not.toBeNull();

      await apretar('Agendar clase');

      expect(api.simular).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'TENIS', nivel: 'INICIACION' }),
      );
    });
  });
});
