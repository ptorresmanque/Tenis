import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { Disponibilidad } from '../catalogo-canchas/disponibilidad';
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

  const montar = async (torneos: TorneoPublico[]) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Disponibilidad, useValue: { delDia: vi.fn().mockResolvedValue([]) } },
        { provide: Auth, useValue: { usuario: signal(null) } },
        { provide: Torneos, useValue: { calendario: vi.fn().mockResolvedValue(torneos) } },
      ],
    });

    fixture = TestBed.createComponent(Inicio);
    await fixture.whenStable();
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
});
