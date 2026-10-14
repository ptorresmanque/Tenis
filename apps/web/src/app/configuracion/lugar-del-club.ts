import { Component, computed, inject, input, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';

import {
  AdminCanchas,
  Lugar,
  LugaresDelClub,
} from '../catalogo-canchas/admin/admin-canchas.service';
import { Club } from '../club/club.service';
import { mensajeDelServidor } from '../core/errores';
import { Aviso } from '../ui/aviso';
import { Campo, CampoControl } from '../ui/campo';
import { TelefonoDirective } from '../ui/telefono';
import { FotosDelClubPanel } from './fotos-del-club';
import { TarifasDelGimnasio } from './tarifas-del-gimnasio';

/**
 * Cada lugar con sus tres campos. El largo es el de la columna: `maxlength` no deja
 * pasarlo, y la API recorta igual por si acaso.
 */
const LUGARES: Record<
  Lugar,
  {
    descripcion: keyof LugaresDelClub;
    horario: keyof LugaresDelClub;
    whatsapp: keyof LugaresDelClub;
    queHay: string;
    /** "la tienda": para los mensajes y el botón. */
    conArticulo: string;
  }
> = {
  TIENDA: {
    descripcion: 'tiendaDescripcion',
    horario: 'tiendaHorario',
    whatsapp: 'tiendaWhatsapp',
    queHay: 'Qué se vende: raquetas, cuerdas, zapatillas, ropa.',
    conArticulo: 'la tienda',
  },
  CAFETERIA: {
    descripcion: 'cafeteriaDescripcion',
    horario: 'cafeteriaHorario',
    whatsapp: 'cafeteriaWhatsapp',
    queHay: 'Qué se sirve: café, jugos, algo para comer.',
    conArticulo: 'la cafetería',
  },
  GIMNASIO: {
    descripcion: 'gimnasioDescripcion',
    horario: 'gimnasioHorario',
    whatsapp: 'gimnasioWhatsapp',
    queHay: 'Qué hay: máquinas, pesas, clases de preparación física.',
    conArticulo: 'el gimnasio',
  },
};

const LARGO_DESCRIPCION = 600;
const LARGO_HORARIO = 120;

/**
 * Un lugar del club —la tienda, la cafetería o el gimnasio— como información para la
 * portada y «El club» (T184, T236). El sitio no vende nada: eso es la Etapa 2.
 *
 * **Un componente para las tres pestañas**: el lugar llega por los datos de la ruta, y lo
 * que cambia de uno a otro son sus columnas. El gimnasio suma el cupo de una clase grupal
 * y el editor de sus tarifas. Lo que se guarda acá se ve en el sitio sin recargar.
 */
@Component({
  selector: 'app-lugar-del-club',
  imports: [
    MatButton,
    FormsModule,
    Aviso,
    Campo,
    CampoControl,
    TelefonoDirective,
    FotosDelClubPanel,
    TarifasDelGimnasio,
  ],
  template: `
    <form class="grid max-w-xl gap-6" (ngSubmit)="guardar()">
      @if (configuracion.error()) {
        <app-aviso variante="error">
          No se pudo cargar {{ datos().conArticulo }}. Reintenta en un momento.
        </app-aviso>
      }

      <p class="text-muted-foreground">
        Sale en la portada y en «El club». Sin descripción no aparece.
      </p>

      <!-- La cuenta va en la ayuda, que el lector lee al entrar al campo, y no en una
           región viva: esa hablaría con cada letra. -->
      <app-campo
        etiqueta="Descripción"
        [ayuda]="datos().queHay + ' ' + quedan(datos().descripcion, LARGO_DESCRIPCION)"
      >
        <textarea
          appCampoControl
          class="campo"
          name="descripcion"
          rows="4"
          [maxlength]="LARGO_DESCRIPCION"
          [ngModel]="valor(datos().descripcion)"
          (ngModelChange)="escribir(datos().descripcion, $event)"
        ></textarea>
      </app-campo>

      <app-campo
        etiqueta="Horario"
        ayuda="Como se dice en voz alta: «Lunes a sábado de 9:00 a 20:00»."
      >
        <input
          appCampoControl
          class="campo"
          name="horario"
          [maxlength]="LARGO_HORARIO"
          [ngModel]="valor(datos().horario)"
          (ngModelChange)="escribir(datos().horario, $event)"
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
            name="whatsapp"
            [ngModel]="valor(datos().whatsapp)"
            (ngModelChange)="escribir(datos().whatsapp, $event)"
          />
        </span>
      </app-campo>

      @if (lugar() === 'GIMNASIO') {
        <!-- El tope de una clase grupal de preparación física (T231): el servidor rechaza
             una más grande. La individual es de un alumno y no lo usa. -->
        <app-campo
          etiqueta="Cupo de una clase grupal"
          ayuda="Cuántos alumnos caben como máximo, de 2 a 40."
        >
          <input
            appCampoControl
            class="campo w-28"
            type="number"
            name="cupoGrupal"
            min="2"
            max="40"
            [ngModel]="cupoGrupal()"
            (ngModelChange)="cupoEditado.set($event); guardado.set(false)"
          />
        </app-campo>
      }

      @if (error(); as falla) {
        <app-aviso variante="error">{{ falla }}</app-aviso>
      } @else if (guardado()) {
        <app-aviso variante="exito">Guardado. La portada y «El club» ya lo muestran.</app-aviso>
      }

      <div>
        <button
          matButton="filled"
          type="submit"
          [disabled]="guardando() || configuracion.isLoading() || !configuracion.hasValue()"
          [attr.aria-busy]="guardando()"
        >
          {{ guardando() ? 'Guardando…' : 'Guardar ' + datos().conArticulo }}
        </button>
      </div>
    </form>

    @if (lugar() === 'GIMNASIO') {
      <app-tarifas-del-gimnasio />
    }

    <app-fotos-del-club [lugar]="lugar()" />
  `,
})
export class LugarDelClubPanel {
  private readonly api = inject(AdminCanchas);
  /** Los datos que lee el sitio público, para que muestre lo recién guardado. */
  private readonly sitio = inject(Club);

  /** Llega por los datos de la ruta (A8). */
  readonly lugar = input.required<Lugar>();
  protected readonly datos = computed(() => LUGARES[this.lugar()]);

  protected readonly LARGO_DESCRIPCION = LARGO_DESCRIPCION;
  protected readonly LARGO_HORARIO = LARGO_HORARIO;

  protected readonly configuracion = resource({
    loader: () => this.api.configuracion(),
  });

  /**
   * Lo que hay en los campos. Arranca de lo guardado y no se sincroniza después: si se
   * recargara solo, pisaría lo que la persona está escribiendo.
   */
  protected readonly editado = signal<Partial<LugaresDelClub>>({});
  /** `undefined` es "no lo tocó"; nulo, que lo dejó vacío: eso viaja, y el servidor avisa. */
  protected readonly cupoEditado = signal<number | null | undefined>(undefined);

  protected readonly guardando = signal(false);
  protected readonly guardado = signal(false);
  protected readonly error = signal<string | null>(null);

  private guardados() {
    return this.configuracion.hasValue() ? this.configuracion.value() : undefined;
  }

  protected valor(campo: keyof LugaresDelClub): string {
    return this.editado()[campo] ?? this.guardados()?.[campo] ?? '';
  }

  protected cupoGrupal(): number | null {
    const editado = this.cupoEditado();

    return editado !== undefined ? editado : (this.guardados()?.gimnasioCupoGrupal ?? null);
  }

  protected quedan(campo: keyof LugaresDelClub, largo: number): string {
    const quedan = largo - this.valor(campo).length;

    return quedan === 1 ? 'Queda 1 carácter.' : `Quedan ${quedan} caracteres.`;
  }

  protected escribir(campo: keyof LugaresDelClub, valor: string): void {
    this.editado.update((actual) => ({ ...actual, [campo]: valor }));
    this.guardado.set(false);
  }

  protected async guardar(): Promise<void> {
    const { descripcion, horario, whatsapp, conArticulo } = this.datos();

    this.error.set(null);
    this.guardado.set(false);
    this.guardando.set(true);

    try {
      // Los campos del lugar y no solo lo tocado, como «Datos del club»: el endpoint es un
      // PATCH y el ahorro no paga la rama extra. Los de los otros lugares no viajan.
      await this.api.fijarLugar({
        [descripcion]: this.valor(descripcion),
        [horario]: this.valor(horario),
        [whatsapp]: this.valor(whatsapp),
        // El campo numérico ya entrega un número, o nulo si quedó vacío.
        ...(this.lugar() === 'GIMNASIO' ? { gimnasioCupoGrupal: this.cupoGrupal() } : {}),
      });
      this.configuracion.reload();
      this.sitio.recargar();
      this.editado.set({});
      this.cupoEditado.set(undefined);
      this.guardado.set(true);
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla, `No se pudo guardar ${conArticulo}.`));
    } finally {
      this.guardando.set(false);
    }
  }
}
