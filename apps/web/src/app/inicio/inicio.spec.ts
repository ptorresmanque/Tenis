import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { Disponibilidad, GrillaDeCancha } from '../catalogo-canchas/disponibilidad';
import { enPesos, horaEnElClub } from '../catalogo-canchas/reloj-del-club';
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
    categoria: 'Club 250',
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
        valor: 'Club 250',
        montoClp: 12_000,
        cupo: 8,
        cuposLibres: 3,
        armado: false,
      },
    ],
  };

  let fixture: ComponentFixture<Inicio>;

  const montar = async (
    // Un Error es el calendario que no cargó.
    torneos: TorneoPublico[] | Error,
    delDia: () => Promise<GrillaDeCancha[]> = () => Promise.resolve([]),
    { esperar } = { esperar: true },
  ) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Disponibilidad, useValue: { delDia: vi.fn(delDia) } },
        { provide: Auth, useValue: { usuario: signal(null) } },
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

  it('**inscribirse abre el formulario de ese torneo, no la lista entera**', async () => {
    await montar([ABIERTO]);

    const boton = Array.from(elemento().querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Inscribirme'),
    );

    expect(boton?.getAttribute('href')).toBe('/torneos?inscripcion=5');
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
      expect(zocalo().querySelector('a[href="/disponibilidad"]')).not.toBeNull();
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
});
