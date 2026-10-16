import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SelectorDeDia } from '../../catalogo-canchas/grilla/selector-de-dia';
import { ClaseDelDia, Clases } from '../clases.service';
import { AgendaDeClases } from './agenda-clases';
import { darMotivo, textoDelDialogo } from '../../testing/dialogos';
import { avisoDeLoHecho } from '../../testing/snackbar';

/**
 * T46. Las clases del club, día por día: cada una con lo que hace falta para ubicarla, sus
 * inscritos y cómo cancelarla. Agendar es otra página desde T294 (`agendar-clase.spec.ts`).
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

  let fixture: ComponentFixture<AgendaDeClases>;
  let api: {
    delDia: ReturnType<typeof vi.fn>;
    cancelar: ReturnType<typeof vi.fn>;
    cancelarSerieDesde: ReturnType<typeof vi.fn>;
    ficha: ReturnType<typeof vi.fn>;
    socios: ReturnType<typeof vi.fn>;
  };

  const montar = async (clases: ClaseDelDia[], fecha?: string) => {
    api = {
      delDia: vi.fn().mockResolvedValue(clases),
      cancelar: vi.fn().mockResolvedValue({ id: 7 }),
      cancelarSerieDesde: vi.fn().mockResolvedValue({ canceladas: 5 }),
      // Los piden los inscritos de una clase, al abrir su panel (T293). Sin responder: las
      // pruebas que abren uno solo miran que se pidan.
      ficha: vi.fn(() => new Promise(() => undefined)),
      socios: vi.fn(() => new Promise(() => undefined)),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Clases, useValue: api }],
    });

    fixture = TestBed.createComponent(AgendaDeClases);
    // Lo que trae la URL en `?fecha=` (T294): el router se lo da como input.
    if (fecha) fixture.componentRef.setInput('fecha', fecha);
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

  it('**el día que se elige queda en la URL**, sin sumar pasos al historial (T294)', async () => {
    // Así «Atrás» desde la página de agendar vuelve a este día, y el enlace se puede compartir.
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const selector = fixture.debugElement.query(By.directive(SelectorDeDia));

    (selector.componentInstance as SelectorDeDia).fecha.set('2026-08-20');
    await fixture.whenStable();

    expect(navegar).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { fecha: '2026-08-20' }, replaceUrl: true }),
    );
  });

  it('**el día puede venir en la URL** (T294): así se vuelve a él después de agendar', async () => {
    await montar([CLASE], '2026-08-20');

    expect(api.delDia).toHaveBeenCalledWith('2026-08-20');
  });

  it('**«Agendar» es el único FAB, y lleva a su página con el día que se mira** (T294)', async () => {
    await montar([CLASE], '2026-08-20');
    const fabs = elemento().querySelectorAll<HTMLAnchorElement>('.mat-mdc-fab-base');

    expect(fabs.length).toBe(1);
    expect(fabs[0].textContent).toContain('Agendar');
    expect(fabs[0].getAttribute('href')).toBe('/administracion/clases/agendar?fecha=2026-08-20');
    // Agendar ya no está en esta página; el FAB deja espacio para no tapar la última clase.
    expect(elemento().querySelector('form')).toBeNull();
    expect(elemento().querySelector('app-nueva-serie')).toBeNull();
    expect(elemento().classList).toContain('pb-24');
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
      providers: [provideRouter([]), { provide: Clases, useValue: { delDia: caida } }],
    });

    fixture = TestBed.createComponent(AgendaDeClases);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(texto()).toContain('No se pudieron cargar las clases');
  });

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
});
