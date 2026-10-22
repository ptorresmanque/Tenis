import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';

import { errorDelCampo, proveerCampos } from '../../ui/campos';
import { Auth } from '../../core/auth/auth';
import { Aviso } from '../../ui/aviso';

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

/**
 * A dónde ir después de entrar: la pantalla que se pidió sin sesión, que `conPanel` y
 * `conSesion` dejan en `?volver=`. El parámetro lo puede escribir cualquiera en un enlace. `navigateByUrl`
 * ya no sale del sitio (con `//otro.cl` termina en `/otro.cl`), así que esto es la
 * segunda barrera: solo rutas que empiezan con una `/`, sin `//` ni `/\`, que el
 * navegador leería como otro dominio si la vuelta algún día sale del router.
 */
function rutaDeVuelta(volver: string | null): string {
  return volver && /^\/(?![/\\])/.test(volver) ? volver : '/';
}

@Component({
  selector: 'app-login',
  imports: [MatFormFieldModule, MatInput, MatButton, ReactiveFormsModule, RouterLink, Aviso],
  providers: [proveerCampos()],
  template: `
    <h1 class="titular text-5xl sm:text-6xl">Entrar</h1>
    <p class="mt-1 max-w-prose text-muted-foreground">
      Con el correo y la contraseña de tu cuenta del club.
    </p>

    @if (motivoDeRechazo(); as motivo) {
      <app-aviso variante="error" class="mt-6 block">{{ motivo }}</app-aviso>
    }

    <form class="mt-6 grid gap-4" [formGroup]="formulario" (ngSubmit)="entrar()">
      <mat-form-field>
        <mat-label>Correo</mat-label>
        <input
          matInput
          type="email"
          formControlName="email"
          autocomplete="email"
        />
        <mat-error>{{ errorDelCampo(formulario.controls.email) }}</mat-error>
      </mat-form-field>

      <mat-form-field>
        <mat-label>Contraseña</mat-label>
        <input
          matInput
          type="password"
          formControlName="contrasena"
          autocomplete="current-password"
        />
        <mat-error>{{ errorDelCampo(formulario.controls.contrasena) }}</mat-error>
      </mat-form-field>

      <!-- El rechazo es del intento, no de un campo: "correo o contraseña
           incorrectos" no sabe cuál de los dos está mal, y colgarlo del segundo
           haría que el lector culpe a la contraseña. -->
      @if (error(); as motivo) {
        <app-aviso variante="error">{{ motivo }}</app-aviso>
      }

      <button
        matButton="filled"
        type="submit"
        [disabled]="entrando() || formulario.invalid"
        [attr.aria-busy]="entrando()"
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
        ¿Olvidaste tu contraseña?
        <a routerLink="/recuperar-contrasena" class="font-semibold text-primary underline">
          Elige una nueva
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
      <a matButton="outlined" href="/api/auth/google">Entrar con Google</a>
    </div>
  `,
})
export class Login {
  protected readonly errorDelCampo = errorDelCampo;

  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  private readonly ruta = inject(ActivatedRoute);

  protected readonly motivoDeRechazo = signal(
    RECHAZOS[this.ruta.snapshot.queryParamMap.get('error') ?? ''],
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
    } catch {
      // Un solo mensaje, igual que en el servidor: decir "ese correo no existe"
      // convertiría esta pantalla en un buscador de socios del club.
      this.error.set('Correo o contraseña incorrectos.');
      this.entrando.set(false);
      return;
    }

    // Se lee recién acá: si se vuelve a `/entrar` con otro `volver`, el componente se
    // reutiliza. Y con la sesión ya abierta, lo que puede fallar es bajar la pantalla
    // (sin red, o un despliegue que reemplazó sus archivos): no es la contraseña.
    const volver = rutaDeVuelta(this.ruta.snapshot.queryParamMap.get('volver'));
    await this.router
      .navigateByUrl(volver)
      .catch(() =>
        this.error.set(
          'Ya entraste, pero la página no cargó. Revisa tu conexión e inténtalo de nuevo.',
        ),
      );
    this.entrando.set(false);
  }
}
