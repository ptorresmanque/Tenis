import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Agenda, ReservaDelDia } from './agenda.service';
import { AgendaDelDia } from './agenda';

/**
 * T26. El panel del mesón, y sobre todo **que se actualice solo**.
 *
 * El criterio 2 de `SPEC.md`: la reserva del visitante aparece sin que nadie recargue.
 * Es lo que se muestra en la demo con dos ventanas lado a lado.
 */
describe('AgendaDelDia', () => {
  const UNA: ReservaDelDia = {
    id: 1,
    folio: 'AB23CDE',
    cancha: 'Cancha 1',
    // 12:00Z en agosto son las 08:00 en Santiago.
    inicio: '2026-08-17T12:00:00.000Z',
    fin: '2026-08-17T13:00:00.000Z',
    estado: 'CONFIRMADA',
    nombre: 'Camila Visitante',
    telefono: '+56955556666',
    esSocio: false,
    acompanantes: [],
  };

  let fixture: ComponentFixture<AgendaDelDia>;
  let delDia: ReturnType<typeof vi.fn>;
  let avisos: Subject<{ fecha: string }>;

  const montar = async (reservas: ReservaDelDia[]) => {
    delDia = vi.fn().mockResolvedValue(reservas);
    avisos = new Subject<{ fecha: string }>();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Agenda, useValue: { delDia, avisos: avisos.asObservable() } },
      ],
    });

    fixture = TestBed.createComponent(AgendaDelDia);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(async () => {
    await montar([UNA]);
  });

  it('muestra la hora del club, la cancha, quién viene y su teléfono', () => {
    expect(texto()).toContain('08:00–09:00');
    expect(texto()).toContain('Cancha 1');
    expect(texto()).toContain('Camila Visitante');
    // El teléfono es para lo que existe el panel: si llueve, el club llama.
    expect(texto()).toContain('+56955556666');
  });

  it('distingue al socio del visitante', async () => {
    await montar([
      { ...UNA, esSocio: true, nombre: 'Socia', acompanantes: ['Ana Invitada'] },
    ]);

    expect(texto()).toContain('Socia');
    expect(texto()).toContain('Ana Invitada');
  });

  it('marca la que todavía está pagando', async () => {
    // Ocupa la cancha pero puede caerse: el club necesita distinguirla de una vendida.
    await montar([{ ...UNA, estado: 'PENDIENTE_PAGO' }]);

    expect(texto()).toContain('Esperando el pago');
  });

  it('cuando el día está vacío lo dice', async () => {
    await montar([]);

    expect(texto()).toContain('No hay reservas');
  });

  it('**un aviso del servidor repuebla el panel sin recargar la página**', async () => {
    // El criterio 2 de `SPEC.md`, que es lo que se muestra en la demo.
    delDia.mockResolvedValue([
      UNA,
      { ...UNA, id: 2, folio: 'NUEVA99', nombre: 'Recién llegada' },
    ]);

    avisos.next({ fecha: fixture.componentInstance.fechaActual() });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(texto()).toContain('Recién llegada');
  });

  it('un aviso de otro día no interrumpe lo que se está mirando', async () => {
    // Quien mira el sábado no quiere que la pantalla se repueble porque entró una
    // reserva para el martes.
    delDia.mockClear();

    avisos.next({ fecha: '2030-01-01' });
    await fixture.whenStable();

    expect(delDia).not.toHaveBeenCalled();
  });
});
