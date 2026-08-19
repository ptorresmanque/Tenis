import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
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

  const usuario = signal<{ socioId: number | null } | null>(null);
  const reservas = {
    reservarComoSocio: vi.fn(),
    reservarComoNoSocio: vi.fn(),
  };

  const montar = () => {
    const fixture = TestBed.createComponent(Reservar);
    fixture.componentRef.setInput('cancha', cancha);
    fixture.componentRef.setInput('bloque', bloque);
    fixture.detectChanges();

    return fixture;
  };

  const texto = (fixture: ReturnType<typeof montar>) =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(() => {
    // jsdom no implementa el diálogo nativo: `showModal` y `close` no existen y el
    // componente se cae al abrirse. Se apuntalan acá y no con un guardia en el
    // componente, porque el que está roto es el entorno de prueba, no el código —
    // en el navegador el diálogo abre, atrapa el foco y cierra con Escape, y eso se
    // verificó a mano.
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event('close'));
    });

    usuario.set(null);
    reservas.reservarComoSocio.mockReset();
    reservas.reservarComoNoSocio.mockReset();

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: Auth, useValue: { usuario } },
        { provide: Reservas, useValue: reservas },
      ],
    });
  });

  it('al visitante le pide sus datos y le muestra el precio', () => {
    const fixture = montar();

    expect(texto(fixture)).toContain('Reservar y pagar');
    expect(texto(fixture)).toContain('$12.000');
    expect(texto(fixture)).toContain('Correo');
  });

  it('al socio le pide con quién juega, y no le muestra precio', () => {
    usuario.set({ socioId: 4 });
    const fixture = montar();

    // El socio no paga: mostrarle un monto lo haría dudar de si le van a cobrar.
    expect(texto(fixture)).toContain('¿Con quién vas a jugar?');
    expect(texto(fixture)).not.toContain('$12.000');
  });

  it('el visitante con datos incompletos no llega a la pasarela', async () => {
    const fixture = montar();

    (fixture.nativeElement as HTMLElement)
      .querySelector('form')!
      .dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(reservas.reservarComoNoSocio).not.toHaveBeenCalled();
    expect(texto(fixture)).toContain('Revisa tu nombre');
  });

  it('cerrar el diálogo avisa a la grilla para que lo desmonte', async () => {
    // Si el aviso no llega, el componente queda montado con el diálogo cerrado: la
    // pantalla se ve normal y el siguiente bloque que se elija no abre nada.
    const fixture = montar();
    let cerrado = false;
    fixture.componentInstance.cerrar.subscribe(() => {
      cerrado = true;
    });

    (fixture.nativeElement as HTMLElement).querySelector('dialog')!.close();
    await fixture.whenStable();

    expect(cerrado).toBe(true);
  });

  it('el rechazo del servidor se muestra tal como viene escrito', async () => {
    // El mensaje del backend ya dice el límite y cuándo se renueva; reescribirlo acá
    // sería mantener dos versiones de la misma regla, y una quedaría vieja.
    usuario.set({ socioId: 4 });
    reservas.reservarComoSocio.mockRejectedValue({
      status: 409,
      error: {
        motivo: 'CUPO_DIARIO',
        message: 'Ya usaste tu cupo de hoy: 1 hora por día.',
      },
    });

    const fixture = montar();
    (fixture.nativeElement as HTMLElement)
      .querySelector('form')!
      .dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(texto(fixture)).toContain('Ya usaste tu cupo de hoy');
  });
});

describe('mensajeDeRechazo', () => {
  it('usa el mensaje del servidor cuando el rechazo es de negocio', () => {
    expect(
      mensajeDeRechazo({
        status: 409,
        error: { motivo: 'CUPO_PICO', message: 'Ya usaste tus 2 horas pico.' },
      }),
    ).toEqual({ motivo: 'CUPO_PICO', mensaje: 'Ya usaste tus 2 horas pico.' });
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
