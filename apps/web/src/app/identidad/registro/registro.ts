import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';

import { firstValueFrom } from 'rxjs';

import { errorDelCampo, proveerCampos } from '../../ui/campos';
import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { TelefonoDirective } from '../../ui/telefono';

interface RespuestaRegistro {
  mensaje: string;
}

interface CampoDelFormulario {
  nombre: string;
  etiqueta: string;
  tipo: string;
  autocomplete: string;
  opcional?: boolean;
  ayuda?: string;
}

@Component({
  selector: 'app-registro',
  imports: [
    MatFormFieldModule,
    MatInput,
    MatButton,
    ReactiveFormsModule,
    RouterLink,
    Aviso,
    TelefonoDirective,
  ],
  providers: [proveerCampos()],
  template: `
    <h1 class="titular text-5xl sm:text-6xl">Crear cuenta</h1>
    <p class="mt-1 max-w-prose text-muted-foreground">
      Para reservar como visitante o vincular tu cuenta de socio.
    </p>

    @if (enviado()) {
      <app-aviso variante="exito" titulo="Cuenta creada" class="mt-6 block">
        {{ enviado() }}
      </app-aviso>
    } @else {
      <form class="mt-6 grid gap-4" [formGroup]="formulario" (ngSubmit)="registrar()">
        @for (campo of campos; track campo.nombre) {
          <!-- El asterisco de lo obligatorio lo pone Material, que lo lee del required del
               control; el registro lo muestra, como siempre (en el resto va apagado). -->
          <mat-form-field [hideRequiredMarker]="false">
            <mat-label>{{ campo.etiqueta }}</mat-label>
            <!-- El +56 fijo y solo los 9 dígitos (T121). Cada @if con un solo elemento: así
                 Angular lo proyecta en el prefijo o en el control del campo de Material. -->
            @if (campo.tipo === 'tel') {
              <span matTextPrefix>+56&nbsp;</span>
            }
            @if (campo.tipo === 'tel') {
              <input
                matInput
                appTelefono
                [formControlName]="campo.nombre"
                [required]="!campo.opcional"
              />
            } @else {
              <input
                matInput
                [type]="campo.tipo"
                [formControlName]="campo.nombre"
                [autocomplete]="campo.autocomplete"
                [required]="!campo.opcional"
              />
            }
            @if (campo.ayuda) {
              <mat-hint>{{ campo.ayuda }}</mat-hint>
            }
            <mat-error>{{ errorDelCampo(formulario.get(campo.nombre)) }}</mat-error>
          </mat-form-field>
        }

        @if (error(); as motivo) {
          <app-aviso variante="error">{{ motivo }}</app-aviso>
        }

        <p class="text-sm text-muted-foreground">
          Las cuentas son para mayores de 18 años. Lee cómo cuidamos tus datos en la
          <a routerLink="/privacidad" target="_blank" class="underline">política de privacidad</a>.
        </p>

        <button
          matButton="filled"
          type="submit"
          [disabled]="enviando() || formulario.invalid"
          [attr.aria-busy]="enviando()"
        >
          {{ enviando() ? 'Creando…' : 'Crear cuenta' }}
        </button>
      </form>
    }
  `,
})
export class Registro {
  protected readonly errorDelCampo = errorDelCampo;

  private readonly http = inject(HttpClient);

  protected readonly formulario = inject(FormBuilder).nonNullable.group({
    nombre: ['', Validators.required],
    apellido: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    telefono: [''],
    // El servidor vuelve a validarla y rechaza además las filtradas; esto solo
    // evita el viaje de ida y vuelta para el error más común.
    contrasena: ['', [Validators.required, Validators.minLength(10)]],
  });

  protected readonly campos: CampoDelFormulario[] = [
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
        this.http.post<RespuestaRegistro>(
          '/api/auth/registro',
          this.formulario.getRawValue(),
        ),
      );
      this.enviado.set(respuesta.mensaje);
    } catch (falla: unknown) {
      this.error.set(
        mensajeDelServidor(
          falla,
          'No pudimos crear la cuenta. Prueba de nuevo en un momento.',
          [400],
        ),
      );
    } finally {
      this.enviando.set(false);
    }
  }
}
