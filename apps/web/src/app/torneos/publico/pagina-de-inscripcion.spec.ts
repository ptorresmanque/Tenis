import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Torneos, TorneoPublico } from '../torneos.service';
import { InscripcionATorneo } from './inscripcion';
import { PaginaDeInscripcion } from './pagina-de-inscripcion';
import { recordarPagoPendiente } from './pago-pendiente';

/**
 * T316 (SPEC-sitio.md D4 y A6). La inscripción a un torneo es su página, `/torneos/:id/inscripcion`:
 * el nombre del torneo, su afiche chico y el formulario. Antes se desplegaba dentro de la tarjeta,
 * con un botón que alternaba entre «Inscribirme» y «Cerrar la inscripción».
 */
describe('PaginaDeInscripcion', () => {
  const ABIERTO: TorneoPublico = {
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
    afiches: [
      {
        id: 9,
        partidoId: null,
        momento: 'ANTES',
        descripcion: 'El afiche de la copa',
        miniatura: '/api/torneos/fotos/9/miniatura',
        imagen: '/api/torneos/fotos/9/imagen',
      },
    ],
  };

  let fixture: ComponentFixture<PaginaDeInscripcion>;
  let api: { calendario: ReturnType<typeof vi.fn>; soltarInscripcion: ReturnType<typeof vi.fn> };

  const montar = async (torneos: TorneoPublico[] | Error, id = '5') => {
    api = {
      calendario: vi.fn(() =>
        torneos instanceof Error ? Promise.reject(torneos) : Promise.resolve(torneos),
      ),
      soltarInscripcion: vi.fn().mockResolvedValue({ soltada: true }),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Torneos, useValue: api }],
    });

    fixture = TestBed.createComponent(PaginaDeInscripcion);
    fixture.componentRef.setInput('id', id);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const texto = () => elemento().textContent ?? '';

  beforeEach(() => sessionStorage.clear());

  it('**nombra el torneo y trae su formulario de inscripción**', async () => {
    await montar([ABIERTO]);

    expect(elemento().querySelector('h1')?.textContent).toContain('Copa de verano');
    expect(texto()).toContain('Inscripción hasta el');
    expect(elemento().querySelector('app-inscripcion-a-torneo')).not.toBeNull();
  });

  it('**muestra el afiche chico, y tocarlo abre la galería**', async () => {
    await montar([ABIERTO]);

    const afiche = elemento().querySelector<HTMLButtonElement>('[data-afiche]');
    expect(afiche?.querySelector('img')?.getAttribute('src')).toBe('/api/torneos/fotos/9/miniatura');
    expect(afiche?.getAttribute('aria-label')).toBe('Ver el afiche de Copa de verano');
    expect(elemento().querySelector('app-galeria-de-fotos')).not.toBeNull();
  });

  it('sin fotos de antes no inventa un afiche', async () => {
    await montar([{ ...ABIERTO, afiches: [] }]);

    expect(elemento().querySelector('[data-afiche]')).toBeNull();
    expect(elemento().querySelector('app-inscripcion-a-torneo')).not.toBeNull();
  });

  it('**un torneo que ya no acepta inscripciones lo dice, y lleva de vuelta a Torneos**', async () => {
    await montar([{ ...ABIERTO, estado: 'EN_CURSO' }]);

    expect(texto()).toContain('ya no acepta inscripciones');
    expect(elemento().querySelector('app-inscripcion-a-torneo')).toBeNull();
    const volver = Array.from(elemento().querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Ver los torneos'),
    );
    expect(volver?.getAttribute('href')).toBe('/torneos');
  });

  it('**uno con la inscripción vencida, igual**: la API la rechazaría (T321)', async () => {
    await montar([{ ...ABIERTO, cierreInscripcion: '2020-01-01' }]);

    expect(texto()).toContain('ya no acepta inscripciones');
    expect(elemento().querySelector('app-inscripcion-a-torneo')).toBeNull();
  });

  it('un torneo que no está en el calendario, igual', async () => {
    await montar([ABIERTO], '99');

    expect(texto()).toContain('ya no acepta inscripciones');
    expect(elemento().querySelector('app-inscripcion-a-torneo')).toBeNull();
  });

  it('si el calendario no carga, lo dice', async () => {
    await montar(new Error('caído'));

    expect(texto()).toContain('No se pudo cargar el torneo');
  });

  it('**si el servidor rechaza la inscripción, vuelve a leer los cupos**, sin perder el formulario (T328)', async () => {
    // El formulario vio la categoría llena y alguien se retiró antes del envío: la API pide
    // elegir cómo pagar, y con los cupos viejos el formulario no lo preguntaría.
    await montar([ABIERTO]);
    const formulario = () => fixture.debugElement.query(By.directive(InscripcionATorneo));
    const antes = formulario().componentInstance as InscripcionATorneo;

    antes.rechazada.emit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.calendario).toHaveBeenCalledTimes(2);
    expect(formulario().componentInstance).toBe(antes);
  });

  it('**volver atrás desde Webpay sin pagar suelta el cupo y lo dice**', async () => {
    // Es la página que manda a pagar, así que es a la que vuelve «atrás».
    recordarPagoPendiente('llave-1');
    await montar([ABIERTO]);

    expect(api.soltarInscripcion).toHaveBeenCalledWith('llave-1');
    expect(texto()).toContain('no quedó tomada');
    // Los cupos que muestra ya cuentan el que se soltó: la última lectura del calendario es
    // posterior, como en Torneos.
    const calendarios = api.calendario.mock.invocationCallOrder;
    expect(calendarios[calendarios.length - 1]).toBeGreaterThan(
      api.soltarInscripcion.mock.invocationCallOrder[0],
    );
  });
});
