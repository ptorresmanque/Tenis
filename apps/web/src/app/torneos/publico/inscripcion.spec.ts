import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CategoriaPublica, Torneos } from '../torneos.service';
import { InscripcionATorneo } from './inscripcion';

/**
 * T64. El formulario con que alguien se inscribe sin tener cuenta.
 *
 * Lo que este archivo cuida: que **la pantalla no adivine lo que decide el servidor**
 * —quien queda en lista de espera tiene que enterarse ahora y no el día del torneo— y
 * que solo se ofrezcan las categorías que ese torneo corre.
 */
describe('InscripcionATorneo', () => {
  const CATEGORIAS: CategoriaPublica[] = [
    { id: 7, categoriaJuegoId: 20, categoria: '4ª', valor: 'Club 250', montoClp: 0, cupo: 4, cuposLibres: 2, armado: false },
    { id: 8, categoriaJuegoId: 60, categoria: 'Honor', valor: 'Club 250', montoClp: 15_000, cupo: 2, cuposLibres: 0, armado: false },
  ];

  let fixture: ComponentFixture<InscripcionATorneo>;
  let api: {
    inscribirseEnTorneo: ReturnType<typeof vi.fn>;
    pagarInscripcion: ReturnType<typeof vi.fn>;
  };

  const montar = async () => {
    api = {
      inscribirseEnTorneo: vi.fn().mockResolvedValue({
        id: 1,
        estado: 'INSCRITA',
        estadoPago: 'EXENTA',
        token: 'llave-1',
        montoClp: 0,
        categoria: '4ª',
        jugador: 'Rodrigo Soto',
      }),
      pagarInscripcion: vi.fn().mockResolvedValue({
        montoClp: 15_000,
        urlRedireccion: 'https://webpay/x',
        tokenPasarela: 'e1a2b3',
      }),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Torneos, useValue: api }],
    });

    fixture = TestBed.createComponent(InscripcionATorneo);
    fixture.componentRef.setInput('torneoId', 5);
    fixture.componentRef.setInput('categorias', CATEGORIAS);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const texto = () => elemento().textContent ?? '';

  const escribir = async (campos: Record<string, string>) => {
    for (const [name, valor] of Object.entries(campos)) {
      const control = elemento().querySelector<HTMLInputElement>(
        `[name="${name}"]`,
      )!;
      control.value = valor;
      control.dispatchEvent(new Event('input'));
      control.dispatchEvent(new Event('change'));
    }
    await fixture.whenStable();
    fixture.detectChanges();
  };

  /** Marca uno de los dos medios de pago. Solo existe si la categoría cobra. */
  const elegirMedio = async (valor: string) => {
    elemento()
      .querySelector<HTMLInputElement>(
        `input[name="medioPago"][value="${valor}"]`,
      )!
      .click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  /** Adjunta el comprobante. `DataTransfer` no existe en jsdom, así que se inyecta. */
  const adjuntar = async () => {
    const campo = elemento().querySelector<HTMLInputElement>(
      'input[type="file"]',
    )!;
    const archivo = new File(['una imagen'], 'transferencia.jpg', {
      type: 'image/jpeg',
    });
    Object.defineProperty(campo, 'files', { value: [archivo] });
    campo.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    return archivo;
  };

  const enviar = async () => {
    elemento().querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const completo = {
    nombre: 'Rodrigo',
    apellido: 'Soto',
    telefono: '+56 9 8765 4321',
    procedencia: 'Club de Ñuñoa',
    email: 'rodrigo@ejemplo.cl',
    categoria: '20',
  };

  beforeEach(async () => {
    // jsdom no navega, y a Webpay se sale por POST: ver `core/pagos/ir-a-pagar.ts`.
    HTMLFormElement.prototype.submit = vi.fn();
    await montar();
  });

  it('**solo ofrece las categorías que ese torneo corre**', () => {
    const opciones = Array.from(
      elemento().querySelectorAll('select option'),
    ).map((o) => o.textContent?.trim() ?? '');

    expect(opciones.some((o) => o.startsWith('4ª'))).toBe(true);
    expect(opciones.some((o) => o.startsWith('Honor'))).toBe(true);
    expect(opciones.some((o) => o.startsWith('5ª'))).toBe(false);
  });

  it('avisa cuáles ya no tienen cupo, antes de que la persona elija', () => {
    expect(texto()).toContain('sin cupos, quedarías en lista de espera');
  });

  it('**pide el correo y dice para qué**: ahí le llegan la confirmación y sus partidos (T127)', () => {
    const correo = elemento().querySelector<HTMLInputElement>('input[name="email"]');

    expect(correo?.type).toBe('email');
    expect(correo?.autocomplete).toBe('email');
    expect(texto()).toContain('Te escribimos a este correo');
  });

  it('**dice que el teléfono no se publica**, porque es lo que la gente duda', () => {
    expect(texto()).toContain('no se publica');
  });

  it('**avisa qué se publica antes de inscribirse**, porque inscribirse es consentirlo', () => {
    // Decidido por el club el 2026-10-07: quien juega acepta que se publiquen su
    // nombre, sus resultados, las fotos y las transmisiones. Eso vale solo si se
    // lo dijeron antes de apretar el botón.
    expect(texto()).toMatch(/se publican tu nombre, tus resultados, las fotos y las transmisiones/i);
    // En otra pestaña: en esta, se perdería lo que la persona ya escribió.
    expect(elemento().querySelector('form a[href="/privacidad"]')?.getAttribute('target')).toBe('_blank');
  });

  it('manda los datos con los espacios recortados', async () => {
    await escribir({ ...completo, nombre: '  Rodrigo  ', email: ' rodrigo@ejemplo.cl ' });
    await enviar();

    expect(api.inscribirseEnTorneo).toHaveBeenCalledWith(
      5,
      {
        nombre: 'Rodrigo',
        apellido: 'Soto',
        // Lo que escribió, en la forma que guarda la API (T121).
        telefono: '56987654321',
        procedencia: 'Club de Ñuñoa',
        email: 'rodrigo@ejemplo.cl',
        categoriaJuegoId: 20,
        // La 4ª es gratis en este torneo: no hay medio de pago que elegir.
        medioPago: '',
        // Sin franjas: casi nadie tiene restricciones, y vacío es una respuesta válida.
        restricciones: [],
      },
      undefined,
    );
  });

  it('sin categoría elegida no llama al servidor', async () => {
    await escribir({ ...completo, categoria: '0' });
    await enviar();

    expect(api.inscribirseEnTorneo).not.toHaveBeenCalled();
    expect(texto()).toContain('Elige la categoría');
  });

  it('**la lista de espera se dice, no se esconde**', async () => {
    // Es la respuesta que la pantalla no puede adivinar: el cupo lo decide el servidor
    // en el momento, y quien quedó fuera tiene que saberlo antes de irse.
    api.inscribirseEnTorneo.mockResolvedValueOnce({
      id: 2,
      estado: 'LISTA_ESPERA',
      categoria: 'Honor',
      jugador: 'Rodrigo Soto',
    });

    await escribir({ ...completo, categoria: '60' });
    await elegirMedio('WEBPAY');
    await enviar();

    expect(texto()).toContain('lista de espera');
  });

  describe('el pago va en el mismo envío', () => {
    it('**una categoría con costo no se manda sin elegir cómo se paga**', async () => {
      // Era el agujero que encontró el club: la inscripción se creaba igual y el pago
      // quedaba en un panel que se podía cerrar.
      await escribir({ ...completo, categoria: '60' });
      await enviar();

      expect(api.inscribirseEnTorneo).not.toHaveBeenCalled();
      expect(texto()).toContain('cómo vas a pagar');
    });

    it('**transferir sin adjuntar el comprobante no manda nada**', async () => {
      await escribir({ ...completo, categoria: '60' });
      await elegirMedio('TRANSFERENCIA');
      await enviar();

      expect(api.inscribirseEnTorneo).not.toHaveBeenCalled();
      expect(texto()).toContain('comprobante');
    });

    it('la imagen de la transferencia viaja con el formulario', async () => {
      await escribir({ ...completo, categoria: '60' });
      await elegirMedio('TRANSFERENCIA');
      const archivo = await adjuntar();
      await enviar();

      expect(api.inscribirseEnTorneo).toHaveBeenCalledWith(
        5,
        expect.objectContaining({ medioPago: 'TRANSFERENCIA' }),
        archivo,
      );
    });

    it('**con Webpay se sale a la pasarela sin apretar otro botón**', async () => {
      api.inscribirseEnTorneo.mockResolvedValueOnce({
        id: 2,
        estado: 'INSCRITA',
        estadoPago: 'PENDIENTE',
        token: 'llave-2',
        montoClp: 15_000,
        categoria: 'Honor',
        jugador: 'Rodrigo Soto',
      });

      await escribir({ ...completo, categoria: '60' });
      await elegirMedio('WEBPAY');
      await enviar();

      expect(api.pagarInscripcion).toHaveBeenCalledWith('llave-2');
      // Por POST y no por `location.href`: con un GET a esa URL, Webpay deja a la
      // persona en una página en blanco con su cupo tomado.
      expect(document.body.querySelector('form[action="https://webpay/x"]')).not
        .toBeNull();
    });

    it('el selector dice cuánto cuesta cada categoría', async () => {
      expect(texto()).toContain('$15.000');
      expect(texto()).toContain('gratis');
    });
  });

  it('el mensaje del servidor se muestra tal cual cuando rechaza', async () => {
    api.inscribirseEnTorneo.mockRejectedValueOnce({
      error: { message: 'La inscripción de ese torneo ya se cerró.' },
    });

    await escribir(completo);
    await enviar();

    expect(texto()).toContain('ya se cerró');
  });

  it('inscribirse limpia el formulario, para que nadie lo mande dos veces', async () => {
    await escribir(completo);
    await enviar();

    const nombre = elemento().querySelector<HTMLInputElement>('[name="nombre"]')!;
    expect(nombre.value).toBe('');
  });
});
