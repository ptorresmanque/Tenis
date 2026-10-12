import { TestBed } from '@angular/core/testing';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
  Event as EventoDelRouter,
} from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProgresoDeNavegacion } from './progreso-de-navegacion';

/**
 * T151. Entre el clic y la pantalla nueva, el router baja el código de la ruta: en una
 * red lenta pasa un segundo sin que nada cambie. Esta barra lo dice, pero solo si la
 * espera se nota: en una red rápida, parpadear en cada clic sería peor que nada.
 */
describe('ProgresoDeNavegacion', () => {
  let eventos: Subject<EventoDelRouter>;

  beforeEach(() => {
    vi.useFakeTimers();
    eventos = new Subject();
    TestBed.configureTestingModule({
      providers: [{ provide: Router, useValue: { events: eventos } }],
    });
  });

  afterEach(() => vi.useRealTimers());

  const montar = () => {
    const fixture = TestBed.createComponent(ProgresoDeNavegacion);
    fixture.detectChanges();
    const barra = () => (fixture.nativeElement as HTMLElement).querySelector('[data-barra]');
    const pasar = (ms: number) => {
      vi.advanceTimersByTime(ms);
      fixture.detectChanges();
    };
    const emitir = (evento: EventoDelRouter) => {
      eventos.next(evento);
      fixture.detectChanges();
    };
    return { barra, pasar, emitir };
  };

  const inicio = () => new NavigationStart(1, '/el-club');

  it('**en una navegación rápida no aparece nunca**', () => {
    const { barra, pasar, emitir } = montar();

    emitir(inicio());
    pasar(150);
    emitir(new NavigationEnd(1, '/el-club', '/el-club'));
    pasar(500);

    expect(barra()).toBeNull();
  });

  it('aparece recién a los 200 ms de espera', () => {
    const { barra, pasar, emitir } = montar();

    emitir(inicio());
    pasar(199);
    expect(barra()).toBeNull();

    pasar(1);
    expect(barra()).not.toBeNull();
  });

  it('se va al terminar la navegación', () => {
    const { barra, pasar, emitir } = montar();

    emitir(inicio());
    pasar(300);
    emitir(new NavigationEnd(1, '/el-club', '/el-club'));

    expect(barra()).toBeNull();
  });

  it('una navegación cancelada o con error también la quita', () => {
    const { barra, pasar, emitir } = montar();

    emitir(inicio());
    pasar(300);
    emitir(new NavigationCancel(1, '/el-club', 'otra navegación'));
    expect(barra()).toBeNull();

    emitir(inicio());
    pasar(300);
    emitir(new NavigationError(1, '/el-club', new Error('sin red')));
    expect(barra()).toBeNull();
  });

  it('el lector de pantalla no la anuncia: es decoración de una espera', () => {
    const { barra, pasar, emitir } = montar();

    emitir(inicio());
    pasar(300);

    expect(barra()?.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});
