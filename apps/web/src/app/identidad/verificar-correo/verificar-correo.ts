import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { firstValueFrom } from 'rxjs';

import { Aviso } from '../../ui/aviso';
import { Campo, CampoControl } from '../../ui/campo';

/**
 * Pedir otro enlace de verificación, para el que venció o el que nunca llegó.
 *
 * La respuesta es la misma tenga o no cuenta el correo, y se muestra tal cual: esta
 * pantalla no sabe más que el servidor, así que tampoco puede decir más.
 */
@Component({
  selector: 'app-verificar-correo',
  imports: [ReactiveFormsModule, RouterLink, Aviso, Campo, CampoControl],
  template: `
    <h1 class="titular text-5xl sm:text-6xl">Verificar correo</h1>
    <p class="mt-1 max-w-prose text-muted-foreground">
      Si el enlace para verificar tu cuenta venció o no te llegó, te mandamos otro.
    </p>

    @if (enviado(); as mensaje) {
      <app-aviso variante="exito" class="mt-6 block">{{ mensaje }}</app-aviso>
    } @else {
      <form class="mt-6 grid gap-4" [formGroup]="formulario" (ngSubmit)="pedir()">
        <app-campo etiqueta="Correo">
          <input
            appCampoControl
            type="email"
            formControlName="email"
            autocomplete="email"
            class="campo"
          />
        </app-campo>

        @if (error(); as motivo) {
          <app-aviso variante="error">{{ motivo }}</app-aviso>
        }

        <button
          type="submit"
          [disabled]="enviando() || formulario.invalid"
          class="boton boton-primario"
        >
          {{ enviando() ? 'Enviando…' : 'Mandar un enlace nuevo' }}
        </button>
      </form>
    }

    <p class="mt-6 text-sm text-muted-foreground">
      <a routerLink="/entrar" class="font-semibold text-primary underline">Volver a entrar</a>
    </p>
  `,
})
export class VerificarCorreo {
  private readonly http = inject(HttpClient);

  protected readonly formulario = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected readonly enviando = signal(false);
  protected readonly enviado = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected async pedir(): Promise<void> {
    this.enviando.set(true);
    this.error.set(null);

    try {
      const respuesta = await firstValueFrom(
        this.http.post<{ mensaje: string }>(
          '/api/auth/reenviar-verificacion',
          this.formulario.getRawValue(),
        ),
      );
      this.enviado.set(respuesta.mensaje);
    } catch (falla: unknown) {
      // El texto del servidor solo cuando le dice a la persona qué hacer: corregir
      // el correo (400) o esperar (429). Lo demás sería "Internal server error".
      const respuesta = falla as { status?: number; error?: { message?: unknown } };
      const mensaje = respuesta?.error?.message;

      this.error.set(
        (respuesta?.status === 400 || respuesta?.status === 429) &&
          typeof mensaje === 'string'
          ? mensaje
          : 'No pudimos pedir el enlace. Prueba de nuevo en un momento.',
      );
    } finally {
      this.enviando.set(false);
    }
  }
}
