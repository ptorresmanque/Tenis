import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { TestBed } from '@angular/core/testing';
import { TestKey } from '@angular/cdk/testing';
import { MatAutocompleteHarness } from '@angular/material/autocomplete/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatChipGridHarness } from '@angular/material/chips/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Auth } from '../core/auth/auth';
import { BloqueDisponible, Cancha } from '../catalogo-canchas/disponibilidad';
import { Reservar } from './reservar';
import { mensajeDeRechazo, Reservas } from './reservas.service';

/**
 * T23. El formulario que comparten socio y visitante.
 *
 * Lo que se prueba acá es lo que cambia entre los dos —qué se declara y qué pasa al
 * enviar—, y sobre todo que el rechazo del servidor llegue a la pantalla: un socio
 * que se pasó del cupo tiene que leer cuál es el límite, no un error genérico.
 */
describe('Reservar', () => {
  const cancha: Cancha = {
    id: 1,
    nombre: 'Cancha 1',
    superficie: 'ARCILLA',
    techada: false,
    iluminacion: true,
  };

  const bloque: BloqueDisponible = {
    inicio: '2026-08-17T14:00:00.000Z',
    fin: '2026-08-17T15:00:00.000Z',
    canchaId: 1,
    montoClp: 12000,
    esPico: false,
    bloqueado: false,
    motivoBloqueo: null,
    reservado: false,
  };

  const usuario = signal<{
    socioId: number | null;
    nombre?: string;
    apellido?: string;
    email?: string;
    telefono?: string | null;
  } | null>(null);
  const reservas = {
    reservarComoSocio: vi.fn(),
    reservarComoNoSocio: vi.fn(),
    socios: vi.fn(),
    misInvitados: vi.fn(),
  };

  /** El de 1 hora y media: termina 90 minutos después de empezar. */
  const deHoraYMedia: BloqueDisponible = {
    ...bloque,
    fin: '2026-08-17T15:30:00.000Z',
    montoClp: 16000,
  };

  const montar = (elBloque: BloqueDisponible = bloque) => {
    const fixture = TestBed.createComponent(Reservar);
    fixture.componentRef.setInput('cancha', cancha);
    fixture.componentRef.setInput('bloque', elBloque);
    fixture.detectChanges();

    return fixture;
  };

  /**
   * La reserva es un MatDialog (T252): su contenido está en el contenedor de overlays y no en
   * el componente.
   */
  const contenido = () => document.querySelector('mat-dialog-container') as HTMLElement;

  const texto = () => contenido()?.textContent ?? '';

  /** Escribe en el campo de con quién juega y aprieta "Agregar". */
  const agregar = async (fixture: ReturnType<typeof montar>, nombre: string) => {
    const elemento = contenido();
    const campo = elemento.querySelector<HTMLInputElement>('#acompanante')!;
    campo.value = nombre;
    campo.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    [...elemento.querySelectorAll('button')]
      .find((boton) => boton.textContent?.trim() === 'Agregar')!
      .click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const enviar = async (fixture: ReturnType<typeof montar>) => {
    contenido()
      .querySelector('form')!
      .dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  /** Lo que ofrece el autocompletar (T280): se abre con el foco, como lo abre la persona. */
  const sugerencias = async (fixture: ReturnType<typeof montar>) => {
    const auto = await TestbedHarnessEnvironment.documentRootLoader(fixture).getHarness(
      MatAutocompleteHarness,
    );
    await auto.focus();
    return Promise.all((await auto.getOptions()).map((opcion) => opcion.getText()));
  };

  /** Los chips de los que ya se agregaron, en orden. */
  const chips = async (fixture: ReturnType<typeof montar>) => {
    const grilla = await TestbedHarnessEnvironment.documentRootLoader(fixture).getHarness(
      MatChipGridHarness,
    );
    return grilla.getRows();
  };

  beforeEach(() => {
    usuario.set(null);
    reservas.reservarComoSocio.mockReset();
    reservas.reservarComoNoSocio.mockReset();
    reservas.socios.mockReset();
    reservas.socios.mockResolvedValue([
      { numeroSocio: '008', nombre: 'Ana Fuentes' },
      { numeroSocio: '012', nombre: 'Bruno Salas' },
    ]);
    reservas.misInvitados.mockReset();
    reservas.misInvitados.mockResolvedValue(['Juan Pérez']);

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: Auth, useValue: { usuario } },
        { provide: Reservas, useValue: reservas },
      ],
    });
  });

  it('al visitante le pide sus datos y le muestra el precio', () => {
    montar();

    expect(texto()).toContain('Reservar y pagar');
    expect(texto()).toContain('$12.000');
    expect(texto()).toContain('Correo');
  });

  it('"Ir a pagar" es la acción llena del diálogo, y "Cancelar" va en texto', async () => {
    // TV5.2: eran botones hechos a mano de 40px, bajo el mínimo táctil, e "Ir a
    // pagar" era el único verde del sitio. Pasa a primario (decisión 6 del plan):
    // el verde quedó para "libre". Desde T241 son `matButton`.
    const fixture = montar();
    // Desde la raíz del documento: el diálogo de Material no cuelga del componente (T252).
    const raiz = TestbedHarnessEnvironment.documentRootLoader(fixture);
    const pagar = await raiz.getHarness(MatButtonHarness.with({ text: /Ir a pagar/ }));
    const cancelar = await raiz.getHarness(MatButtonHarness.with({ text: 'Cancelar' }));

    expect(await pagar.getAppearance()).toBe('filled');
    expect(await (await pagar.host()).hasClass('bg-accent-strong')).toBe(false);
    expect(await cancelar.getAppearance()).toBe('text');
  });

  it('al socio le pide con quién juega, y no le muestra precio', () => {
    usuario.set({ socioId: 4 });
    montar();

    // El socio no paga: mostrarle un monto lo haría dudar de si le van a cobrar.
    expect(texto()).toContain('¿Con quién vas a jugar?');
    expect(texto()).not.toContain('$12.000');
  });

  it('al socio le dice que una reserva con invitados gasta un cupo, traiga uno o tres (T105)', () => {
    usuario.set({ socioId: 4 });
    montar();

    expect(texto()).toContain('una de tus reservas con invitados del mes');
    expect(texto()).toContain('traiga uno o tres');
  });

  /**
   * T107. Un solo campo, con sugerencias: los socios del club y los invitados anteriores
   * del socio (T106), marcados como tales. Lo que no está en ninguna lista queda como
   * invitado nuevo. Antes eran un selector de tipo y dos campos distintos.
   */
  describe('con quién juega el socio (T107)', () => {
    const montarSocio = async () => {
      usuario.set({ socioId: 4 });
      reservas.reservarComoSocio.mockResolvedValue({ folio: 'F', token: 't' });
      const fixture = montar();
      await fixture.whenStable();
      fixture.detectChanges();
      return fixture;
    };

    it('el campo sugiere los socios del club con su número y sus invitados anteriores', async () => {
      // El número va en la sugerencia: dos socios pueden llamarse igual, y tecleado a mano
      // el error aparecía recién al enviar.
      const fixture = await montarSocio();

      expect(await sugerencias(fixture)).toEqual([
        'Ana Fuentes · N.º 008 · Socio del club',
        'Bruno Salas · N.º 012 · Socio del club',
        'Juan Pérez · Invitado anterior',
      ]);
    });

    it('**las sugerencias se filtran por lo escrito, sin mirar tildes ni mayúsculas** (T280)', async () => {
      // El datalist filtraba solo; el autocompletar de Material filtra lo que se le da.
      const fixture = await montarSocio();
      const auto = await TestbedHarnessEnvironment.documentRootLoader(fixture).getHarness(
        MatAutocompleteHarness,
      );

      await auto.enterText('perez');

      expect(
        await Promise.all((await auto.getOptions()).map((opcion) => opcion.getText())),
      ).toEqual(['Juan Pérez · Invitado anterior']);
    });

    it('**elegir una sugerencia la agrega como chip y deja el campo vacío** (T280)', async () => {
      const fixture = await montarSocio();
      const auto = await TestbedHarnessEnvironment.documentRootLoader(fixture).getHarness(
        MatAutocompleteHarness,
      );

      await auto.enterText('ana');
      await auto.selectOption({ text: /Ana Fuentes/ });
      fixture.detectChanges();

      const [chip] = await chips(fixture);
      expect(await chip.getText()).toContain('Ana Fuentes · socio N.º 008');
      expect(await auto.getValue()).toBe('');
    });

    it('**Enter con una sugerencia marcada agrega esa, no lo que se alcanzó a escribir** (T280)', async () => {
      // El campo de chips también agrega con Enter: sin cuidarlo, «ana» entraba como
      // invitada además de la socia elegida.
      const fixture = await montarSocio();
      const auto = await TestbedHarnessEnvironment.documentRootLoader(fixture).getHarness(
        MatAutocompleteHarness,
      );
      await auto.enterText('ana');
      // El host del harness es el campo mismo.
      const entrada = await auto.host();

      await entrada.sendKeys(TestKey.DOWN_ARROW);
      await entrada.sendKeys(TestKey.ENTER);
      await enviar(fixture);

      expect(reservas.reservarComoSocio).toHaveBeenCalledWith(
        expect.objectContaining({ acompanantes: [{ numeroSocio: '008' }] }),
      );
    });

    it('**el chip se quita con su botón y con la tecla Borrar** (T280)', async () => {
      const fixture = await montarSocio();
      await agregar(fixture, 'Carla Nueva');
      await agregar(fixture, 'Juan Pérez');

      const [carla] = await chips(fixture);
      await (await carla.getRemoveButton()).click();
      fixture.detectChanges();
      expect(await Promise.all((await chips(fixture)).map((chip) => chip.getText()))).toEqual([
        expect.stringContaining('Juan Pérez · invitado'),
      ]);

      const [juan] = await chips(fixture);
      await juan.remove();
      fixture.detectChanges();
      expect(await chips(fixture)).toHaveLength(0);
    });

    it('**agrega un socio, un invitado anterior y uno nuevo, y no puede agregar un cuarto**', async () => {
      const fixture = await montarSocio();

      await agregar(fixture, 'Ana Fuentes · N.º 008');
      await agregar(fixture, 'Juan Pérez');
      await agregar(fixture, 'Carla Nueva');

      // El tercero cierra la lista: el campo se apaga y dice por qué.
      const elemento = contenido();
      expect(elemento.querySelector<HTMLInputElement>('#acompanante')!.disabled).toBe(true);
      expect(texto()).toContain('3 es el máximo por reserva');

      await enviar(fixture);

      expect(reservas.reservarComoSocio).toHaveBeenCalledWith(
        expect.objectContaining({
          acompanantes: [
            { numeroSocio: '008' },
            { nombre: 'Juan Pérez' },
            { nombre: 'Carla Nueva' },
          ],
        }),
      );
    });

    it('la lista dice quién es socio y quién invitado: así se ve cómo se leyó cada nombre', async () => {
      const fixture = await montarSocio();

      await agregar(fixture, 'Ana Fuentes · N.º 008');
      await agregar(fixture, 'Carla Nueva');

      expect(texto()).toContain('Ana Fuentes · socio N.º 008');
      expect(texto()).toContain('Carla Nueva · invitado');
    });

    it('un socio escrito a mano, sin elegirlo de la lista, entra como socio y no gasta cupo', async () => {
      // Como invitado le gastaría una reserva con invitados del mes por alguien que es
      // socio. Mayúsculas y tildes no importan, igual que en los invitados anteriores.
      const fixture = await montarSocio();

      await agregar(fixture, 'ana fuentes');
      await enviar(fixture);

      expect(reservas.reservarComoSocio).toHaveBeenCalledWith(
        expect.objectContaining({ acompanantes: [{ numeroSocio: '008' }] }),
      );
    });

    it('un socio ya agregado deja de sugerirse', async () => {
      const fixture = await montarSocio();

      await agregar(fixture, 'Ana Fuentes · N.º 008');
      await agregar(fixture, 'Juan Pérez');

      expect(await sugerencias(fixture)).toEqual(['Bruno Salas · N.º 012 · Socio del club']);
    });

    it('Enter en el campo agrega a la persona, no envía la reserva', async () => {
      const fixture = await montarSocio();
      const campo = contenido().querySelector<HTMLInputElement>(
        '#acompanante',
      )!;
      campo.value = 'Carla Nueva';
      campo.dispatchEvent(new Event('input'));
      // Con keyCode, como lo manda el navegador: el campo de chips lo mira para reconocer
      // Enter (T280). El preventDefault es lo que evita que el formulario se envíe.
      const enter = new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, cancelable: true });
      campo.dispatchEvent(enter);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(enter.defaultPrevented).toBe(true);
      expect(reservas.reservarComoSocio).not.toHaveBeenCalled();
      expect(texto()).toContain('Carla Nueva · invitado');
    });

    it('lo escrito sin apretar "Agregar" también cuenta al reservar', async () => {
      // "Agregar" es un paso que se salta fácil: sin esto, la reserva fallaba por no
      // declarar a nadie con el nombre escrito a la vista.
      const fixture = await montarSocio();
      const campo = contenido().querySelector<HTMLInputElement>(
        '#acompanante',
      )!;
      campo.value = 'Carla Nueva';
      campo.dispatchEvent(new Event('input'));

      await enviar(fixture);

      expect(reservas.reservarComoSocio).toHaveBeenCalledWith(
        expect.objectContaining({ acompanantes: [{ nombre: 'Carla Nueva' }] }),
      );
    });

    it('sin nadie declarado no llama a la API: lo dice antes', async () => {
      const fixture = await montarSocio();

      await enviar(fixture);

      expect(reservas.reservarComoSocio).not.toHaveBeenCalled();
      expect(texto()).toContain('al menos una persona');
    });

    it('si la lista de socios no carga, lo dice y deja reintentar', async () => {
      // Una consulta fallida no es un club sin socios: sin la lista, un socio escrito a
      // mano quedaría como invitado y gastaría cupo, y hay que decirlo.
      reservas.socios.mockRejectedValue(new Error('sin red'));
      const fixture = await montarSocio();

      expect(texto()).toContain('No pudimos cargar la lista de socios');
      expect(await sugerencias(fixture)).toEqual(['Juan Pérez · Invitado anterior']);

      // Y el reintento vuelve a preguntar: sin eso, el aviso es un callejón sin salida.
      reservas.socios.mockResolvedValue([{ numeroSocio: '008', nombre: 'Ana Fuentes' }]);
      Array.from(contenido().querySelectorAll('button'))
        .find((boton) => boton.textContent?.includes('Reintentar'))!
        .click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(await sugerencias(fixture)).toContain('Ana Fuentes · N.º 008 · Socio del club');
    });

    it('si sus invitados anteriores no cargan, el campo sigue sirviendo sin ellos', async () => {
      reservas.misInvitados.mockRejectedValue(new Error('sin red'));
      const fixture = await montarSocio();

      expect(await sugerencias(fixture)).toHaveLength(2);
      await agregar(fixture, 'Carla Nueva');
      expect(texto()).toContain('Carla Nueva · invitado');
    });
  });

  /** T107. El visitante escribe de 1 a 3 nombres: sin sugerencias, que serían el padrón. */
  describe('con quién juega el visitante (T107)', () => {
    const conDatos = () =>
      usuario.set({
        socioId: null,
        nombre: 'Patricio',
        apellido: 'Manquepillán',
        email: 'patricio@ejemplo.cl',
        telefono: '+56 9 1111 2222',
      });

    it('escribe los nombres sin sugerencias, y no se le piden socios ni invitados anteriores', async () => {
      conDatos();
      const fixture = montar();
      await fixture.whenStable();
      fixture.detectChanges();

      // Sin autocompletar: el campo no se anuncia como combobox ni abre lista alguna.
      const campo = contenido().querySelector('#acompanante');
      expect(campo).not.toBeNull();
      expect(campo?.getAttribute('role')).toBeNull();
      expect(reservas.socios).not.toHaveBeenCalled();
      expect(reservas.misInvitados).not.toHaveBeenCalled();
    });

    it('**no puede ir a pagar sin al menos un nombre**', async () => {
      conDatos();
      const fixture = montar();
      await fixture.whenStable();

      await enviar(fixture);

      expect(reservas.reservarComoNoSocio).not.toHaveBeenCalled();
      expect(texto()).toContain('al menos una persona');
    });

    it('manda los nombres que escribió', async () => {
      conDatos();
      // Rechazado a propósito: así no sale a la pasarela, que en jsdom no existe.
      reservas.reservarComoNoSocio.mockRejectedValue({
        status: 409,
        error: { motivo: 'BLOQUE_TOMADO', message: 'La tomaron.' },
      });
      const fixture = montar();
      await fixture.whenStable();

      await agregar(fixture, 'Beto Rival');
      await enviar(fixture);

      expect(reservas.reservarComoNoSocio).toHaveBeenCalledWith(
        expect.objectContaining({ acompanantes: [{ nombre: 'Beto Rival' }] }),
      );
    });
  });

  it('a quien ya entró no se le vuelven a pedir sus datos', async () => {
    // El caso del ingreso con Google: la cuenta ya sabe cómo se llama y cuál es su
    // correo. Volver a preguntarlo es hacerle teclear lo que el sistema tiene.
    usuario.set({
      socioId: null,
      nombre: 'Patricio',
      apellido: 'Manquepillán',
      email: 'patricio@ejemplo.cl',
      telefono: '+56 9 1111 2222',
    });

    const fixture = montar();
    await fixture.whenStable();
    fixture.detectChanges();

    const valor = (id: string) =>
      contenido().querySelector<HTMLInputElement>(
        `#${id}`,
      )!.value;

    expect(valor('nombre')).toBe('Patricio Manquepillán');
    expect(valor('email')).toBe('patricio@ejemplo.cl');
    // Los 9 dígitos: el +56 va fijo al lado del campo (T121).
    expect(valor('telefono')).toBe('911112222');
  });

  it('el visitante con datos incompletos no llega a la pasarela', async () => {
    const fixture = montar();

    contenido()
      .querySelector('form')!
      .dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(reservas.reservarComoNoSocio).not.toHaveBeenCalled();
    expect(texto()).toContain('Revisa tu nombre');
  });

  it('cerrar el diálogo avisa a la grilla para que lo desmonte', async () => {
    // Si el aviso no llega, el componente queda montado con el diálogo cerrado: la
    // pantalla se ve normal y el siguiente bloque que se elija no abre nada.
    const fixture = montar();
    let cerrado = false;
    fixture.componentInstance.cerrar.subscribe(() => {
      cerrado = true;
    });

    [...contenido().querySelectorAll('button')]
      .find((boton) => boton.textContent?.trim() === 'Cancelar')!
      .click();
    await fixture.whenStable();

    expect(cerrado).toBe(true);
  });

  it('**manda la duración del bloque elegido: el socio** (T83b)', async () => {
    usuario.set({ socioId: 4 });
    reservas.reservarComoSocio.mockResolvedValue({ folio: 'F', token: 't' });

    const fixture = montar(deHoraYMedia);
    await agregar(fixture, 'Carla Nueva');
    await enviar(fixture);

    expect(reservas.reservarComoSocio).toHaveBeenCalledWith(
      expect.objectContaining({ duracionMin: 90 }),
    );
  });

  it('**y el visitante** (T83b)', async () => {
    usuario.set({
      socioId: null,
      nombre: 'Patricio',
      apellido: 'Manquepillán',
      email: 'patricio@ejemplo.cl',
      telefono: '+56 9 1111 2222',
    });
    // Rechazado a propósito: así no sale a la pasarela, que en jsdom no existe.
    reservas.reservarComoNoSocio.mockRejectedValue({
      status: 409,
      error: { motivo: 'BLOQUE_TOMADO', message: 'La tomaron.' },
    });

    const fixture = montar(deHoraYMedia);
    await fixture.whenStable();
    await agregar(fixture, 'Beto Rival');
    await enviar(fixture);

    expect(reservas.reservarComoNoSocio).toHaveBeenCalledWith(
      expect.objectContaining({ duracionMin: 90 }),
    );
  });

  it('con un bloque de 1 hora manda 1 hora, como siempre', async () => {
    usuario.set({ socioId: 4 });
    reservas.reservarComoSocio.mockResolvedValue({ folio: 'F', token: 't' });

    const fixture = montar();
    await agregar(fixture, 'Carla Nueva');
    await enviar(fixture);

    expect(reservas.reservarComoSocio).toHaveBeenCalledWith(
      expect.objectContaining({ duracionMin: 60 }),
    );
  });

  it('el rechazo del servidor se muestra tal como viene escrito', async () => {
    // El mensaje del backend ya dice el límite y cuándo se renueva; reescribirlo acá
    // sería mantener dos versiones de la misma regla, y una quedaría vieja.
    usuario.set({ socioId: 4 });
    reservas.reservarComoSocio.mockRejectedValue({
      status: 409,
      error: {
        motivo: 'CUPO_DIARIO',
        message:
          'Ya tienes tu reserva de ese día: el cupo es de 1 reserva por día. ' +
          'Puedes reservar otro día.',
      },
    });

    const fixture = montar();
    await agregar(fixture, 'Carla Nueva');
    await enviar(fixture);

    expect(texto()).toContain('Ya tienes tu reserva de ese día');
  });
});

describe('mensajeDeRechazo', () => {
  it('usa el mensaje del servidor cuando el rechazo es de negocio', () => {
    expect(
      mensajeDeRechazo({
        status: 409,
        error: { motivo: 'CUPO_PICO', message: 'Ya tienes tus 2 reservas en horario prime esa semana.' },
      }),
    ).toEqual({
      motivo: 'CUPO_PICO',
      mensaje: 'Ya tienes tus 2 reservas en horario prime esa semana.',
    });
  });

  it('no muestra crudo lo que no es un rechazo conocido', () => {
    // Un "Internal server error" en pantalla no le dice nada a nadie: es el mismo
    // arreglo que necesitó el formulario de registro en T5.
    const rechazo = mensajeDeRechazo({
      status: 500,
      error: { message: 'Internal server error' },
    });

    expect(rechazo.mensaje).not.toContain('Internal');
    expect(rechazo.mensaje).toContain('Reintenta');
  });
});
