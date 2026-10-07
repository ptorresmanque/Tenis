import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { firstValueFrom } from 'rxjs';

import { Aviso } from '../../ui/aviso';
import { Campo, CampoControl } from '../../ui/campo';

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
  imports: [ReactiveFormsModule, RouterLink, Aviso, Campo, CampoControl],
  template: `
    <h1 class="titular text-5xl sm:text-6xl">Crear cuenta</h1>
    <p class="mt-1 max-w-prose text-muted-foreground">
      Para reservar como visitante o vincular tu cuenta de socio.
    </p>

    @if (verificado() === '1') {
      <app-aviso variante="exito" class="mt-6 block">
        Tu correo quedó verificado. Ya puedes entrar con tu contraseña.
      </app-aviso>
    } @else if (verificado() === '0') {
      <app-aviso variante="error" class="mt-6 block">
        Ese enlace de verificación no sirve: puede haber vencido o ya haberse usado.
        <a routerLink="/verificar-correo" class="font-semibold underline">Pide uno nuevo</a>.
      </app-aviso>
    }

    @if (enviado()) {
      <app-aviso variante="exito" titulo="Cuenta creada" class="mt-6 block">
        {{ enviado() }}
      </app-aviso>
    } @else {
      <form class="mt-6 grid gap-4" [formGroup]="formulario" (ngSubmit)="registrar()">
        @for (campo of campos; track campo.nombre) {
          <app-campo
            [etiqueta]="campo.etiqueta"
            [ayuda]="campo.ayuda ?? ''"
            [obligatorio]="!campo.opcional"
          >
            <input
              appCampoControl
              [type]="campo.tipo"
              [formControlName]="campo.nombre"
              [autocomplete]="campo.autocomplete"
              [required]="!campo.opcional"
              class="campo"
            />
          </app-campo>
        }

        @if (error(); as motivo) {
          <app-aviso variante="error">{{ motivo }}</app-aviso>
        }

        <button
          type="submit"
          [disabled]="enviando() || formulario.invalid"
          class="boton boton-primario"
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
      // Solo se muestra el texto del servidor cuando es un rechazo de validación:
      // ahí explica qué corregir. Un 500 diría "Internal server error", que no le
      // sirve a nadie y suena a que la persona hizo algo mal.
      const respuesta = falla as { status?: number; error?: { message?: unknown } };
      const mensaje = respuesta?.error?.message;

      this.error.set(
        respuesta?.status === 400 && typeof mensaje === 'string'
          ? mensaje
          : 'No pudimos crear la cuenta. Prueba de nuevo en un momento.',
      );
    } finally {
      this.enviando.set(false);
    }
  }
}
