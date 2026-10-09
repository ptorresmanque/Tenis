import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { PartidoPublico } from '../torneos.service';
import { OrdenDeJuego } from './orden-de-juego';

/**
 * T136. El orden de juego (opción C, decisión 9 de la sexta parte): los partidos por día
 * y hora, con su cancha, ronda, estado y resultado, y un buscador que marca los de quien
 * se escribe. Responde lo primero que se pregunta en un torneo: a qué hora y en qué
 * cancha juego.
 */
describe('OrdenDeJuego', () => {
  const partido = (parche: Partial<PartidoPublico>): PartidoPublico => ({
    ronda: 1,
    ronda_nombre: 'Cuartos de final',
    posicion: 1,
    jugadorA: null,
    jugadorB: null,
    ganador: null,
    marcador: null,
    walkover: false,
    inicio: null,
    fin: null,
    cancha: null,
    ...parche,
  });

  // Sábado 5 y domingo 6 de diciembre de 2026, en Santiago (UTC-3 en verano).
  const PARTIDOS: PartidoPublico[] = [
    partido({
      posicion: 3,
      jugadorA: 'Vicente Morales',
      jugadorB: 'Cristóbal Pino',
      inicio: '2026-12-05T13:30:00.000Z',
      fin: '2026-12-05T15:00:00.000Z',
      cancha: 'Cancha 1',
    }),
    partido({
      posicion: 1,
      jugadorA: 'Matías Riquelme',
      jugadorB: 'Joaquín Soto',
      ganador: 'Matías Riquelme',
      marcador: '6-3 6-2',
      inicio: '2026-12-05T12:00:00.000Z',
      fin: '2026-12-05T13:30:00.000Z',
      cancha: 'Cancha 1',
    }),
    partido({
      posicion: 2,
      jugadorA: 'Benjamín Araya',
      jugadorB: 'Tomás Fuentes',
      ganador: 'Tomás Fuentes',
      walkover: true,
      inicio: '2026-12-05T12:00:00.000Z',
      fin: '2026-12-05T13:30:00.000Z',
      cancha: 'Cancha 2',
    }),
    partido({
      posicion: 4,
      jugadorA: 'Diego Valdés',
      jugadorB: 'Ignacio Cárcamo',
    }),
    partido({
      ronda: 2,
      ronda_nombre: 'Semifinal',
      posicion: 1,
      jugadorA: 'Matías Riquelme',
      jugadorB: 'Tomás Fuentes',
      inicio: '2026-12-06T13:00:00.000Z',
      fin: '2026-12-06T14:30:00.000Z',
      cancha: 'Cancha 1',
    }),
    partido({ ronda: 2, ronda_nombre: 'Semifinal', posicion: 2 }),
    partido({ ronda: 3, ronda_nombre: 'Final', posicion: 1 }),
  ];

  let fixture: ComponentFixture<OrdenDeJuego>;

  const montar = async (partidos: PartidoPublico[] = PARTIDOS) => {
    TestBed.resetTestingModule();
    fixture = TestBed.createComponent(OrdenDeJuego);
    fixture.componentRef.setInput('partidos', partidos);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const texto = () => elemento().textContent?.replace(/\s+/g, ' ') ?? '';
  const turnos = () => [...elemento().querySelectorAll<HTMLElement>('[data-turno]')];
  const marcados = () => turnos().filter((t) => t.hasAttribute('data-tuyo'));

  const buscar = async (busqueda: string) => {
    const campo = elemento().querySelector<HTMLInputElement>('input[type="search"]')!;
    campo.value = busqueda;
    campo.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await montar();
  });

  describe('por día y hora', () => {
    it('**agrupa los partidos por día**, en el orden en que se juegan', () => {
      const dias = [...elemento().querySelectorAll('h3[data-dia]')].map((h) =>
        h.textContent?.trim().toLowerCase(),
      );

      expect(dias).toEqual(['sábado, 5 de diciembre', 'domingo, 6 de diciembre']);
    });

    it('dentro del día, por hora y después por cancha', () => {
      const delSabado = turnos()
        .slice(0, 3)
        .map((t) => t.querySelector('[data-hora]')?.textContent?.replace(/\s+/g, ' ').trim());

      expect(delSabado).toEqual(['09:00 Cancha 1', '09:00 Cancha 2', '10:30 Cancha 1']);
    });

    it('cada partido dice su ronda y su estado', () => {
      expect(turnos()[2].textContent).toContain('Cuartos de final');
      expect(turnos()[2].textContent).toContain('Programado');
      expect(turnos()[0].textContent).toContain('Jugado');
    });
  });

  describe('el resultado', () => {
    it('**un partido jugado muestra el marcador y quién ganó**', () => {
      const jugado = turnos()[0];

      expect(jugado.textContent).toContain('6-3 6-2');
      expect(jugado.querySelector('[data-gano]')?.textContent).toContain(
        'Matías Riquelme',
      );
    });

    it('**el walkover lo dice**, con quién no se presentó', () => {
      expect(turnos()[1].textContent?.replace(/\s+/g, ' ')).toContain(
        'Benjamín Araya no se presentó',
      );
    });
  });

  describe('los que faltan', () => {
    it('**los sin programar van abajo**, con sus jugadores o "por definir"', () => {
      const pendientes = elemento().querySelector('[data-por-programar]');

      expect(pendientes?.textContent).toContain('Diego Valdés');
      expect(pendientes?.textContent).toContain('Por definir');
      expect(pendientes?.textContent).toContain('Final');
    });

    it('**un bye no es un partido**: no aparece', async () => {
      await montar([
        ...PARTIDOS,
        partido({ posicion: 5, jugadorA: 'Solo Sembrado', ganador: 'Solo Sembrado' }),
      ]);

      expect(texto()).not.toContain('Solo Sembrado');
    });

    it('si el club todavía no programa nada, lo dice', async () => {
      await montar(PARTIDOS.map((p) => ({ ...p, inicio: null, fin: null, cancha: null })));

      expect(texto()).toContain('El club todavía no programa los partidos');
    });
  });

  describe('el buscador', () => {
    it('**marca los partidos de quien se escribe**, por parte del apellido', async () => {
      await buscar('fuen');

      expect(marcados()).toHaveLength(2);
      expect(marcados().every((t) => t.textContent?.includes('Tomás Fuentes'))).toBe(true);
    });

    it('**el nombre encontrado va resaltado**, con su fondo y su margen', async () => {
      // Una clase con punto en un [class.x] se corta en el punto: px-0.5 llegaba como
      // px-0, sin aviso. Lo encontró el /review mirando el navegador.
      await buscar('fuen');

      const resaltado = marcados()[0].querySelector('.bg-accent-soft');
      expect(resaltado?.textContent).toContain('Tomás Fuentes');
      expect(resaltado?.classList).toContain('px-1');
    });

    it('también por el nombre, sin importar tildes ni mayúsculas', async () => {
      await buscar('TOMAS');

      expect(marcados()).toHaveLength(2);
    });

    it('**y no marca nada si no hay nadie con ese nombre**, y lo dice', async () => {
      await buscar('zúñiga');

      expect(marcados()).toHaveLength(0);
      expect(texto()).toContain('Nadie con ese nombre en esta categoría');
    });

    it('marca también los que faltan programar', async () => {
      await buscar('valdés');

      expect(
        elemento().querySelector('[data-por-programar] [data-tuyo]')?.textContent,
      ).toContain('Diego Valdés');
    });

    it('dice cuántos encontró, para el lector de pantalla', async () => {
      await buscar('riquelme');

      expect(elemento().querySelector('[aria-live]')?.textContent).toContain(
        '2 partidos',
      );
    });
  });
});
