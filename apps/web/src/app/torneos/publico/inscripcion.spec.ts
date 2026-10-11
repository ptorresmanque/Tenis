import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Auth, UsuarioActual } from '../../core/auth/auth';
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
  /** La sesión, como la tiene `Auth`: nula hasta que el servidor responde quién mira. */
  let sesion: WritableSignal<UsuarioActual | null>;
  let api: {
    inscribirseEnTorneo: ReturnType<typeof vi.fn>;
    inscribirseComoSocio: ReturnType<typeof vi.fn>;
    pagarInscripcion: ReturnType<typeof vi.fn>;
  };

  const montar = async (usuario: UsuarioActual | null = null) => {
    sesion = signal(usuario);
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
      inscribirseComoSocio: vi.fn().mockResolvedValue({
        id: 3,
        estado: 'INSCRITA',
        estadoPago: 'PENDIENTE',
        token: 'llave-socio',
        montoClp: 15_000,
        categoria: 'Honor',
        jugador: 'Javiera Socia',
      }),
      pagarInscripcion: vi.fn().mockResolvedValue({
        montoClp: 15_000,
        urlRedireccion: 'https://webpay/x',
        tokenPasarela: 'e1a2b3',
      }),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Torneos, useValue: api },
        { provide: Auth, useValue: { usuario: sesion } },
      ],
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

  it('**un correo mal escrito no se manda**: ahí le llega la confirmación (T128)', async () => {
    await escribir({ ...completo, email: 'rodrigo@' });
    await enviar();

    expect(api.inscribirseEnTorneo).not.toHaveBeenCalled();
    expect(texto()).toContain('Revisa tu correo');
  });

  describe('con la sesión de quien no es socio (T128, punto 6)', () => {
    const CUENTA: UsuarioActual = {
      id: 9,
      nombre: 'Camila',
      apellido: 'Reyes',
      email: 'camila@ejemplo.cl',
      telefono: '56955556666',
      esAdmin: false,
      socioId: null,
      socioActivo: false,
      socioAlDia: false,
      profesorId: null,
    };

    const valor = (name: string) =>
      elemento().querySelector<HTMLInputElement>(`[name="${name}"]`)!.value;

    /** La sesión cambia después de montar, como cuando `/api/yo` responde tarde. */
    const llegaLaSesion = async (usuario: UsuarioActual | null) => {
      sesion.set(usuario);
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
    };

    it('sin sesión, el formulario llega vacío, como siempre', () => {
      expect(valor('nombre')).toBe('');
      expect(valor('email')).toBe('');
      expect(texto()).not.toContain('datos de tu cuenta');
    });

    it('**llega con los datos de su cuenta**, y dice que se pueden cambiar', async () => {
      await montar(CUENTA);
      await fixture.whenStable();

      expect(valor('nombre')).toBe('Camila');
      expect(valor('apellido')).toBe('Reyes');
      // El campo muestra los 9 dígitos; el +56 va fijo al lado (T121).
      expect(valor('telefono')).toBe('955556666');
      expect(valor('email')).toBe('camila@ejemplo.cl');
      expect(texto()).toContain('datos de tu cuenta');
    });

    it('**se pueden cambiar**: un padre inscribe a su hijo con su propia sesión', async () => {
      await montar(CUENTA);
      await escribir({ nombre: 'Tomás', categoria: '20' });
      await enviar();

      expect(api.inscribirseEnTorneo).toHaveBeenCalledWith(
        5,
        expect.objectContaining({
          nombre: 'Tomás',
          apellido: 'Reyes',
          telefono: '56955556666',
          email: 'camila@ejemplo.cl',
        }),
        undefined,
      );
    });

    it('si la sesión llega después, igual se precarga', async () => {
      await llegaLaSesion(CUENTA);

      expect(valor('nombre')).toBe('Camila');
    });

    it('**no pisa lo que la persona ya escribió**', async () => {
      await escribir({ nombre: 'Tomás' });
      await llegaLaSesion(CUENTA);

      expect(valor('nombre')).toBe('Tomás');
      expect(valor('apellido')).toBe('Reyes');
    });

    it('quien entró con Google no tiene teléfono: ese campo queda para escribirlo', async () => {
      await montar({ ...CUENTA, telefono: null });
      await fixture.whenStable();

      expect(valor('telefono')).toBe('');
      expect(valor('email')).toBe('camila@ejemplo.cl');
    });

    it('inscribirse lo deja vacío y sin el aviso: el siguiente puede ser otra persona', async () => {
      await montar(CUENTA);
      await escribir({ categoria: '20' });
      await enviar();

      expect(valor('nombre')).toBe('');
      expect(texto()).not.toContain('datos de tu cuenta');
    });

    it('**al socio no se le precarga**: su camino es "Inscribirse como socio" (T129)', async () => {
      await montar({ ...CUENTA, socioId: 3, socioActivo: true, socioAlDia: true });
      await fixture.whenStable();

      expect(valor('nombre')).toBe('');
    });
  });

  describe('inscribirse como socio (T129, punto 5)', () => {
    const SOCIA: UsuarioActual = {
      id: 4,
      nombre: 'Javiera',
      apellido: 'Socia',
      email: 'javiera@ejemplo.cl',
      telefono: '56944443333',
      esAdmin: false,
      socioId: 12,
      socioActivo: true,
      socioAlDia: true,
      profesorId: null,
    };

    const boton = (etiqueta: string) =>
      Array.from(elemento().querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === etiqueta,
      );

    const comoSocio = async () => {
      await montar(SOCIA);
      boton('Inscribirse como socio')!.click();
      await fixture.whenStable();
      fixture.detectChanges();
    };

    it('sin sesión, o sin ficha de socio, no se ofrece', async () => {
      expect(boton('Inscribirse como socio')).toBeUndefined();

      await montar({ ...SOCIA, socioId: null });
      expect(boton('Inscribirse como socio')).toBeUndefined();
    });

    it('**se salta los datos**: quedan la categoría, los horarios y el pago', async () => {
      await comoSocio();

      for (const name of ['nombre', 'apellido', 'telefono', 'email', 'procedencia']) {
        expect(elemento().querySelector(`[name="${name}"]`)).toBeNull();
      }
      expect(elemento().querySelector('[name="categoria"]')).not.toBeNull();
      expect(texto()).toContain('horarios en que no puedas jugar');
    });

    it('manda solo la categoría, el pago y los horarios, al camino del socio', async () => {
      await comoSocio();
      await escribir({ categoria: '20' });
      await enviar();

      expect(api.inscribirseEnTorneo).not.toHaveBeenCalled();
      expect(api.inscribirseComoSocio).toHaveBeenCalledWith(
        5,
        { categoriaJuegoId: 20, medioPago: '', restricciones: [] },
        undefined,
      );
    });

    it('**paga igual**: con transferencia, el comprobante viaja en el mismo envío', async () => {
      await comoSocio();
      await escribir({ categoria: '60' });
      await elegirMedio('TRANSFERENCIA');
      const archivo = await adjuntar();
      await enviar();

      expect(api.inscribirseComoSocio).toHaveBeenCalledWith(
        5,
        expect.objectContaining({ categoriaJuegoId: 60, medioPago: 'TRANSFERENCIA' }),
        archivo,
      );
    });

    it('"Inscribir a otra persona" vuelve al formulario completo', async () => {
      await comoSocio();
      boton('Inscribir a otra persona')!.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(elemento().querySelector('[name="nombre"]')).not.toBeNull();
    });

    it('**el foco no se pierde**: el botón apretado desaparece, y el foco va a lo siguiente', async () => {
      // Sin esto cae al inicio de la página, y quien usa teclado o lector de pantalla
      // tiene que volver a buscar el formulario.
      await comoSocio();
      await fixture.whenStable();
      expect(document.activeElement?.getAttribute('name')).toBe('categoria');

      boton('Inscribir a otra persona')!.click();
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(document.activeElement?.getAttribute('name')).toBe('nombre');
    });
  });
});
