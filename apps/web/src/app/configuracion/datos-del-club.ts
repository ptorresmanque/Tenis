import { NgTemplateOutlet } from '@angular/common';
import { Component, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';

import { errorDelCampo, proveerCampos } from '../ui/campos';
import { AdminCanchas } from '../catalogo-canchas/admin/admin-canchas.service';
import { Club } from '../club/club.service';
import { mensajeDelServidor } from '../core/errores';
import { Aviso } from '../ui/aviso';
import { TelefonoDirective } from '../ui/telefono';
import { LO_HECHO } from '../ui/material';

/** Cada dato con su etiqueta y por qué se pide. El orden es el de la pantalla. */
const DATOS = [
  {
    campo: 'nombre' as const,
    etiqueta: 'Nombre del club',
    ayuda: 'Aparece en el título de cada página y en los correos.',
    tipo: 'text',
  },
  {
    campo: 'direccion' as const,
    etiqueta: 'Dirección',
    ayuda: 'La que se muestra a quien viene a jugar.',
    tipo: 'text',
  },
  {
    campo: 'telefono' as const,
    etiqueta: 'Teléfono',
    ayuda: 'Los 9 dígitos: el +56 ya va.',
    tipo: 'tel',
  },
  {
    campo: 'email' as const,
    etiqueta: 'Correo de contacto',
    ayuda: 'A donde escribe quien reservó sin cuenta y necesita cancelar.',
    tipo: 'email',
  },
  {
    campo: 'ubicacion' as const,
    etiqueta: 'Ubicación en el mapa',
    ayuda:
      'Pega el enlace de Google Maps del club o sus coordenadas. Para copiarlas, en ' +
      'Google Maps haz clic derecho sobre el club y toca los números de arriba.',
    tipo: 'text',
  },
];

/**
 * Las redes del club (T140): una lista fija, un campo cada una. La API valida que cada
 * enlace sea de su red y convierte `@usuario` en el enlace del perfil.
 */
const REDES = [
  {
    campo: 'instagram' as const,
    etiqueta: 'Instagram',
    ayuda: 'El enlace del perfil del club, o @usuario.',
    tipo: 'text',
  },
  {
    campo: 'facebook' as const,
    etiqueta: 'Facebook',
    ayuda: 'El enlace de la página del club.',
    tipo: 'text',
  },
  {
    campo: 'tiktok' as const,
    etiqueta: 'TikTok',
    ayuda: 'El enlace del perfil del club, o @usuario.',
    tipo: 'text',
  },
  {
    campo: 'youtube' as const,
    etiqueta: 'YouTube',
    ayuda: 'El enlace del canal del club, o @usuario.',
    tipo: 'text',
  },
  {
    campo: 'whatsapp' as const,
    etiqueta: 'WhatsApp',
    ayuda: 'El número al que escribirle al club: los 9 dígitos, el +56 ya va.',
    tipo: 'tel',
  },
];

type Formulario = Record<(typeof DATOS)[number]['campo'] | (typeof REDES)[number]['campo'], string>;

/**
 * Los datos del club, que hasta la fase 7 estaban escritos en las plantillas.
 *
 * **Todos se publican.** El pie de página, la página "El club" y la pantalla de
 * portería los leen de `GET /api/club`, así que lo que se escriba acá se ve en el
 * sitio en la siguiente carga. Un campo en blanco no deja un hueco: la línea
 * desaparece de donde se muestre, sin ubicación no hay mapa (T100) y una red vacía
 * no aparece (T140).
 *
 * El logotipo no está: es un archivo y necesita dónde guardarse, que es una decisión
 * de infraestructura y no de esta pantalla.
 */
@Component({
  selector: 'app-datos-del-club',
  imports: [
    MatFormFieldModule,
    MatInput,
    MatButton,
    FormsModule,
    NgTemplateOutlet,
    Aviso,
    TelefonoDirective,
  ],
  providers: [proveerCampos()],
  template: `
    <form class="grid max-w-xl gap-4" #formulario="ngForm" (ngSubmit)="guardar()">
      @if (club.error()) {
        <app-aviso variante="error">
          No se pudieron cargar los datos del club. Reintenta en un momento.
        </app-aviso>
      }

      <!-- Un campo, igual para los datos y para las redes. -->
      <ng-template #control let-dato>
        <mat-form-field>
          <mat-label>
            {{ dato.etiqueta }}
            @if (dato.campo === 'nombre') {
              <span aria-hidden="true">*</span>
            }
          </mat-label>
          <!-- El +56 fijo y solo los 9 dígitos (T121). Cada @if con un solo elemento: así
               Angular lo proyecta en el prefijo o en el control del campo de Material. -->
          @if (dato.tipo === 'tel') {
            <span matTextPrefix>+56&nbsp;</span>
          }
          @if (dato.tipo === 'tel') {
            <input
              matInput
              appTelefono
              [name]="dato.campo"
              [ngModel]="valor(dato.campo)"
              (ngModelChange)="escribir(dato.campo, $event)"
            />
          } @else {
            <input
              matInput
              [name]="dato.campo"
              [type]="dato.tipo"
              [ngModel]="valor(dato.campo)"
              (ngModelChange)="escribir(dato.campo, $event)"
            />
          }
          @if (dato.ayuda) {
            <mat-hint>{{ dato.ayuda }}</mat-hint>
          }
          @if (dato.tipo === 'tel') {
            <mat-error>{{ errorDelCampo(formulario.form.get(dato.campo)) }}</mat-error>
          }
        </mat-form-field>
      </ng-template>

      @for (dato of DATOS; track dato.campo) {
        <ng-container
          [ngTemplateOutlet]="control"
          [ngTemplateOutletContext]="{ $implicit: dato }"
        />
      }

      <fieldset class="mt-2 grid gap-4 border-t border-border pt-4">
        <legend class="font-display text-sm font-bold tracking-wide uppercase">
          Redes sociales
        </legend>
        <p class="text-sm text-muted-foreground">
          Salen en el pie de cada página y en «El club». La que dejes en blanco no aparece.
        </p>

        @for (dato of REDES; track dato.campo) {
          <ng-container
            [ngTemplateOutlet]="control"
            [ngTemplateOutletContext]="{ $implicit: dato }"
          />
        }
      </fieldset>

      @if (error(); as falla) {
        <app-aviso variante="error">{{ falla }}</app-aviso>
      }

      <div>
        <button
          matButton="filled"
          type="submit"
          [disabled]="guardando() || club.isLoading() || !club.hasValue()"
          [attr.aria-busy]="guardando()"
        >
          {{ guardando() ? 'Guardando…' : 'Guardar los datos' }}
        </button>
      </div>
    </form>
  `,
})
export class DatosDelClub {
  protected readonly errorDelCampo = errorDelCampo;

  private readonly snackBar = inject(MatSnackBar);
  private readonly api = inject(AdminCanchas);
  /** Los datos que lee el sitio público, para que muestre lo recién guardado. */
  private readonly sitio = inject(Club);

  protected readonly DATOS = DATOS;
  protected readonly REDES = REDES;

  protected readonly club = resource({
    loader: () => this.api.configuracion(),
  });

  /**
   * Lo que hay en los campos.
   *
   * Arranca de lo que devolvió el servidor y no se sincroniza después: si se
   * recargara sola, pisaría lo que la persona está escribiendo.
   */
  protected readonly editado = signal<Partial<Formulario>>({});

  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected formulario(): Formulario {
    const guardadoEnElServidor = this.club.hasValue() ? this.club.value() : undefined;

    return {
      nombre: this.editado().nombre ?? guardadoEnElServidor?.nombre ?? '',
      direccion: this.editado().direccion ?? guardadoEnElServidor?.direccion ?? '',
      telefono: this.editado().telefono ?? guardadoEnElServidor?.telefono ?? '',
      email: this.editado().email ?? guardadoEnElServidor?.email ?? '',
      // La guardada se muestra como coordenadas, que es lo que se puede volver a
      // pegar: el enlace original no se guarda, solo sus dos números.
      ubicacion:
        this.editado().ubicacion ??
        (guardadoEnElServidor?.latitud != null
          ? `${guardadoEnElServidor.latitud}, ${guardadoEnElServidor.longitud}`
          : ''),
      instagram: this.editado().instagram ?? guardadoEnElServidor?.instagram ?? '',
      facebook: this.editado().facebook ?? guardadoEnElServidor?.facebook ?? '',
      tiktok: this.editado().tiktok ?? guardadoEnElServidor?.tiktok ?? '',
      youtube: this.editado().youtube ?? guardadoEnElServidor?.youtube ?? '',
      whatsapp: this.editado().whatsapp ?? guardadoEnElServidor?.whatsapp ?? '',
    };
  }

  /** Método y no `formulario()[campo]` en la plantilla: el `let-dato` del molde llega sin tipo. */
  protected valor(campo: keyof Formulario): string {
    return this.formulario()[campo];
  }

  protected escribir(campo: keyof Formulario, valor: string): void {
    this.editado.update((actual) => ({ ...actual, [campo]: valor }));
  }

  protected async guardar(): Promise<void> {
    this.error.set(null);

    if (!this.formulario().nombre.trim()) {
      // El servidor también lo rechaza; acá se dice sin gastar el viaje.
      this.error.set('El club necesita un nombre.');
      return;
    }

    this.guardando.set(true);

    try {
      // Se manda el formulario entero y no solo lo tocado: son diez campos de
      // texto y el endpoint es un PATCH, así que el ahorro no paga la rama extra.
      await this.api.fijarDatosDelClub(this.formulario());
      this.club.reload();
      this.sitio.recargar();
      this.editado.set({});
      this.snackBar.open('Guardado. El sitio ya muestra estos datos.', undefined, LO_HECHO);
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla, 'No se pudieron guardar los datos.'));
    } finally {
      this.guardando.set(false);
    }
  }
}
