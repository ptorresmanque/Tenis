import { BreakpointObserver } from '@angular/cdk/layout';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatStepperHarness, StepperOrientation } from '@angular/material/stepper/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';

import { Auth, UsuarioActual } from '../../core/auth/auth';
import { elegidoEn, elegir, opcionesDe, textosDe } from '../../testing/elegir';
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
    // Con 2 de 4 y 1 de 2 no llegan al 80 %: la API no dice cuántos quedan (T374).
    { id: 7, categoriaJuegoId: 20, categoria: '4ª', montoClp: 0, cupo: 4, cuposLibres: null, armado: false },
    { id: 8, categoriaJuegoId: 60, categoria: 'Honor', montoClp: 15_000, cupo: 2, cuposLibres: null, armado: false },
    // Cobra y está llena: quien la elige queda en la lista de espera, sin pagar (T328).
    { id: 9, categoriaJuegoId: 30, categoria: '3ª', montoClp: 12_000, cupo: 2, cuposLibres: 0, armado: false },
  ];

  let fixture: ComponentFixture<InscripcionATorneo>;
  /** `Router.navigate`, espiado: adónde termina la inscripción (T323). */
  let navegar: MockInstance<Router['navigate']>;
  /** La sesión, como la tiene `Auth`: nula hasta que el servidor responde quién mira. */
  let sesion: WritableSignal<UsuarioActual | null>;
  let api: {
    inscribirseEnTorneo: ReturnType<typeof vi.fn>;
    inscribirseComoSocio: ReturnType<typeof vi.fn>;
    pagarInscripcion: ReturnType<typeof vi.fn>;
    subirComprobante: ReturnType<typeof vi.fn>;
  };

  /** `enTelefono`: lo que responde la pantalla a `(max-width: 639px)`. jsdom no tiene matchMedia. */
  const montar = async (usuario: UsuarioActual | null = null, enTelefono = false) => {
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
      subirComprobante: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Torneos, useValue: api },
        { provide: Auth, useValue: { usuario: sesion } },
        {
          provide: BreakpointObserver,
          useValue: { observe: () => of({ matches: enTelefono, breakpoints: {} }) },
        },
      ],
    });

    navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
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
      // Las listas son de Material (T248): se abren y se elige, como una persona.
      if (elemento().querySelector(`mat-select[name="${name}"]`)) {
        await elegir(fixture, `mat-select[name="${name}"]`, valor);
        continue;
      }
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

  /** Como una persona (T317): «Siguiente» hasta el último paso, y ahí el envío. */
  const enviar = async () => {
    for (const siguiente of Array.from(
      elemento().querySelectorAll<HTMLButtonElement>('button[matStepperNext]'),
    )) {
      siguiente.click();
      await fixture.whenStable();
      fixture.detectChanges();
    }
    elemento().querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const pasos = () => TestbedHarnessEnvironment.loader(fixture).getHarness(MatStepperHarness);

  /** El nombre del paso en que está la inscripción. */
  const pasoActual = async () => {
    for (const paso of await (await pasos()).getSteps()) {
      if (await paso.isSelected()) return paso.getLabel();
    }
    return null;
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
    const opciones = textosDe(fixture, 'mat-select[name="categoria"]');

    expect(opciones.some((o) => o.startsWith('4ª'))).toBe(true);
    expect(opciones.some((o) => o.startsWith('Honor'))).toBe(true);
    expect(opciones.some((o) => o.startsWith('5ª'))).toBe(false);
  });

  it('avisa cuáles ya no tienen cupo, antes de que la persona elija', () => {
    // En la opción misma: se ve al abrir la lista, antes de elegir (T248).
    const opciones = textosDe(fixture, 'mat-select[name="categoria"]').join(' ');
    expect(opciones).toContain('sin cupos, quedarías en lista de espera');
  });

  it('**con el número oculto no la da por llena**: siempre quedan cupos (T374)', () => {
    const honor = textosDe(fixture, 'mat-select[name="categoria"]').find((o) =>
      o.startsWith('Honor'),
    );

    expect(honor).not.toContain('lista de espera');
  });

  it('**una categoría con el cuadro armado no se puede elegir**, y dice por qué (T378)', async () => {
    // El servidor la rechaza al enviar: ofrecerla era llenar el formulario para nada. Llena,
    // además decía «quedarías en lista de espera», y con el cuadro armado no hay lista.
    fixture.componentRef.setInput('categorias', [
      ...CATEGORIAS,
      { id: 10, categoriaJuegoId: 40, categoria: '2ª', montoClp: 0, cupo: 8, cuposLibres: 0, armado: true },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();

    const segunda = opcionesDe(fixture, 'mat-select[name="categoria"]').find((o) =>
      o.texto.startsWith('2ª'),
    );

    expect(segunda?.deshabilitada).toBe(true);
    expect(segunda?.texto).toContain('cuadro armado, inscripción cerrada');
    expect(segunda?.texto).not.toContain('lista de espera');
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
    // El paso de la categoría no deja seguir sin ella (T317), y lo dice en el campo.
    const sinCategoria = Object.entries(completo).filter(([nombre]) => nombre !== 'categoria');
    await escribir(Object.fromEntries(sinCategoria));
    await enviar();

    expect(api.inscribirseEnTorneo).not.toHaveBeenCalled();
    expect(texto()).toContain('Elige la categoría');
  });

  /** Adónde termina la inscripción que no pasa por Webpay: Torneos, con su aviso a la vista. */
  const alTerminar = (pago: string) =>
    expect(navegar).toHaveBeenCalledWith(['/torneos'], { queryParams: { pago }, replaceUrl: true });

  it('**una categoría gratis termina en Torneos con su aviso, como Webpay** (T323)', async () => {
    // Antes era un snackbar que se iba solo y el formulario vacío otra vez: con Webpay se
    // terminaba en Torneos, con el aviso arriba.
    await escribir(completo);
    await enviar();

    alTerminar('inscrito');
  });

  it('**la lista de espera se dice, no se esconde**: también en Torneos (T323)', async () => {
    // Es la respuesta que la pantalla no puede adivinar: el cupo lo decide el servidor en el
    // momento, y quien quedó fuera tiene que saberlo antes de irse. Su aviso estaba en el
    // último paso, y el formulario volvía al primero: no se veía.
    api.inscribirseEnTorneo.mockResolvedValueOnce({
      id: 2,
      estado: 'LISTA_ESPERA',
      estadoPago: 'EXENTA',
      token: 'llave-2',
      montoClp: 0,
      categoria: '4ª',
      jugador: 'Rodrigo Soto',
    });

    await escribir(completo);
    await enviar();

    alTerminar('espera');
  });

  describe('con la categoría llena no se paga (T328, SPEC-torneos.md § Lista de espera sin cobro)', () => {
    const enEspera = {
      id: 4,
      estado: 'LISTA_ESPERA',
      estadoPago: 'PENDIENTE',
      token: 'llave-4',
      montoClp: 12_000,
      categoria: '3ª',
      jugador: 'Rodrigo Soto',
    };

    it('**el paso Pago no pregunta cómo se paga**: dice que queda en espera, sin pagar', async () => {
      await escribir({ ...completo, categoria: '30' });

      expect(elemento().querySelector('input[name="medioPago"]')).toBeNull();
      expect(texto()).toContain('quedas en la lista de espera, sin pagar nada');
      expect(texto()).toContain('te avisamos por correo');
    });

    it('**se manda sin medio de pago** y termina en Torneos con el aviso de la espera', async () => {
      api.inscribirseEnTorneo.mockResolvedValueOnce(enEspera);

      await escribir({ ...completo, categoria: '30' });
      await enviar();

      expect(api.inscribirseEnTorneo).toHaveBeenCalledWith(
        5,
        expect.objectContaining({ categoriaJuegoId: 30, medioPago: '' }),
        undefined,
      );
      alTerminar('espera');
    });

    it('**si el servidor la deja en espera, no sale a Webpay** aunque se haya elegido', async () => {
      // El formulario vio lugar y alguien llegó antes: en espera no se cobra.
      api.inscribirseEnTorneo.mockResolvedValueOnce({ ...enEspera, montoClp: 15_000, categoria: 'Honor' });

      await escribir({ ...completo, categoria: '60' });
      await elegirMedio('WEBPAY');
      await enviar();

      expect(api.pagarInscripcion).not.toHaveBeenCalled();
      alTerminar('espera');
    });
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

    it('**con transferencia termina en Torneos, como con Webpay**, y dice que el club revisa (T323)', async () => {
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
      await elegirMedio('TRANSFERENCIA');
      await adjuntar();
      await enviar();

      alTerminar('comprobante');
      expect(api.pagarInscripcion).not.toHaveBeenCalled();
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
      // A Torneos lo trae la vuelta de Webpay, con su propio aviso.
      expect(navegar).not.toHaveBeenCalled();
    });

    it('**si Webpay no responde y se adjunta la transferencia, termina igual** (T323)', async () => {
      // El panel «Falta pagar la inscripción» es lo que queda si la pasarela no contesta. Su
      // comprobante terminaba con un aviso en la página, distinto de los demás finales.
      api.inscribirseEnTorneo.mockResolvedValueOnce({
        id: 2,
        estado: 'INSCRITA',
        estadoPago: 'PENDIENTE',
        token: 'llave-2',
        montoClp: 15_000,
        categoria: 'Honor',
        jugador: 'Rodrigo Soto',
      });
      api.pagarInscripcion.mockRejectedValueOnce(new Error('Webpay no respondió'));

      await escribir({ ...completo, categoria: '60' });
      await elegirMedio('WEBPAY');
      await enviar();
      expect(texto()).toContain('Falta pagar la inscripción');

      await adjuntar();

      expect(api.subirComprobante).toHaveBeenCalledWith('llave-2', expect.any(File));
      alTerminar('comprobante');
    });

    it('el selector dice cuánto cuesta cada categoría', async () => {
      const opciones = textosDe(fixture, 'mat-select[name="categoria"]').join(' ');
      expect(opciones).toContain('$15.000');
      expect(opciones).toContain('gratis');
    });
  });

  it('**un rechazo del servidor se avisa a la página**, para que vuelva a leer los cupos (T328)', async () => {
    api.inscribirseEnTorneo.mockRejectedValueOnce({
      error: { message: 'Esta categoría tiene lugar: elige cómo vas a pagar la inscripción.' },
    });
    const rechazada = vi.fn();
    fixture.componentInstance.rechazada.subscribe(rechazada);

    await escribir(completo);
    await enviar();

    expect(rechazada).toHaveBeenCalledOnce();
  });

  it('**si tras un rechazo la elegida vuelve armada, se suelta**: ni lista de espera ni reenvío (T378)', async () => {
    // Eligió la 3ª, llena, y mientras llenaba el formulario el club armó el cuadro. El servidor
    // rechaza y la página recarga el calendario: la 3ª vuelve armada, y seguía elegida.
    api.inscribirseEnTorneo.mockRejectedValueOnce({
      error: { message: 'El cuadro de 3ª ya está armado.' },
    });
    await escribir({ ...completo, categoria: '30' });
    await enviar();

    fixture.componentRef.setInput(
      'categorias',
      CATEGORIAS.map((c) => (c.categoriaJuegoId === 30 ? { ...c, armado: true } : c)),
    );
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(elegidoEn(fixture, 'mat-select[name="categoria"]')).toBe('');
    expect(texto()).not.toContain('quedas en la lista de espera');
    // De vuelta en la categoría: ahí la 3ª se ve gris y dice por qué. El error del servidor se
    // va, para que no quede bajo «Inscribirme» si elige otra.
    expect(await pasoActual()).toBe('Categoría');
    expect(texto()).not.toContain('ya está armado');
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

  describe('los pasos (T317, SPEC-sitio.md D4 y A7)', () => {
    /** Los datos completos, sin elegir todavía la categoría: el primer paso listo. */
    const sinLaCategoria = () =>
      Object.fromEntries(Object.entries(completo).filter(([nombre]) => nombre !== 'categoria'));

    it('**son tres: Tus datos, Categoría y Pago**, y empieza en el primero', async () => {
      const etiquetas = await Promise.all(
        (await (await pasos()).getSteps()).map((paso) => paso.getLabel()),
      );

      expect(etiquetas).toEqual(['Tus datos', 'Categoría', 'Pago']);
      expect(await pasoActual()).toBe('Tus datos');
    });

    it('**un paso incompleto no deja avanzar, y dice qué falta**', async () => {
      await escribir({ nombre: 'Rodrigo' });
      elemento().querySelector<HTMLButtonElement>('button[matStepperNext]')!.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(await pasoActual()).toBe('Tus datos');
      const errores = Array.from(elemento().querySelectorAll('mat-error')).map((e) =>
        e.textContent?.trim(),
      );
      expect(errores).toContain('Falta este dato.');
    });

    it('con los datos completos, «Siguiente» lleva a la categoría', async () => {
      await escribir(sinLaCategoria());
      elemento().querySelector<HTMLButtonElement>('button[matStepperNext]')!.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(await pasoActual()).toBe('Categoría');
    });

    it('**Enter en un campo sigue al paso siguiente**: no manda la inscripción a medias', async () => {
      await escribir(sinLaCategoria());
      elemento().querySelector('form')!.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(api.inscribirseEnTorneo).not.toHaveBeenCalled();
      expect(await pasoActual()).toBe('Categoría');
    });

    it('el pago resume a quién se inscribe y en qué', async () => {
      await escribir(completo);
      for (const siguiente of Array.from(
        elemento().querySelectorAll<HTMLButtonElement>('button[matStepperNext]'),
      )) {
        siguiente.click();
        await fixture.whenStable();
        fixture.detectChanges();
      }

      expect(await pasoActual()).toBe('Pago');
      expect(texto()).toContain('Inscribes a Rodrigo Soto en 4ª, gratis.');
    });

    it('**en el teléfono los pasos van uno bajo el otro**', async () => {
      await montar(null, true);

      expect(await (await pasos()).getOrientation()).toBe(StepperOrientation.VERTICAL);
    });

    it('en el computador, en fila', async () => {
      expect(await (await pasos()).getOrientation()).toBe(StepperOrientation.HORIZONTAL);
    });
  });

  describe('con la sesión de quien no es socio (T128, punto 6)', () => {
    const CUENTA: UsuarioActual = {
      id: 9,
      nombre: 'Camila',
      apellido: 'Reyes',
      email: 'camila@ejemplo.cl',
      telefono: '56955556666',
      esAdmin: false,
      esGestor: false,
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
      // De dónde viene no está en la cuenta, y la API lo exige: se escribe.
      await escribir({ nombre: 'Tomás', procedencia: 'Club de Ñuñoa', categoria: '20' });
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
      await escribir({ procedencia: 'Club de Ñuñoa', categoria: '20' });
      await enviar();

      expect(api.inscribirseEnTorneo).toHaveBeenCalled();
      expect(valor('nombre')).toBe('');
      expect(texto()).not.toContain('datos de tu cuenta');
    });

    it('**al socio no se le precarga**: su camino es "Inscribirse como socio" (T129)', async () => {
      await montar({ ...CUENTA, socioId: 3, socioActivo: true, socioAlDia: true });
      await fixture.whenStable();
      // Llega inscribiéndose como socio (T317): los datos de otra persona, si los pide, vacíos.
      Array.from(elemento().querySelectorAll('button'))
        .find((b) => b.textContent?.trim() === 'Inscribir a otra persona')!
        .click();
      await fixture.whenStable();
      fixture.detectChanges();

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
      esGestor: false,
      socioId: 12,
      socioActivo: true,
      socioAlDia: true,
      profesorId: null,
    };

    const boton = (etiqueta: string) =>
      Array.from(elemento().querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === etiqueta,
      );

    /** El socio con sesión llega inscribiéndose como socio, en Categoría (T317, A7). */
    const comoSocio = async () => {
      await montar(SOCIA);
      await fixture.whenStable();
      fixture.detectChanges();
    };

    const apretar = async (etiqueta: string) => {
      boton(etiqueta)!.click();
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
    };

    it('**empieza en Categoría**: sus datos ya los tiene el club (T317, A7)', async () => {
      await comoSocio();

      expect(await pasoActual()).toBe('Categoría');
    });

    it('sin sesión, o sin ficha de socio, no se ofrece', async () => {
      expect(boton('Inscribirse como socio')).toBeUndefined();

      await montar({ ...SOCIA, socioId: null });
      expect(boton('Inscribirse como socio')).toBeUndefined();
    });

    it('**el lleno es avanzar y el envío** (T241, T317): los atajos del socio no', async () => {
      // Los dos llenos juntos se disputaban la atención; cambiar de camino no es la acción
      // principal. Desde T317 cada paso lleva el suyo, y se ve un paso a la vez.
      await montar(SOCIA);
      await apretar('Inscribir a otra persona');
      const botones = await TestbedHarnessEnvironment.loader(fixture).getAllHarnesses(
        MatButtonHarness.with({ appearance: 'filled' }),
      );

      expect(await Promise.all(botones.map((b) => b.getText()))).toEqual([
        'Siguiente',
        'Siguiente',
        'Inscribirme',
      ]);
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

    it('"Inscribir a otra persona" vuelve al formulario completo, en Tus datos', async () => {
      await comoSocio();
      await apretar('Inscribir a otra persona');

      expect(elemento().querySelector('[name="nombre"]')).not.toBeNull();
      expect(await pasoActual()).toBe('Tus datos');
    });

    it('**el foco no se pierde**: el botón apretado desaparece, y el foco va a lo siguiente', async () => {
      // Sin esto cae al inicio de la página, y quien usa teclado o lector de pantalla
      // tiene que volver a buscar el formulario.
      await comoSocio();
      await apretar('Inscribir a otra persona');
      expect(document.activeElement?.getAttribute('name')).toBe('nombre');

      await apretar('Inscribirse como socio');
      expect(document.activeElement?.getAttribute('name')).toBe('categoria');
      expect(await pasoActual()).toBe('Categoría');
    });
  });
});
