import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InscripcionTorneo, ListaDelTorneo, Torneos } from '../torneos.service';
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
    siembra: null,
    estado: 'INSCRITA',
    inscritaEn: '2026-11-01T12:00:00.000Z',
  };

  const ESPERANDO: InscripcionTorneo = {
    id: 12,
    jugadorId: 2,
    jugador: 'Tomás Invitado',
    numeroSocio: null,
    siembra: null,
    estado: 'LISTA_ESPERA',
    inscritaEn: '2026-11-02T12:00:00.000Z',
  };

  const LISTA: ListaDelTorneo = {
    torneoId: 5,
    cupo: 2,
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
  };

  const montar = async (lista: ListaDelTorneo) => {
    api = {
      inscripciones: vi.fn().mockResolvedValue(lista),
      jugadores: vi.fn().mockResolvedValue([
        { id: 1, nombre: 'Carolina', apellido: 'Díaz', activo: true },
        { id: 3, nombre: 'Matías', apellido: 'Rojas', activo: true },
      ]),
      inscribir: vi.fn().mockResolvedValue({ id: 13, estado: 'INSCRITA' }),
      retirar: vi.fn().mockResolvedValue({ id: 11 }),
      promover: vi.fn().mockResolvedValue({ id: 12 }),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: Torneos, useValue: api }],
    });

    fixture = TestBed.createComponent(InscritosDelTorneo);
    fixture.componentRef.setInput('torneoId', 5);
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
});
