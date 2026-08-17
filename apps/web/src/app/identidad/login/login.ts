import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { Auth } from '../../core/auth/auth';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <h1 class="font-display text-3xl font-bold">Entrar</h1>
    <p class="mt-1 max-w-prose text-muted-foreground">
      Con el correo y la contraseña de tu cuenta del club.
    </p>

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
        ¿Todavía no tenés cuenta?
        <a routerLink="/registro" class="font-semibold text-primary underline">
          Creá una
        </a>
      </p>
    </form>
  `,
})
export class Login {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

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
