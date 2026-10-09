import { Component, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AdminCanchas } from '../catalogo-canchas/admin/admin-canchas.service';
import { mensajeDelServidor } from '../core/errores';
import { Aviso } from '../ui/aviso';
import { Campo, CampoControl } from '../ui/campo';
import { TelefonoDirective } from '../ui/telefono';

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

type Formulario = Record<(typeof DATOS)[number]['campo'], string>;

/**
 * Los datos del club, que hasta la fase 7 estaban escritos en las plantillas.
 *
 * **Los cinco se publican.** El pie de página, la página "El club" y la pantalla de
 * portería los leen de `GET /api/club`, así que lo que se escriba acá se ve en el
 * sitio en la siguiente carga. Un campo en blanco no deja un hueco: la línea
 * desaparece de donde se muestre, y sin ubicación no hay mapa (T100).
 *
 * El logotipo no está: es un archivo y necesita dónde guardarse, que es una decisión
 * de infraestructura y no de esta pantalla.
 */
@Component({
  selector: 'app-datos-del-club',
  imports: [FormsModule, Aviso, Campo, CampoControl, TelefonoDirective],
  template: `
    <form class="grid max-w-xl gap-4" (ngSubmit)="guardar()">
      @if (club.error()) {
        <app-aviso variante="error">
          No se pudieron cargar los datos del club. Reintenta en un momento.
        </app-aviso>
      }

      @for (dato of DATOS; track dato.campo) {
        <app-campo
          [etiqueta]="dato.etiqueta"
          [ayuda]="dato.ayuda"
          [obligatorio]="dato.campo === 'nombre'"
        >
          @if (dato.tipo === 'tel') {
            <!-- El +56 fijo y solo los 9 dígitos (T121). -->
            <span class="campo-con-prefijo">
              <span class="prefijo" aria-hidden="true">+56</span>
              <input
                appCampoControl
                appTelefono
                class="campo"
                [name]="dato.campo"
                [ngModel]="formulario()[dato.campo]"
                (ngModelChange)="escribir(dato.campo, $event)"
              />
            </span>
          } @else {
            <input
              appCampoControl
              class="campo"
              [name]="dato.campo"
              [type]="dato.tipo"
              [ngModel]="formulario()[dato.campo]"
              (ngModelChange)="escribir(dato.campo, $event)"
            />
          }
        </app-campo>
      }

      @if (error(); as falla) {
        <app-aviso variante="error">{{ falla }}</app-aviso>
      } @else if (guardado()) {
        <app-aviso variante="exito">
          Guardado. El sitio ya muestra estos datos.
        </app-aviso>
      }

      <div>
        <button
          type="submit"
          class="boton boton-primario"
          [disabled]="guardando() || club.isLoading() || !club.hasValue()"
        >
          {{ guardando() ? 'Guardando…' : 'Guardar los datos' }}
        </button>
      </div>
    </form>
  `,
})
export class DatosDelClub {
  private readonly api = inject(AdminCanchas);

  protected readonly DATOS = DATOS;

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
  protected readonly guardado = signal(false);
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
    };
  }

  protected escribir(campo: keyof Formulario, valor: string): void {
    this.editado.update((actual) => ({ ...actual, [campo]: valor }));
    this.guardado.set(false);
  }

  protected async guardar(): Promise<void> {
    this.error.set(null);
    this.guardado.set(false);

    if (!this.formulario().nombre.trim()) {
      // El servidor también lo rechaza; acá se dice sin gastar el viaje.
      this.error.set('El club necesita un nombre.');
      return;
    }

    this.guardando.set(true);

    try {
      // Se manda el formulario entero y no solo lo tocado: son cinco campos de
      // texto y el endpoint es un PATCH, así que el ahorro no paga la rama extra.
      await this.api.fijarDatosDelClub(this.formulario());
      this.club.reload();
      this.editado.set({});
      this.guardado.set(true);
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla, 'No se pudieron guardar los datos.'));
    } finally {
      this.guardando.set(false);
    }
  }
}
