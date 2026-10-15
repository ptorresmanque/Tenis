import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { GrillaDeCancha } from '../../catalogo-canchas/disponibilidad';
import { ClaseDelDia } from '../../clases/clases.service';
import { BloqueoDelDia, ReservaDelDia } from './agenda.service';
import { TableroDeLaAgenda, tableroDeLaAgenda } from './tablero-de-la-agenda';

/**
 * El tablero de la agenda (T270): el día del mesón con la cara de disponibilidad, una fila
 * por media hora y una columna por cancha. Lo que cuidan estas pruebas es que cada cosa
 * ocupe sus franjas —ni una más, ni una menos— y que la celda diga qué es sin color.
 */
describe('El tablero de la agenda', () => {
  // 17 de agosto, club en UTC-4: las 08:00 del club son las 12:00Z.
  const a = (hora: string) => {
    const [h, m] = hora.split(':').map(Number);
    return new Date(Date.UTC(2026, 7, 17, h + 4, m)).toISOString();
  };

  const cancha = (id: number) => ({
    id,
    nombre: `Cancha ${id}`,
    superficie: 'CEMENTO' as const,
    techada: false,
    iluminacion: true,
  });

  /** Una cancha abierta de 08:00 a 12:00, con bloques de una hora cada media hora. */
  const abierta = (id: number): GrillaDeCancha => ({
    cancha: cancha(id),
    bloques: ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00'].map((hora) => ({
      inicio: a(hora),
      fin: new Date(new Date(a(hora)).getTime() + 60 * 60 * 1000).toISOString(),
      canchaId: id,
      montoClp: 12_000,
      esPico: false,
      bloqueado: false,
      motivoBloqueo: null,
      reservado: false,
    })),
  });

  const reserva = (
    canchaId: number,
    inicio: string,
    fin: string,
    cambios: Partial<ReservaDelDia> = {},
  ): ReservaDelDia => ({
    id: 1,
    folio: 'AB23CDE',
    cancha: `Cancha ${canchaId}`,
    canchaId,
    inicio: a(inicio),
    fin: a(fin),
    estado: 'CONFIRMADA',
    nombre: 'Camila Rojas',
    telefono: '+56911112222',
    esSocio: true,
    socioId: 3,
    acompanantes: [],
    observaciones: [],
    observacionesAnteriores: 0,
    ...cambios,
  });

  const clase = (canchaId: number | null, inicio: string, fin: string): ClaseDelDia => ({
    id: 7,
    tipo: canchaId === null ? 'PREPARACION_FISICA' : 'TENIS',
    lugar: canchaId === null ? 'Gimnasio' : `Cancha ${canchaId}`,
    canchaId,
    profesor: 'Ana Silva',
    inicio: a(inicio),
    fin: a(fin),
    nivel: null,
    estado: 'PROGRAMADA',
    cupoMaximo: 4,
    notas: null,
    serieId: null,
  });

  const bloqueo = (canchaId: number, inicio: string, fin: string): BloqueoDelDia => ({
    canchaId,
    inicio: a(inicio),
    fin: a(fin),
    motivo: 'MANTENCION',
    descripcion: null,
  });

  const sinNada = { reservas: [], clases: [], bloqueos: [] };

  describe('las franjas', () => {
    it('una fila por media hora, del primer inicio al último fin del día', () => {
      const { filas } = tableroDeLaAgenda({ grillas: [abierta(1)], ...sinNada });

      expect(filas.map((fila) => fila.hora)).toEqual([
        '08:00',
        '08:30',
        '09:00',
        '09:30',
        '10:00',
        '10:30',
        '11:00',
        '11:30',
      ]);
    });

    it('**una reserva de 1 hora y media ocupa tres franjas en su cancha**', () => {
      const { filas } = tableroDeLaAgenda({
        grillas: [abierta(1), abierta(2)],
        ...sinNada,
        reservas: [reserva(2, '09:00', '10:30')],
      });
      const enLa2 = filas.map((fila) => fila.celdas[1].tipo);

      expect(filas[2].celdas[1]).toMatchObject({ tipo: 'reserva', franjas: 3 });
      expect(enLa2.slice(2, 5)).toEqual(['reserva', 'cubierta', 'cubierta']);
      expect(enLa2[5]).toBe('libre');
      // La otra cancha no se entera.
      expect(filas[2].celdas[0].tipo).toBe('libre');
    });

    it('un bloqueo cierra sus franjas exactas, ni la media hora de antes', () => {
      const { filas } = tableroDeLaAgenda({
        grillas: [abierta(1)],
        ...sinNada,
        bloqueos: [bloqueo(1, '09:00', '10:00')],
      });

      expect(filas[1].celdas[0].tipo).toBe('libre');
      expect(filas[2].celdas[0]).toMatchObject({
        tipo: 'bloqueada',
        franjas: 2,
        motivo: 'En mantención',
      });
      expect(filas[4].celdas[0].tipo).toBe('libre');
    });

    it('un cierre de varios días ocupa hasta el final del tablero', () => {
      const { filas } = tableroDeLaAgenda({
        grillas: [abierta(1)],
        ...sinNada,
        bloqueos: [{ ...bloqueo(1, '10:00', '10:00'), fin: '2026-08-20T00:00:00.000Z' }],
      });

      expect(filas[4].celdas[0]).toMatchObject({ tipo: 'bloqueada', franjas: 4 });
    });

    it('**una reserva bajo un cierre igual se ve: el cierre se corta donde ella empieza**', () => {
      const { filas } = tableroDeLaAgenda({
        grillas: [abierta(1)],
        ...sinNada,
        reservas: [reserva(1, '10:00', '11:00')],
        bloqueos: [bloqueo(1, '09:00', '12:00')],
      });

      expect(filas[2].celdas[0]).toMatchObject({ tipo: 'bloqueada', franjas: 2 });
      expect(filas[4].celdas[0]).toMatchObject({ tipo: 'reserva', franjas: 2 });
      expect(filas[6].celdas[0]).toMatchObject({ tipo: 'bloqueada', franjas: 2 });
    });

    it('una clase a una hora rara no corre el tablero: las franjas siguen en punto y media', () => {
      const { filas } = tableroDeLaAgenda({
        grillas: [abierta(1)],
        ...sinNada,
        reservas: [reserva(1, '08:00', '09:00')],
        clases: [clase(null, '07:45', '08:45')],
      });

      expect(filas[0].hora).toBe('07:30');
      expect(filas[1].celdas[0]).toMatchObject({ tipo: 'reserva', franjas: 2 });
      expect(filas[0].celdas[1]).toMatchObject({ tipo: 'clase' });
    });

    it('fuera del horario de una cancha, la franja está cerrada', () => {
      const corta: GrillaDeCancha = { ...abierta(2), bloques: abierta(2).bloques.slice(0, 2) };
      const { filas } = tableroDeLaAgenda({ grillas: [abierta(1), corta], ...sinNada });

      // La 2 abre de 08:00 a 09:30.
      expect(filas[2].celdas[1].tipo).toBe('libre');
      expect(filas[3].celdas[1].tipo).toBe('cerrada');
    });

    it('**la clase del gimnasio va en su columna, que aparece solo si hay alguna**', () => {
      const sinGimnasio = tableroDeLaAgenda({ grillas: [abierta(1)], ...sinNada });
      expect(sinGimnasio.columnas.map((columna) => columna.nombre)).toEqual(['Cancha 1']);

      const conGimnasio = tableroDeLaAgenda({
        grillas: [abierta(1)],
        ...sinNada,
        clases: [clase(null, '08:00', '09:00'), clase(1, '10:00', '11:00')],
      });

      expect(conGimnasio.columnas.map((columna) => columna.nombre)).toEqual([
        'Cancha 1',
        'Gimnasio',
      ]);
      expect(conGimnasio.filas[0].celdas[1]).toMatchObject({ tipo: 'clase', franjas: 2 });
      expect(conGimnasio.filas[4].celdas[0]).toMatchObject({ tipo: 'clase', franjas: 2 });
      // Sin clase, el gimnasio no se reserva: queda vacío, no "libre".
      expect(conGimnasio.filas[4].celdas[1].tipo).toBe('vacia');
    });
  });

  describe('en pantalla', () => {
    @Component({
      imports: [TableroDeLaAgenda],
      template: `
        <app-tablero-de-la-agenda
          [grillas]="grillas()"
          [reservas]="reservas()"
          [clases]="[]"
          [bloqueos]="[]"
          [puedeTomar]="puedeTomar()"
          (abrir)="abiertas.push($event)"
          (tomar)="tomadas.push($event)"
        />
      `,
    })
    class Anfitrion {
      readonly grillas = signal<GrillaDeCancha[]>([abierta(1), abierta(2)]);
      readonly reservas = signal<ReservaDelDia[]>([]);
      readonly puedeTomar = signal(true);
      readonly abiertas: ReservaDelDia[] = [];
      readonly tomadas: { canchaId: number; inicio: string }[] = [];
    }

    function montar(cambios: { reservas?: ReservaDelDia[]; puedeTomar?: boolean } = {}) {
      TestBed.resetTestingModule();
      const fixture = TestBed.createComponent(Anfitrion);
      fixture.componentInstance.reservas.set(cambios.reservas ?? []);
      fixture.componentInstance.puedeTomar.set(cambios.puedeTomar ?? true);
      fixture.detectChanges();
      return { fixture, el: fixture.nativeElement as HTMLElement };
    }

    const celda = (el: HTMLElement, fila: number, columna: number) =>
      el.querySelectorAll('tbody tr')[fila].querySelectorAll('td')[columna - 1] as HTMLElement;

    it('la reserva dice a nombre de quién y abre su ficha', () => {
      const unaReserva = reserva(1, '08:00', '09:00');
      const { fixture, el } = montar({ reservas: [unaReserva] });
      const boton = celda(el, 0, 1).querySelector('button')!;

      expect(celda(el, 0, 1).getAttribute('rowspan')).toBe('2');
      expect(boton.textContent).toContain('Camila Rojas');
      boton.click();

      expect(fixture.componentInstance.abiertas).toEqual([unaReserva]);
    });

    it('la que espera el pago lo dice con palabras y con borde punteado', () => {
      const { el } = montar({
        reservas: [reserva(1, '08:00', '09:00', { estado: 'PENDIENTE_PAGO' })],
      });
      const boton = celda(el, 0, 1).querySelector('button')!;

      expect(boton.textContent).toContain('Esperando el pago');
      expect(boton.className).toContain('border-dashed');
    });

    it('**al admin, la franja libre toma esa cancha a esa hora**', () => {
      const { fixture, el } = montar();

      celda(el, 2, 2).querySelector('button')!.click();

      expect(fixture.componentInstance.tomadas).toEqual([{ canchaId: 2, inicio: a('09:00') }]);
    });

    it('al gestor, la franja libre no es un botón: él no toma horas (T221)', () => {
      const { el } = montar({ puedeTomar: false });

      expect(celda(el, 2, 2).querySelector('button')).toBeNull();
      expect(celda(el, 2, 2).textContent).toContain('Libre');
    });

    it('el tablero es una sola parada de teclado y las flechas lo recorren', () => {
      const { el } = montar({ reservas: [reserva(1, '08:00', '09:00')] });
      const botones = [...el.querySelectorAll<HTMLButtonElement>('tbody button')];

      expect(botones.filter((boton) => boton.tabIndex === 0)).toHaveLength(1);

      celda(el, 0, 1).querySelector('button')!.focus();
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
      );

      // La reserva ocupa dos franjas: la de abajo es la de las 09:00.
      expect(document.activeElement?.closest('td')).toBe(celda(el, 2, 1));
    });
  });
});
