import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { Auth } from '../../core/auth/auth';
import { Aviso } from '../../ui/aviso';
import { Campo, CampoControl } from '../../ui/campo';

/** Motivos con los que la API devuelve a esta pantalla tras un intento con Google. */
const RECHAZOS: Record<string, string> = {
  correo_no_verificado:
    'Google no confirmó que ese correo sea tuyo, así que no lo vinculamos a la ' +
    'cuenta del club. Entra con tu contraseña.',
  sin_perfil: 'No pudimos completar el ingreso con Google. Intenta de nuevo.',
  cancelado: 'No autorizaste el ingreso con Google. Puedes intentar de nuevo.',
  sin_configurar:
    'El ingreso con Google todavía no está configurado en este servidor. ' +
    'Entra con tu correo y contraseña.',
};

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, Aviso, Campo, CampoControl],
  template: `
    <h1 class="titular text-5xl sm:text-6xl">Entrar</h1>
    <p class="mt-1 max-w-prose text-muted-foreground">
      Con el correo y la contraseña de tu cuenta del club.
    </p>

    @if (motivoDeRechazo(); as motivo) {
      <app-aviso variante="error" class="mt-6 block">{{ motivo }}</app-aviso>
    }

    <form class="mt-6 grid gap-4" [formGroup]="formulario" (ngSubmit)="entrar()">
      <app-campo etiqueta="Correo">
        <input
          appCampoControl
          type="email"
          formControlName="email"
          autocomplete="email"
          class="campo"
        />
      </app-campo>

      <app-campo etiqueta="Contraseña">
        <input
          appCampoControl
          type="password"
          formControlName="contrasena"
          autocomplete="current-password"
          class="campo"
        />
      </app-campo>

      <!-- El rechazo es del intento, no de un campo: "correo o contraseña
           incorrectos" no sabe cuál de los dos está mal, y colgarlo del segundo
           haría que el lector culpe a la contraseña. -->
      @if (error(); as motivo) {
        <app-aviso variante="error">{{ motivo }}</app-aviso>
      }

      <button
        type="submit"
        [disabled]="entrando() || formulario.invalid"
        class="boton boton-primario"
      >
        {{ entrando() ? 'Entrando…' : 'Entrar' }}
      </button>

      <p class="text-sm text-muted-foreground">
        ¿Todavía no tienes cuenta?
        <a routerLink="/registro" class="font-semibold text-primary underline">
          Crea una
        </a>
      </p>

      <p class="text-sm text-muted-foreground">
        ¿No te llegó el correo para verificar tu cuenta?
        <a routerLink="/verificar-correo" class="font-semibold text-primary underline">
          Pide otro
        </a>
      </p>
    </form>

    <div class="mt-6 grid gap-3">
      <p class="text-sm text-muted-foreground">O bien</p>

      <!-- Enlace y no botón con fetch: el flujo de OAuth es una navegación de
           verdad, con redirecciones que el navegador tiene que seguir. -->
      <a href="/api/auth/google" class="boton boton-secundario">Entrar con Google</a>
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
