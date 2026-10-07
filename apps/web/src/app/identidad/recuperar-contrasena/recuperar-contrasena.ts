import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { firstValueFrom } from 'rxjs';

import { Aviso } from '../../ui/aviso';
import { Campo, CampoControl } from '../../ui/campo';

/**
 * Recuperar la contraseña, en dos pasos: en /recuperar-contrasena pide el correo, y en
 * /nueva-contrasena, con el `?token=` del enlace que llegó, la contraseña nueva.
 *
 * Dos rutas y no una con y sin token: ir de una a otra crea la pantalla de nuevo, y
 * con una sola Angular la reutilizaría con el token viejo.
 *
 * Sin `soloVisitantes`: el enlace se abre en cualquier navegador, con o sin sesión.
 */
@Component({
  selector: 'app-recuperar-contrasena',
  imports: [ReactiveFormsModule, RouterLink, Aviso, Campo, CampoControl],
  template: `
    <h1 class="titular text-5xl sm:text-6xl">Recuperar contraseña</h1>

    @if (!token) {
      <p class="mt-1 max-w-prose text-muted-foreground">
        Te mandamos un enlace al correo para que elijas una contraseña nueva.
      </p>

      @if (listo(); as mensaje) {
        <app-aviso variante="exito" class="mt-6 block">{{ mensaje }}</app-aviso>
      } @else {
        <form class="mt-6 grid gap-4" [formGroup]="pedido" (ngSubmit)="pedir()">
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
            [disabled]="enviando() || pedido.invalid"
            class="boton boton-primario"
          >
            {{ enviando() ? 'Enviando…' : 'Mandar el enlace' }}
          </button>
        </form>
      }
    } @else {
      @if (listo()) {
        <app-aviso variante="exito" class="mt-6 block">
          Tu contraseña quedó cambiada. Las sesiones que tenías abiertas se cerraron.
        </app-aviso>
        <a routerLink="/entrar" class="boton boton-primario mt-6">Entrar</a>
      } @else {
        <form class="mt-6 grid gap-4" [formGroup]="nueva" (ngSubmit)="restablecer()">
          <app-campo
            etiqueta="Contraseña nueva"
            ayuda="Al menos 10 caracteres. Una frase larga es mejor que símbolos."
          >
            <input
              appCampoControl
              type="password"
              formControlName="contrasena"
              autocomplete="new-password"
              class="campo"
            />
          </app-campo>

          @if (error(); as motivo) {
            <app-aviso variante="error">{{ motivo }}</app-aviso>
          }

          <button
            type="submit"
            [disabled]="enviando() || nueva.invalid"
            class="boton boton-primario"
          >
            {{ enviando() ? 'Guardando…' : 'Guardar la contraseña' }}
          </button>
        </form>
      }
    }

    <p class="mt-6 grid gap-2 text-sm text-muted-foreground">
      @if (token && !listo()) {
        <span>
          ¿El enlace venció o ya lo usaste?
          <a routerLink="/recuperar-contrasena" class="font-semibold text-primary underline">
            Pide otro
          </a>
        </span>
      }
      @if (!(token && listo())) {
        <a routerLink="/entrar" class="font-semibold text-primary underline">Volver a entrar</a>
      }
    </p>
  `,
})
export class RecuperarContrasena {
  private readonly http = inject(HttpClient);
  private readonly formularios = inject(FormBuilder).nonNullable;

  /** El que trae el enlace del correo. */
  protected readonly token = inject(ActivatedRoute).snapshot.queryParamMap.get('token');

  protected readonly pedido = this.formularios.group({
    email: ['', [Validators.required, Validators.email]],
  });

  // El servidor vuelve a validarla y rechaza además las filtradas, como en el registro.
  protected readonly nueva = this.formularios.group({
    contrasena: ['', [Validators.required, Validators.minLength(10)]],
  });

  protected readonly enviando = signal(false);
  protected readonly listo = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected pedir(): Promise<void> {
    return this.mandar(async () => {
      const respuesta = await firstValueFrom(
        this.http.post<{ mensaje: string }>('/api/auth/recuperar', this.pedido.getRawValue()),
      );
      this.listo.set(respuesta.mensaje);
    });
  }

  protected restablecer(): Promise<void> {
    return this.mandar(async () => {
      await firstValueFrom(
        this.http.post('/api/auth/restablecer', {
          token: this.token,
          contrasena: this.nueva.getRawValue().contrasena,
        }),
      );
      this.listo.set('cambiada');
    });
  }

  private async mandar(pedirAlServidor: () => Promise<void>): Promise<void> {
    this.enviando.set(true);
    this.error.set(null);

    try {
      await pedirAlServidor();
    } catch (falla: unknown) {
      // El texto del servidor solo cuando le dice a la persona qué hacer: corregir
      // (400) o esperar (429). Lo demás sería "Internal server error".
      const respuesta = falla as { status?: number; error?: { message?: unknown } };
      const mensaje = respuesta?.error?.message;

      this.error.set(
        (respuesta?.status === 400 || respuesta?.status === 429) &&
          typeof mensaje === 'string'
          ? mensaje
          : 'No pudimos hacerlo ahora. Prueba de nuevo en un momento.',
      );
    } finally {
      this.enviando.set(false);
    }
  }
}
