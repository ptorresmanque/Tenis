import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Contacto } from './contacto.service';
import { FormularioContacto } from './formulario-contacto';

/**
 * T38. El formulario del sitio: por acá entra quien todavía no es del club.
 *
 * Lo que este archivo ataja es que la pantalla **se coma el motivo del rechazo**. El
 * servidor tiene dos frases escritas para leerse —"deja un correo o un teléfono" y el
 * 429 con su plazo— y quien las necesita es alguien de afuera que, si no entiende qué
 * pasó, no vuelve a intentarlo: se pierde el interesado, que es justo lo que este
 * formulario existe para no perder.
 */
describe('FormularioContacto', () => {
  let fixture: ComponentFixture<FormularioContacto>;
  let api: { enviar: ReturnType<typeof vi.fn> };

  const montar = async () => {
    api = { enviar: vi.fn().mockResolvedValue({ id: 1 }) };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: Contacto, useValue: api }],
    });

    fixture = TestBed.createComponent(FormularioContacto);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const elemento = () => fixture.nativeElement as HTMLElement;
  const escribir = (nombre: string, valor: string) => {
    const campo = elemento().querySelector<HTMLInputElement>(`[name="${nombre}"]`)!;
    campo.value = valor;
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  };
  const enviar = async () => {
    elemento().querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await montar();
  });

  it('no pide cuenta: es la barrera que viene a sacar', () => {
    expect(elemento().textContent).toContain('No hace falta tener cuenta');
  });

  it('manda lo que la persona escribió, con el tipo elegido', async () => {
    escribir('nombre', 'Ana Interesada');
    escribir('email', 'ana@ejemplo.cl');

    await enviar();

    expect(api.enviar).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'SOCIO',
        nombre: 'Ana Interesada',
        email: 'ana@ejemplo.cl',
      }),
    );
  });

  it('enviado, agradece y no deja mandar dos veces lo mismo', async () => {
    escribir('nombre', 'Ana Interesada');
    escribir('email', 'ana@ejemplo.cl');

    await enviar();

    expect(elemento().textContent).toContain('Recibimos tu mensaje');
    // El formulario desaparece: sin esto, quien no vea el aviso vuelve a apretar y el
    // club recibe la misma consulta tres veces.
    expect(elemento().querySelector('form')).toBeNull();
  });

  it('**el motivo del rechazo se muestra tal como lo escribió el servidor**', async () => {
    api.enviar.mockRejectedValue({
      error: {
        message: 'Deja un correo o un teléfono, o el club no va a poder contestarte.',
      },
    });

    escribir('nombre', 'Ana Interesada');
    await enviar();

    expect(elemento().textContent).toContain('Deja un correo o un teléfono');
    // Y el formulario sigue ahí, con lo que la persona ya había escrito.
    expect(elemento().querySelector('form')).not.toBeNull();
  });

  it('el freno del servidor llega con su plazo, no como un error genérico', async () => {
    api.enviar.mockRejectedValue({
      error: { message: 'Recibimos varias consultas tuyas. Espera 15 minutos…' },
    });

    escribir('nombre', 'Ana Interesada');
    escribir('email', 'ana@ejemplo.cl');
    await enviar();

    expect(elemento().textContent).toContain('15 minutos');
  });

  it('los cuatro públicos del club están en el selector', () => {
    const opciones = [...elemento().querySelectorAll('option')].map((o) => o.value);

    expect(opciones).toEqual(['SOCIO', 'CLASES', 'EMPRESA', 'OTRO']);
  });
});
