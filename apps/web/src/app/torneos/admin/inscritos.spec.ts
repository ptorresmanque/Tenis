import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InscripcionTorneo, ListaDelCuadro, Torneos } from '../torneos.service';
import { InscritosDelTorneo } from './inscritos';

/**
 * T50. Quién juega el torneo.
 *
 * Lo que este archivo cuida: que **la lista de espera se vea como lo que es** —gente
 * que no entra sola— y que con el cuadro lleno la pantalla avise, en vez de apagar un
 * botón: el que se inscriba de más queda esperando, que es distinto de ser rechazado.
 */
describe('InscritosDelTorneo', () => {
  const EN_EL_CUADRO: InscripcionTorneo = {
    id: 11,
    jugadorId: 1,
    jugador: 'Carolina Díaz',
    numeroSocio: '001',
    procedencia: 'Club de Ñuñoa',
    restricciones: [{ diaSemana: 2, horaDesde: '18:00', horaHasta: '21:00' }],
    siembra: null,
    estado: 'INSCRITA',
    inscritaEn: '2026-11-01T12:00:00.000Z',
    estadoPago: 'PAGADA',
    medioPago: 'WEBPAY',
    tieneComprobante: false,
    telefono: '56911112222',
  };

  /** El que subió un comprobante y espera que alguien lo mire. */
  const POR_REVISAR: InscripcionTorneo = {
    id: 13,
    jugadorId: 3,
    jugador: 'Camila Reyes',
    numeroSocio: '214',
    procedencia: null,
    restricciones: [],
    siembra: null,
    estado: 'INSCRITA',
    inscritaEn: '2026-11-03T12:00:00.000Z',
    estadoPago: 'PENDIENTE',
    medioPago: 'TRANSFERENCIA',
    tieneComprobante: true,
    telefono: '56987654321',
  };

  /** El que eligió Webpay y todavía no paga: mismo estado, otra situación. */
  const SIN_PAGAR: InscripcionTorneo = {
    ...POR_REVISAR,
    id: 14,
    jugadorId: 4,
    jugador: 'Matías Fuentes',
    numeroSocio: null,
    medioPago: 'WEBPAY',
    tieneComprobante: false,
  };

  const ESPERANDO: InscripcionTorneo = {
    id: 12,
    jugadorId: 2,
    jugador: 'Tomás Invitado',
    numeroSocio: null,
    siembra: null,
    procedencia: null,
    restricciones: [],
    estado: 'LISTA_ESPERA',
    inscritaEn: '2026-11-02T12:00:00.000Z',
    estadoPago: 'EXENTA',
    medioPago: null,
    tieneComprobante: false,
    telefono: null,
  };

  const LISTA: ListaDelCuadro = {
    torneoId: 5,
    torneoCategoriaId: 7,
    categoria: '4ª',
    cupo: 2,
    montoClp: 15000,
    estado: 'INSCRIPCION',
    inscritos: [EN_EL_CUADRO],
    enEspera: [],
    retirados: [],
  };

  let fixture: ComponentFixture<InscritosDelTorneo>;
  let api: {
    inscripciones: ReturnType<typeof vi.fn>;
    jugadores: ReturnType<typeof vi.fn>;
    inscribir: ReturnType<typeof vi.fn>;
    retirar: ReturnType<typeof vi.fn>;
    promover: ReturnType<typeof vi.fn>;
    aprobarPago: ReturnType<typeof vi.fn>;
    rechazarPago: ReturnType<typeof vi.fn>;
  };

  const montar = async (lista: ListaDelCuadro) => {
    api = {
      inscripciones: vi.fn().mockResolvedValue(lista),
      jugadores: vi.fn().mockResolvedValue([
        { id: 1, nombre: 'Carolina', apellido: 'Díaz', activo: true },
        { id: 3, nombre: 'Matías', apellido: 'Rojas', activo: true },
      ]),
      inscribir: vi.fn().mockResolvedValue({ id: 13, estado: 'INSCRITA' }),
      retirar: vi.fn().mockResolvedValue({ id: 11 }),
      promover: vi.fn().mockResolvedValue({ id: 12 }),
      aprobarPago: vi.fn().mockResolvedValue({ id: 13 }),
      rechazarPago: vi.fn().mockResolvedValue({ id: 13 }),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: Torneos, useValue: api }],
    });

    fixture = TestBed.createComponent(InscritosDelTorneo);
    fixture.componentRef.setInput('cuadroId', 5);
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

  /** Escribe el motivo del rechazo en la fila abierta. */
  const escribirMotivo = async (motivo: string) => {
    const campo = elemento().querySelector<HTMLInputElement>(
      '[name^="motivo-"]',
    )!;
    campo.value = motivo;
    campo.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await montar(LISTA);
  });

  it('dice cuántos lugares del cuadro están tomados', () => {
    expect(texto()).toContain('1 de 2');
    expect(texto()).toContain('Carolina Díaz');
  });

  it('**la lista de espera se ve aparte y dice que no entran solos**', async () => {
    await montar({ ...LISTA, enEspera: [ESPERANDO] });

    expect(texto()).toContain('Lista de espera');
    expect(texto()).toContain('Tomás Invitado');
    expect(texto()).toContain('No entran solos');
  });

  it('meter al cuadro es un botón, no un automatismo', async () => {
    await montar({ ...LISTA, enEspera: [ESPERANDO] });

    await apretar('Meter al cuadro');

    expect(api.promover).toHaveBeenCalledWith(5, 12);
  });

  it('**con el cuadro lleno avisa que el próximo queda esperando**', async () => {
    // Y el botón sigue disponible: quedar en espera es una inscripción válida, no un
    // rechazo, y apagar el botón haría parecer lo contrario.
    await montar({
      ...LISTA,
      inscritos: [EN_EL_CUADRO, { ...EN_EL_CUADRO, id: 14, jugadorId: 4 }],
    });

    expect(texto()).toContain('queda en lista de espera');
    const boton = Array.from(elemento().querySelectorAll('button')).find((b) =>
      b.textContent?.trim().startsWith('Inscribir'),
    ) as HTMLButtonElement;
    expect(boton.disabled).toBe(false);
  });

  it('**a quien ya está en el torneo no se le ofrece de nuevo**', () => {
    const opciones = Array.from(
      elemento().querySelectorAll('select[name="jugadorId"] option'),
    ).map((o) => o.textContent?.trim());

    expect(opciones.some((o) => o?.startsWith('Rojas'))).toBe(true);
    expect(opciones.some((o) => o?.startsWith('Díaz'))).toBe(false);
  });

  it('el que se retiró vuelve a la lista: puede reinscribirse', async () => {
    await montar({
      ...LISTA,
      inscritos: [],
      retirados: [{ ...EN_EL_CUADRO, estado: 'RETIRADA' }],
    });

    const opciones = Array.from(
      elemento().querySelectorAll('select[name="jugadorId"] option'),
    ).map((o) => o.textContent?.trim());

    expect(opciones.some((o) => o?.startsWith('Díaz'))).toBe(true);
    expect(texto()).toContain('Se bajaron: Carolina Díaz');
  });

  it('retirar a alguien lo pide al servidor', async () => {
    await apretar('Retirar');

    expect(api.retirar).toHaveBeenCalledWith(5, 11);
  });

  it('**con la inscripción cerrada no se ofrece inscribir a nadie**', async () => {
    await montar({ ...LISTA, estado: 'CUADRO_ARMADO' });

    expect(elemento().querySelector('select[name="jugadorId"]')).toBeNull();
    expect(texto()).toContain('inscripción de este torneo está cerrada');
  });

  it('si el servidor rechaza, lo dice con sus palabras', async () => {
    api.inscribir.mockRejectedValue({
      error: { message: 'La inscripción de ese torneo ya se cerró.' },
    });

    await apretar('Inscribir');

    expect(texto()).toContain('ya se cerró');
  });

  it('**muestra cuándo NO puede jugar el inscrito**', () => {
    // Es lo que el club mira al programar los partidos, y lo que T67 va a usar para
    // rechazar un horario imposible. Sin esto, el dato viajaba por la API y no lo veía
    // nadie.
    expect(texto()).toContain('No puede');
    expect(texto()).toContain('los martes de 18:00 a 21:00');
  });

  it('**al socio se le muestra su número, no su procedencia**', () => {
    // La procedencia existe para el externo: de qué club viene alguien que no es del
    // nuestro. Para un socio, el club es este, y repetirlo al lado de su número sería
    // ruido en una lista que el admin lee de corrido.
    expect(texto()).toContain('Socio 001');
    expect(texto()).not.toContain('Club de Ñuñoa');
  });

  describe('el pago, en la misma fila que el nombre', () => {
    const conPagos = () =>
      montar({
        ...LISTA,
        cupo: 8,
        inscritos: [EN_EL_CUADRO, POR_REVISAR, SIN_PAGAR],
      });

    it('**cada inscrito muestra cómo va su pago**', async () => {
      await conPagos();

      expect(texto()).toContain('Pagada');
    });

    it('**"por revisar" y "sin pagar" no se dicen igual**', async () => {
      // En la base las dos son PENDIENTE. Para el club son dos cosas distintas: una
      // es trabajo suyo y la otra se resuelve sola, así que mostrarlas iguales
      // convertiría la columna en ruido.
      await conPagos();

      expect(texto()).toContain('Por revisar');
      expect(texto()).toContain('sin pagar');
    });

    it('el filtro por revisar deja solo a quien espera que lo miren', async () => {
      await conPagos();

      await apretar('Por revisar');

      expect(texto()).toContain('Camila Reyes');
      expect(texto()).not.toContain('Matías Fuentes');
    });

    it('**el comprobante se mira sin salir de la pantalla**', async () => {
      await conPagos();

      await apretar('Revisar');

      const imagen = elemento().querySelector('img');
      expect(imagen?.getAttribute('src')).toBe(
        '/api/admin/inscripciones/13/comprobante',
      );
    });

    it('**la imagen no se pide hasta que se abre esa fila**', async () => {
      // Es lo que permitió traerla acá: con la imagen de cada inscrito cargada de
      // entrada, abrir la lista de un cuadro lleno se traía veinte fotos.
      await conPagos();

      expect(elemento().querySelector('img')).toBeNull();
    });

    it('confirmar el pago lo resuelve desde acá', async () => {
      await conPagos();
      await apretar('Revisar');

      await apretar('Confirmar');

      expect(api.aprobarPago).toHaveBeenCalledWith(13);
    });

    it('**rechazar exige el motivo**, que es lo que el club le dice por teléfono', async () => {
      await conPagos();
      await apretar('Revisar');

      await apretar('Rechazar');

      expect(api.rechazarPago).not.toHaveBeenCalled();
      expect(texto()).toContain('Escribe el motivo');
    });

    it('con motivo escrito, rechaza y avisa de que libera el cupo', async () => {
      await conPagos();
      await apretar('Revisar');
      await escribirMotivo('El comprobante es de otro monto');

      await apretar('Rechazar');

      expect(api.rechazarPago).toHaveBeenCalledWith(
        13,
        'El comprobante es de otro monto',
      );
    });

    it('**la lista se lee en columnas, no como un renglón de piezas sueltas**', async () => {
      // Lo encontró el club a ojo: con todo en un solo renglón, el estado de pago y el
      // botón de revisar caían en un lugar distinto en cada fila según el largo del
      // nombre, y no se podían comparar de un vistazo.
      await conPagos();

      const cabecera = elemento().textContent ?? '';
      expect(cabecera).toContain('Jugador');
      expect(cabecera).toContain('Siembra');
    });

    it('**confirmar y rechazar están juntos**, no separados por el motivo', async () => {
      await conPagos();
      await apretar('Revisar');

      const botones = Array.from(elemento().querySelectorAll('button'));
      const confirmar = botones.find((b) => b.textContent?.includes('Confirmar'))!;
      const rechazar = botones.find((b) => b.textContent?.includes('Rechazar'))!;

      expect(confirmar.parentElement).toBe(rechazar.parentElement);
    });

    it('**el teléfono está donde se necesita: al lado del comprobante**', async () => {
      await conPagos();

      await apretar('Revisar');

      expect(texto()).toContain('56987654321');
    });
  });
});
