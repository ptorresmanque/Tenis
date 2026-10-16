import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatButtonHarness } from '@angular/material/button/testing';
import { describe, expect, it, vi } from 'vitest';

import { Disponibilidad, GrillaDeCancha } from '../catalogo-canchas/disponibilidad';
import {
  enPesos,
  fechaEnElClub,
  horaEnElClub,
  mananaEnElClub,
} from '../catalogo-canchas/reloj-del-club';
import { Club, LugarDelClub } from '../club/club.service';
import { Auth } from '../core/auth/auth';
import { Torneos, TorneoPublico } from '../torneos/torneos.service';
import { Inicio } from './inicio';

/**
 * La portada.
 *
 * Lo que este archivo cuida es el pedido del club: **que desde la portada se vea que
 * hay torneos con la inscripción abierta**. Antes no había ni una palabra, y el
 * calendario vivía en una pestaña a la que solo llega quien ya sabe que existe.
 */
describe('Inicio', () => {
  const ABIERTO: TorneoPublico = {
    id: 5,
    nombre: 'Copa Aniversario',
    superficie: 'DURA',
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
    afiches: [],
  };

  let fixture: ComponentFixture<Inicio>;

  const montar = async (
    // Un Error es el calendario que no cargó.
    torneos: TorneoPublico[] | Error,
    delDia: (fecha: string) => Promise<GrillaDeCancha[]> = () => Promise.resolve([]),
    { esperar, tienda } = { esperar: true } as { esperar: boolean; tienda?: LugarDelClub },
  ) => {
    const vacio: LugarDelClub = { descripcion: '', horario: '', whatsapp: '', fotos: [] };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Disponibilidad, useValue: { delDia: vi.fn(delDia) } },
        { provide: Auth, useValue: { usuario: signal(null) } },
        // La tienda y la cafetería (T186): vacías salvo que el test diga otra cosa.
        {
          provide: Club,
          useValue: {
            datos: signal({
              tienda: tienda ?? vacio,
              cafeteria: vacio,
              gimnasio: { ...vacio, tarifas: [] },
            }),
          },
        },
        {
          provide: Torneos,
          useValue: {
            calendario: vi.fn(() =>
              torneos instanceof Error ? Promise.reject(torneos) : Promise.resolve(torneos),
            ),
          },
        },
      ],
    });

    fixture = TestBed.createComponent(Inicio);
    // Sin esperar: una carga que no termina nunca no deja a la portada estable.
    if (esperar) await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const texto = () => elemento().textContent ?? '';

  it('**anuncia los torneos con inscripción abierta**', async () => {
    await montar([ABIERTO]);

    expect(texto()).toContain('Copa Aniversario');
    expect(texto()).toContain('noviembre');
  });

  it('dice el valor de la inscripción y los cupos de cada categoría', async () => {
    await montar([ABIERTO]);

    expect(texto()).toContain('4ª');
    expect(texto()).toContain('$12.000');
    expect(texto()).toContain('3');
  });

  it('**el aviso de arriba lleva a la sección, no a otra página**', async () => {
    await montar([ABIERTO]);

    const aviso = elemento().querySelector('a[href="#torneos-abiertos"]');
    expect(aviso).not.toBeNull();
    expect(elemento().querySelector('#torneos-abiertos')).not.toBeNull();
  });

  it('**inscribirse lleva a la página de inscripción de ese torneo** (T316, D4)', async () => {
    await montar([ABIERTO]);

    const boton = Array.from(elemento().querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Inscribirme'),
    );

    expect(boton?.getAttribute('href')).toBe('/torneos/5/inscripcion');
  });

  it('un torneo que ya cerró su inscripción no se anuncia', async () => {
    await montar([
      { ...ABIERTO, cierreInscripcion: '2020-11-25' },
      { ...ABIERTO, id: 6, nombre: 'Copa vieja', estado: 'FINALIZADO' },
    ]);

    expect(texto()).not.toContain('Copa Aniversario');
    expect(texto()).not.toContain('Copa vieja');
  });

  it('sin torneos abiertos la portada no dibuja la sección vacía', async () => {
    await montar([]);

    expect(elemento().querySelector('#torneos-abiertos')).toBeNull();
    expect(texto()).not.toContain('Inscripciones abiertas');
  });

  // `value()` de un resource lanza en estado de error: antes de TV3.1, esto
  // rompía el pintado de la portada entera.
  it('si el calendario no carga, la portada se pinta igual y solo calla los torneos', async () => {
    await montar(new Error('la API no respondió'));

    expect(elemento().querySelector('#promesa')).not.toBeNull();
    expect(elemento().querySelector('#torneos-abiertos')).toBeNull();
  });

  /**
   * El cara a cara (TV3.5): socio contra visitante, fila por fila. Lo que se
   * cuida es que diga **lo mismo que decían las dos listas, ni una afirmación
   * más**, y que donde una no tiene par la celda quede vacía en vez de
   * inventarle uno.
   */
  describe('el cara a cara', () => {
    const OCHO = [
      'Sin pago al reservar: la hora ya está en tu cuota',
      'Cupo diario de cancha y horas en horario prime',
      'Puedes traer invitados cada mes',
      'Cambias y cancelas desde "Mis reservas"',
      'Arriendo por hora, con el precio a la vista',
      'Pagas en línea al reservar',
      'Cancelas con 24 horas y se devuelve todo',
      'Modificas hasta 6 horas antes',
    ];
    const tabla = () => elemento().querySelector('[role="table"]') as HTMLElement;

    it('**una sola llena** (T241): «Reservar una hora»; la otra, de contorno', async () => {
      // La auditoría de Material del 2026-10-14: dos botones llenos juntos se disputan la
      // atención. Reservar no pide cuenta ni compromiso, así que es la que queda llena.
      await montar([]);
      const raiz = TestbedHarnessEnvironment.loader(fixture);
      const enLaTabla = (text: string) =>
        raiz.getHarness(MatButtonHarness.with({ text, ancestor: '[role="table"]' }));

      expect(await (await enLaTabla('Reservar una hora')).getAppearance()).toBe('filled');
      expect(await (await enLaTabla('Crear cuenta')).getAppearance()).toBe('outlined');
    });
    /** Las tres celdas de la fila de un rótulo, en el orden del DOM: rótulo, socio, visitante. */
    const fila = (rotulo: string) =>
      [...tabla().querySelectorAll('[role="row"]')]
        .find((r) => r.querySelector('[role="rowheader"]')?.textContent?.trim() === rotulo)
        ?.querySelectorAll('[role="cell"], [role="rowheader"]');
    const legible = (celda: Element | undefined) => {
      const copia = celda?.cloneNode(true) as HTMLElement | undefined;
      copia?.querySelectorAll('[aria-hidden="true"]').forEach((oculto) => oculto.remove());
      return copia?.textContent?.trim();
    };

    it('las ocho afirmaciones están, textuales, una vez cada una', async () => {
      await montar([]);

      for (const afirmacion of OCHO) {
        expect(tabla().textContent?.split(afirmacion).length, afirmacion).toBe(2);
      }
    });

    it('cada afirmación va en su fila, frente a su par', async () => {
      await montar([]);

      // El rótulo primero en el DOM: quien lee en orden oye la pregunta antes de
      // las dos respuestas. En escritorio el CSS lo lleva al medio.
      expect([...(fila('El pago') ?? [])].map(legible)).toEqual([
        'El pago',
        'Sin pago al reservar: la hora ya está en tu cuota',
        'Pagas en línea al reservar',
      ]);
      expect([...(fila('Cancelar') ?? [])].map(legible)).toEqual([
        'Cancelar',
        'Cambias y cancelas desde "Mis reservas"',
        'Cancelas con 24 horas y se devuelve todo',
      ]);
    });

    it('donde una no tiene par, la celda queda vacía', async () => {
      await montar([]);

      expect(legible(fila('Invitados')?.[2])).toBe('');
      expect(legible(fila('Cambiar')?.[1])).toBe('');
    });

    it('los dos caminos siguen llevando adonde llevaban', async () => {
      await montar([]);
      const enlaces = [...tabla().querySelectorAll('a')].map((a) => [
        a.textContent?.trim(),
        a.getAttribute('href'),
      ]);

      expect(enlaces).toEqual([
        ['Crear cuenta', '/registro'],
        ['Reservar una hora', '/disponibilidad'],
      ]);
    });
  });

  /**
   * El torneo como cartel y tabla (TV3.4): el cartel dice qué y cuándo, la tabla
   * cuánto cuesta y cuánto lugar queda en cada categoría. Los datos son los
   * mismos de siempre; cambia cómo se leen.
   */
  // No tenían test hasta TV3.4, que les cambió la forma: es lo que cuida que las
  // cifras sigan saliendo del catálogo y el precio del bloque más barato.
  it('las canchas se dicen en tres cifras del catálogo, y "Desde" es el arriendo más barato', async () => {
    const techada = { ...CANCHA, id: 4, nombre: 'Cancha 4', techada: true, iluminacion: false };
    await montar([], () =>
      Promise.resolve([
        { cancha: CANCHA, bloques: [libreA(enDosHoras)] },
        { cancha: techada, bloques: [{ ...libreA(enDosHoras), canchaId: 4, montoClp: 9_000 }] },
      ]),
    );
    const banda = elemento().querySelector('[aria-labelledby="canchas"]') as HTMLElement;
    const cifras = [...banda.querySelectorAll('dd')].map((dd) => dd.textContent?.trim());

    expect(cifras).toEqual(['2', '1', '1']);
    expect(banda.textContent).toContain(enPesos(9_000));
  });

  it('**"Desde" no cuenta las horas reservadas**, que la API manda con monto 0', async () => {
    // La API pone en 0 el monto de una hora que no se puede tomar, para no ofrecer pagarla.
    // El día del lanzamiento (2026-10-11) una reserva de prueba dejó la portada en "Desde $0".
    await montar([], () =>
      Promise.resolve([
        {
          cancha: CANCHA,
          bloques: [{ ...libreA(enDosHoras), reservado: true, montoClp: 0 }, libreA(enDosHoras)],
        },
      ]),
    );
    const banda = elemento().querySelector('[aria-labelledby="canchas"]') as HTMLElement;

    expect(banda.textContent).toContain(enPesos(12_000));
    expect(banda.textContent).not.toContain(enPesos(0));
  });

  describe('el torneo con la inscripción abierta', () => {
    const seccion = () =>
      elemento().querySelector('[aria-labelledby="torneos-abiertos"]') as HTMLElement;

    it('**se anuncia con su afiche**: la primera foto de antes, en el cartel del torneo (T314)', async () => {
      await montar([
        {
          ...ABIERTO,
          afiches: [
            {
              id: 7,
              partidoId: null,
              momento: 'ANTES',
              descripcion: 'El afiche',
              miniatura: '/api/torneos/fotos/7/miniatura',
              imagen: '/api/torneos/fotos/7/imagen',
            },
          ],
        },
      ]);

      const afiche = seccion().querySelector('app-cartel-del-torneo [data-afiche] img');
      expect(afiche?.getAttribute('src')).toBe('/api/torneos/fotos/7/imagen');
    });

    it('el cartel nombra el torneo y dice hasta cuándo inscribirse', async () => {
      await montar([ABIERTO]);

      expect(seccion().querySelector('h3')?.textContent).toContain('Copa Aniversario');
      expect(seccion().textContent).toContain('Te puedes inscribir hasta el');
    });

    it('una tabla por torneo: categoría, inscripción y cupos libres', async () => {
      await montar([ABIERTO]);
      const tabla = seccion().querySelector('table');
      const encabezados = [...(tabla?.querySelectorAll('thead th') ?? [])].map((th) =>
        th.textContent?.trim(),
      );
      const fila = [...(tabla?.querySelectorAll('tbody tr td') ?? [])].map((td) =>
        td.textContent?.trim(),
      );

      expect(encabezados).toEqual(['Categoría', 'Inscripción', 'Cupos libres']);
      expect(fila).toEqual(['4ª', '$12.000', '3 de 8']);
    });

    it('la categoría llena dice que se entra en lista de espera', async () => {
      await montar([
        { ...ABIERTO, categorias: [{ ...ABIERTO.categorias[0], cuposLibres: 0 }] },
      ]);

      expect(seccion().querySelector('tbody')?.textContent).toContain('Lista de espera');
    });
  });

  /**
   * La cinta reemplaza al aviso de arriba con la misma condición (TV3.2): un
   * rótulo fijo que lleva a la sección y mensajes que pasan con lo que hay que
   * saber antes de bajar: hasta cuándo y cuánto lugar queda.
   */
  describe('la cinta del torneo', () => {
    const cinta = () => elemento().querySelector('app-cinta');

    it('dice hasta cuándo se inscribe y cuántos cupos quedan en cada categoría', async () => {
      await montar([ABIERTO]);

      expect(cinta()?.textContent).toContain('Copa Aniversario: inscripciones hasta el');
      expect(cinta()?.textContent).toContain('4ª: quedan 3 de 8 cupos');
      expect(cinta()?.textContent).toContain('Se juega desde el');
    });

    it('una categoría llena dice que hay lista de espera, como la sección de abajo', async () => {
      await montar([
        { ...ABIERTO, categorias: [{ ...ABIERTO.categorias[0], cuposLibres: 0 }] },
      ]);

      // "Sin cupos" a secas manda a no inscribirse a quien sí puede: entra en espera.
      expect(cinta()?.textContent).toContain('4ª: sin cupos, se entra en lista de espera');
    });

    it('su rótulo lleva a la sección de abajo', async () => {
      await montar([ABIERTO]);

      expect(elemento().querySelector('app-cinta a[href="#torneos-abiertos"]')).not.toBeNull();
    });

    it('sin torneos abiertos no hay cinta', async () => {
      await montar([]);

      expect(cinta()).toBeNull();
    });
  });

  // Una hora libre en dos horas más, para el zócalo y para "Libre hoy".
  const CANCHA = {
    id: 3,
    nombre: 'Cancha 3',
    superficie: 'CEMENTO',
    techada: false,
    iluminacion: true,
  } as GrillaDeCancha['cancha'];
  const enDosHoras = new Date(Date.now() + 2 * 60 * 60 * 1000);
  enDosHoras.setMinutes(0, 0, 0);
  const libreA = (inicio: Date) => ({
    inicio: inicio.toISOString(),
    fin: new Date(inicio.getTime() + 60 * 60 * 1000).toISOString(),
    canchaId: 3,
    montoClp: 12_000,
    esPico: false,
    bloqueado: false,
    motivoBloqueo: null,
    reservado: false,
  });

  /**
   * El zócalo: la barra de la transmisión con la próxima hora libre, debajo del
   * hero (TV3.1). Es el dato por el que alguien entra a la portada, así que sus
   * cuatro estados se prueban: con hora, buscando, sin horas y con la API caída.
   */
  describe('el zócalo de la próxima hora libre', () => {
    const zocalo = () =>
      elemento().querySelector('[aria-labelledby="proxima-libre"]') as HTMLElement;

    it('muestra la próxima hora libre de hoy, con su cancha, su precio y cómo tomarla', async () => {
      await montar([], () => Promise.resolve([{ cancha: CANCHA, bloques: [libreA(enDosHoras)] }]));

      expect(zocalo().textContent).toContain(horaEnElClub(enDosHoras.toISOString()));
      expect(zocalo().textContent).toContain('Cancha 3');
      expect(zocalo().textContent).toContain(enPesos(12_000));
      // "Reservar" lleva a esa hora marcada en la disponibilidad (T266).
      const hora = horaEnElClub(enDosHoras.toISOString());
      expect(zocalo().querySelector('a')?.getAttribute('href')).toBe(
        `/disponibilidad?fecha=${fechaEnElClub(enDosHoras)}&cancha=3&inicio=${hora}`,
      );
    });

    it('**si hoy ya no quedan horas, muestra las de mañana y lo dice** (T268)', async () => {
      const manana = mananaEnElClub();
      const enManana = new Date(`${manana}T14:00:00.000Z`);
      const tomada = { ...libreA(enDosHoras), reservado: true, montoClp: 0 };
      await montar([], (fecha) =>
        Promise.resolve([
          { cancha: CANCHA, bloques: fecha === manana ? [libreA(enManana)] : [tomada] },
        ]),
      );

      expect(zocalo().textContent).toContain('Mañana');
      expect(zocalo().textContent).toContain(horaEnElClub(enManana.toISOString()));
      expect(zocalo().textContent).not.toContain('Hoy ya no quedan');
      expect(zocalo().querySelector('a')?.getAttribute('href')).toContain(`fecha=${manana}`);
      expect(elemento().querySelector('#libre-hoy')?.textContent).toContain('Libre mañana');
    });

    it('con horas hoy, no pide mañana', async () => {
      const delDia = vi.fn(() => Promise.resolve([{ cancha: CANCHA, bloques: [libreA(enDosHoras)] }]));
      await montar([], delDia);

      expect(delDia).toHaveBeenCalledTimes(1);
    });

    it('mientras busca, lo dice en vez de quedar en blanco', async () => {
      // Una promesa que nunca se resuelve deja la carga abierta para siempre.
      await montar([], () => new Promise(() => undefined), { esperar: false });

      expect(zocalo().textContent).toContain('Buscando');
    });

    it('si hoy ya no quedan horas, ofrece los próximos días', async () => {
      await montar([]);

      expect(zocalo().textContent).toContain('Hoy ya no quedan horas libres');
      expect(zocalo().querySelector('a[href="/disponibilidad"]')).not.toBeNull();
    });

    it('si no pudo cargar, lo dice y ofrece la disponibilidad', async () => {
      await montar([], () => Promise.reject(new Error('la API no respondió')));

      expect(zocalo().textContent).toContain('No pudimos cargar');
      expect(zocalo().querySelector('a[href="/disponibilidad"]')).not.toBeNull();
    });
  });

  /**
   * "Libre hoy" aparece solo si hay horas que listar (revisión de TV3.1). Sin
   * horas, cargando o con la API caída, el aviso lo da el zócalo: la banda
   * repetía la misma frase debajo y el lector de pantalla la anunciaba dos veces.
   */
  describe('la banda "Libre hoy"', () => {
    const banda = () => elemento().querySelector('[aria-labelledby="libre-hoy"]');
    const veces = (frase: string) => texto().split(frase).length - 1;

    it('con horas libres, las lista', async () => {
      await montar([], () => Promise.resolve([{ cancha: CANCHA, bloques: [libreA(enDosHoras)] }]));

      expect(banda()?.textContent).toContain(horaEnElClub(enDosHoras.toISOString()));
    });

    it('sin horas no aparece, y la frase del vacío se dice una sola vez', async () => {
      await montar([]);

      expect(banda()).toBeNull();
      expect(veces('Hoy ya no quedan horas libres')).toBe(1);
    });

    it('con la API caída no aparece, y el error se dice una sola vez', async () => {
      await montar([], () => Promise.reject(new Error('la API no respondió')));

      expect(banda()).toBeNull();
      expect(veces('No pudimos cargar')).toBe(1);
    });

    it('mientras busca no aparece: la espera la muestra el zócalo', async () => {
      await montar([], () => new Promise(() => undefined), { esperar: false });

      expect(banda()).toBeNull();
    });
  });

  describe('la foto y el final de la portada (T305, SPEC-sitio.md D6 y D7)', () => {
    it('**la foto de arriba es la vista aérea del club**', async () => {
      await montar([]);
      const foto = elemento().querySelector<HTMLImageElement>('[aria-labelledby="promesa"] img')!;

      expect(foto.getAttribute('src')).toContain('/fotos/el-club.jpg');
      expect(foto.alt).toContain('Vista aérea del club');
    });

    it('**no tiene la banda final**: ni «Todavía quedan horas para hoy» ni su foto', async () => {
      await montar([], undefined, { esperar: true });

      expect(elemento().querySelector('[aria-labelledby="cierre"]')).toBeNull();
      expect(texto()).not.toContain('Todavía quedan horas para hoy');
      expect(texto()).not.toContain('Elige tu hora de esta semana');
      expect(elemento().querySelector('img[src*="instalaciones.jpg"]')).toBeNull();
    });
  });

  describe('la tienda y la cafetería (T186)', () => {
    it('con la tienda descrita, la portada la cuenta antes del cierre', async () => {
      await montar([], undefined, {
        esperar: true,
        tienda: {
          descripcion: 'Raquetas, cuerdas y zapatillas.',
          horario: '',
          whatsapp: '',
          fotos: [],
        },
      });
      const titulos = Array.from(elemento().querySelectorAll('h2')).map((h) =>
        h.textContent?.trim(),
      );

      expect(titulos).toContain('También en el club');
    });

    it('sin nada descrito, la banda no existe', async () => {
      await montar([]);

      expect(texto()).not.toContain('También en el club');
    });
  });
});
