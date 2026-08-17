import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { Auth } from '../../core/auth/auth';

/** Motivos con los que la API devuelve a esta pantalla tras un intento con Google. */
const RECHAZOS: Record<string, string> = {
  correo_no_verificado:
    'Google no confirmó que ese correo sea tuyo, así que no lo vinculamos a la ' +
    'cuenta del club. Entra con tu contraseña.',
  sin_perfil: 'No pudimos completar el ingreso con Google. Intenta de nuevo.',
  sin_configurar:
    'El ingreso con Google todavía no está configurado en este servidor. ' +
    'Entra con tu correo y contraseña.',
};

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <h1 class="font-display text-3xl font-bold">Entrar</h1>
    <p class="mt-1 max-w-prose text-muted-foreground">
      Con el correo y la contraseña de tu cuenta del club.
    </p>

    @if (motivoDeRechazo(); as motivo) {
      <p
        class="mt-6 max-w-md rounded-lg border border-destructive bg-card p-4 text-destructive"
        role="alert"
      >
        {{ motivo }}
      </p>
    }

    <form class="mt-6 grid max-w-md gap-4" [formGroup]="formulario" (ngSubmit)="entrar()">
      <label class="grid gap-1">
        <span class="text-sm font-semibold">Correo</span>
        <input
          type="email"
          formControlName="email"
          autocomplete="email"
          class="rounded-lg border border-border bg-card px-3 py-2 focus-visible:border-ring"
        />
      </label>

      <label class="grid gap-1">
        <span class="text-sm font-semibold">Contraseña</span>
        <input
          type="password"
          formControlName="contrasena"
          autocomplete="current-password"
          class="rounded-lg border border-border bg-card px-3 py-2 focus-visible:border-ring"
        />
      </label>

      @if (error()) {
        <p class="text-destructive" role="alert">{{ error() }}</p>
      }

      <button
        type="submit"
        [disabled]="entrando() || formulario.invalid"
        class="cursor-pointer rounded-lg bg-primary px-6 py-3 font-semibold text-on-primary
               shadow-md transition-[background-color,box-shadow] duration-200
               hover:bg-secondary hover:shadow-lg disabled:cursor-not-allowed
               disabled:opacity-60"
      >
        {{ entrando() ? 'Entrando…' : 'Entrar' }}
      </button>

      <p class="text-sm text-muted-foreground">
        ¿Todavía no tienes cuenta?
        <a routerLink="/registro" class="font-semibold text-primary underline">
          Crea una
        </a>
      </p>
    </form>

    <div class="mt-6 grid max-w-md gap-3">
      <p class="text-sm text-muted-foreground">O bien</p>

      <!-- Enlace y no botón con fetch: el flujo de OAuth es una navegación de
           verdad, con redirecciones que el navegador tiene que seguir. -->
      <a
        href="/api/auth/google"
        class="rounded-lg border-2 border-primary px-6 py-3 text-center font-semibold
               text-primary transition-colors duration-200 hover:bg-muted"
      >
        Entrar con Google
      </a>
    </div>
  `,
})
export class Login {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  protected readonly motivoDeRechazo = signal(
    RECHAZOS[inject(ActivatedRoute).snapshot.queryParamMap.get('error') ?? ''],
  );

  protected readonly formulario = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    contrasena: ['', Validators.required],
  });

  protected readonly entrando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async entrar(): Promise<void> {
    this.entrando.set(true);
    this.error.set(null);

    const { email, contrasena } = this.formulario.getRawValue();

    try {
      await this.auth.entrar(email, contrasena);
      await this.router.navigate(['/']);
    } catch {
      // Un solo mensaje, igual que en el servidor: decir "ese correo no existe"
      // convertiría esta pantalla en un buscador de socios del club.
      this.error.set('Correo o contraseña incorrectos.');
    } finally {
      this.entrando.set(false);
    }
  }
}
