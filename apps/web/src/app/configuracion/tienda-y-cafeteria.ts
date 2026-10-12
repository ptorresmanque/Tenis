import { Component, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  AdminCanchas,
  TiendaYCafeteria,
} from '../catalogo-canchas/admin/admin-canchas.service';
import { Club } from '../club/club.service';
import { mensajeDelServidor } from '../core/errores';
import { Aviso } from '../ui/aviso';
import { Campo, CampoControl } from '../ui/campo';
import { TelefonoDirective } from '../ui/telefono';

/**
 * Los dos lugares, con sus tres campos. El largo es el de la columna: `maxlength` no deja
 * pasarlo, y la API recorta igual por si acaso.
 */
const LUGARES = [
  {
    nombre: 'Tienda',
    descripcion: 'tiendaDescripcion' as const,
    horario: 'tiendaHorario' as const,
    whatsapp: 'tiendaWhatsapp' as const,
    queVende: 'Qué se vende: raquetas, cuerdas, zapatillas, ropa.',
  },
  {
    nombre: 'Cafetería',
    descripcion: 'cafeteriaDescripcion' as const,
    horario: 'cafeteriaHorario' as const,
    whatsapp: 'cafeteriaWhatsapp' as const,
    queVende: 'Qué se sirve: café, jugos, algo para comer.',
  },
];

const LARGO_DESCRIPCION = 600;
const LARGO_HORARIO = 120;

/**
 * La tienda y la cafetería del club (T184), como información para la portada y «El
 * club». El sitio no vende nada: eso es la Etapa 2.
 *
 * Pestaña aparte de «Textos del sitio» porque T185 le suma las fotos de cada lugar, que no
 * caben en un formulario de textos. Lo que se guarda acá se ve en el sitio sin recargar.
 */
@Component({
  selector: 'app-tienda-y-cafeteria',
  imports: [FormsModule, Aviso, Campo, CampoControl, TelefonoDirective],
  template: `
    <form class="grid max-w-xl gap-6" (ngSubmit)="guardar()">
      @if (configuracion.error()) {
        <app-aviso variante="error">
          No se pudo cargar la tienda y la cafetería. Reintenta en un momento.
        </app-aviso>
      }

      <p class="text-muted-foreground">
        Salen en la portada y en «El club». La que no tenga descripción no aparece.
      </p>

      @for (lugar of LUGARES; track lugar.nombre) {
        <fieldset class="grid gap-4 border-t border-border pt-4">
          <legend class="font-display text-sm font-bold tracking-wide uppercase">
            {{ lugar.nombre }}
          </legend>

          <!-- La cuenta va en la ayuda, que el lector lee al entrar al campo, y no en
               una región viva: esa hablaría con cada letra. -->
          <app-campo
            etiqueta="Descripción"
            [ayuda]="lugar.queVende + ' ' + quedan(lugar.descripcion, LARGO_DESCRIPCION)"
          >
            <textarea
              appCampoControl
              class="campo"
              [name]="lugar.descripcion"
              rows="4"
              [maxlength]="LARGO_DESCRIPCION"
              [ngModel]="formulario()[lugar.descripcion]"
              (ngModelChange)="escribir(lugar.descripcion, $event)"
            ></textarea>
          </app-campo>

          <app-campo
            etiqueta="Horario"
            ayuda="Como se dice en voz alta: «Lunes a sábado de 9:00 a 20:00»."
          >
            <input
              appCampoControl
              class="campo"
              [name]="lugar.horario"
              [maxlength]="LARGO_HORARIO"
              [ngModel]="formulario()[lugar.horario]"
              (ngModelChange)="escribir(lugar.horario, $event)"
            />
          </app-campo>

          <app-campo
            etiqueta="WhatsApp"
            ayuda="Los 9 dígitos, el +56 ya va. Si lo dejas en blanco, no hay botón para escribir."
          >
            <!-- El +56 fijo y solo los 9 dígitos (T121), como en «Datos del club». -->
            <span class="campo-con-prefijo">
              <span class="prefijo">+56</span>
              <input
                appCampoControl
                appTelefono
                class="campo"
                [name]="lugar.whatsapp"
                [ngModel]="formulario()[lugar.whatsapp]"
                (ngModelChange)="escribir(lugar.whatsapp, $event)"
              />
            </span>
          </app-campo>
        </fieldset>
      }

      @if (error(); as falla) {
        <app-aviso variante="error">{{ falla }}</app-aviso>
      } @else if (guardado()) {
        <app-aviso variante="exito">
          Guardado. La portada y «El club» ya lo muestran.
        </app-aviso>
      }

      <div>
        <button
          type="submit"
          class="boton boton-primario"
          [disabled]="guardando() || configuracion.isLoading() || !configuracion.hasValue()"
          [attr.aria-busy]="guardando()"
        >
          {{ guardando() ? 'Guardando…' : 'Guardar la tienda y la cafetería' }}
        </button>
      </div>
    </form>
  `,
})
export class TiendaYCafeteriaPanel {
  private readonly api = inject(AdminCanchas);
  /** Los datos que lee el sitio público, para que muestre lo recién guardado. */
  private readonly sitio = inject(Club);

  protected readonly LUGARES = LUGARES;
  protected readonly LARGO_DESCRIPCION = LARGO_DESCRIPCION;
  protected readonly LARGO_HORARIO = LARGO_HORARIO;

  protected readonly configuracion = resource({
    loader: () => this.api.configuracion(),
  });

  /**
   * Lo que hay en los campos. Arranca de lo guardado y no se sincroniza después: si se
   * recargara solo, pisaría lo que la persona está escribiendo.
   */
  protected readonly editado = signal<Partial<TiendaYCafeteria>>({});

  protected readonly guardando = signal(false);
  protected readonly guardado = signal(false);
  protected readonly error = signal<string | null>(null);

  protected formulario(): TiendaYCafeteria {
    const guardados = this.configuracion.hasValue() ? this.configuracion.value() : undefined;
    const valor = (campo: keyof TiendaYCafeteria) =>
      this.editado()[campo] ?? guardados?.[campo] ?? '';

    return {
      tiendaDescripcion: valor('tiendaDescripcion'),
      tiendaHorario: valor('tiendaHorario'),
      tiendaWhatsapp: valor('tiendaWhatsapp'),
      cafeteriaDescripcion: valor('cafeteriaDescripcion'),
      cafeteriaHorario: valor('cafeteriaHorario'),
      cafeteriaWhatsapp: valor('cafeteriaWhatsapp'),
    };
  }

  protected quedan(campo: keyof TiendaYCafeteria, largo: number): string {
    const quedan = largo - this.formulario()[campo].length;

    return quedan === 1 ? 'Queda 1 carácter.' : `Quedan ${quedan} caracteres.`;
  }

  protected escribir(campo: keyof TiendaYCafeteria, valor: string): void {
    this.editado.update((actual) => ({ ...actual, [campo]: valor }));
    this.guardado.set(false);
  }

  protected async guardar(): Promise<void> {
    this.error.set(null);
    this.guardado.set(false);
    this.guardando.set(true);

    try {
      // Los seis campos y no solo lo tocado, como «Datos del club»: el endpoint es un
      // PATCH y el ahorro no paga la rama extra.
      await this.api.fijarTiendaYCafeteria(this.formulario());
      this.configuracion.reload();
      this.sitio.recargar();
      this.editado.set({});
      this.guardado.set(true);
    } catch (falla) {
      this.error.set(
        mensajeDelServidor(falla, 'No se pudo guardar la tienda y la cafetería.'),
      );
    } finally {
      this.guardando.set(false);
    }
  }
}
