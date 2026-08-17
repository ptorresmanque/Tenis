import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';

interface RespuestaRegistro {
  mensaje: string;
}

interface Campo {
  nombre: string;
  etiqueta: string;
  tipo: string;
  autocomplete: string;
  opcional?: boolean;
  ayuda?: string;
}

@Component({
  selector: 'app-registro',
  imports: [FormsModule],
  template: `
    <h1 class="font-display text-3xl font-bold">Crear cuenta</h1>
    <p class="mt-1 max-w-prose text-muted-foreground">
      Para reservar como visitante o vincular tu cuenta de socio.
    </p>

    @if (verificado() === '1') {
      <p
        class="mt-6 rounded-lg border border-border bg-card p-4 text-accent-strong"
        role="status"
      >
        Tu correo quedó verificado. Ya podés entrar con tu contraseña.
      </p>
    } @else if (verificado() === '0') {
      <p
        class="mt-6 rounded-lg border border-destructive bg-card p-4 text-destructive"
        role="alert"
      >
        Ese enlace de verificación no sirve: puede haber vencido o ya haberse usado.
        Registrate de nuevo para recibir otro.
      </p>
    }

    @if (enviado()) {
      <p
        class="mt-6 rounded-lg border border-border bg-card p-4 shadow-sm"
        role="status"
      >
        {{ enviado() }}
      </p>
    } @else {
      <form
        class="mt-6 grid max-w-md gap-4"
        (ngSubmit)="registrar()"
        #formulario="ngForm"
      >
        @for (campo of campos; track campo.nombre) {
          <label class="grid gap-1">
            <span class="text-sm font-semibold">
              {{ campo.etiqueta }}
              @if (!campo.opcional) {
                <span aria-hidden="true">*</span>
              }
            </span>
            <input
              [type]="campo.tipo"
              [name]="campo.nombre"
              [required]="!campo.opcional"
              [autocomplete]="campo.autocomplete"
              [minlength]="campo.nombre === 'contrasena' ? 10 : 0"
              [(ngModel)]="datos[campo.nombre]"
              class="rounded-lg border border-border bg-card px-3 py-2
                     focus-visible:border-ring"
            />
            @if (campo.ayuda) {
              <span class="text-sm text-muted-foreground">{{ campo.ayuda }}</span>
            }
          </label>
        }

        @if (error()) {
          <p class="text-destructive" role="alert">{{ error() }}</p>
        }

        <button
          type="submit"
          [disabled]="enviando() || formulario.invalid"
          class="cursor-pointer rounded-lg bg-primary px-6 py-3 font-semibold
                 text-on-primary shadow-md transition-[background-color,box-shadow]
                 duration-200 hover:bg-secondary hover:shadow-lg
                 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {{ enviando() ? 'Creando…' : 'Crear cuenta' }}
        </button>
      </form>
    }
  `,
})
export class Registro {
  private readonly http = inject(HttpClient);

  /** Lo deja el enlace del correo tras pasar por la API. */
  protected readonly verificado = signal(
    inject(ActivatedRoute).snapshot.queryParamMap.get('verificado'),
  );

  protected readonly datos: Record<string, string> = {
    nombre: '',
    apellido: '',
    email: '',
    telefono: '',
    contrasena: '',
  };

  protected readonly campos: Campo[] = [
    { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'text', autocomplete: 'given-name' },
    {
      nombre: 'apellido',
      etiqueta: 'Apellido',
      tipo: 'text',
      autocomplete: 'family-name',
    },
    { nombre: 'email', etiqueta: 'Correo', tipo: 'email', autocomplete: 'email' },
    {
      nombre: 'telefono',
      etiqueta: 'Teléfono',
      tipo: 'tel',
      autocomplete: 'tel',
      opcional: true,
    },
    {
      nombre: 'contrasena',
      etiqueta: 'Contraseña',
      tipo: 'password',
      autocomplete: 'new-password',
      // La regla se muestra antes de escribir, no como reproche después de enviar.
      ayuda: 'Al menos 10 caracteres. Una frase larga es mejor que símbolos.',
    },
  ];

  protected readonly enviando = signal(false);
  protected readonly enviado = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected async registrar(): Promise<void> {
    this.enviando.set(true);
    this.error.set(null);

    try {
      const respuesta = await firstValueFrom(
        this.http.post<RespuestaRegistro>('/api/auth/registro', this.datos),
      );
      this.enviado.set(respuesta.mensaje);
    } catch (falla: unknown) {
      // Solo se muestra el texto del servidor cuando es un rechazo de validación:
      // ahí explica qué corregir. Un 500 diría "Internal server error", que no le
      // sirve a nadie y suena a que la persona hizo algo mal.
      const respuesta = falla as { status?: number; error?: { message?: unknown } };
      const mensaje = respuesta?.error?.message;

      this.error.set(
        respuesta?.status === 400 && typeof mensaje === 'string'
          ? mensaje
          : 'No pudimos crear la cuenta. Probá de nuevo en un momento.',
      );
    } finally {
      this.enviando.set(false);
    }
  }
}
