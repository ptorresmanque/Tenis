import { Component, computed, inject, input, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';

import { errorDelCampo, proveerCampos } from '../ui/campos';
import {
  AdminCanchas,
  Lugar,
  LugaresDelClub,
} from '../catalogo-canchas/admin/admin-canchas.service';
import { Club } from '../club/club.service';
import { mensajeDelServidor } from '../core/errores';
import { Aviso } from '../ui/aviso';
import { TelefonoDirective } from '../ui/telefono';
import { FotosDelClubPanel } from './fotos-del-club';
import { TarifasDelGimnasio } from './tarifas-del-gimnasio';
import { LO_HECHO } from '../ui/material';

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
 * **Un componente para los tres lugares**: el lugar llega como input, desde su panel en la
 * pestaña «Servicios» (T290), y lo que cambia de uno a otro son sus columnas. El gimnasio suma el cupo de una clase grupal
 * y el editor de sus tarifas. Lo que se guarda acá se ve en el sitio sin recargar.
 */
@Component({
  selector: 'app-lugar-del-club',
  imports: [
    MatFormFieldModule,
    MatInput,
    MatButton,
    FormsModule,
    Aviso,
    TelefonoDirective,
    FotosDelClubPanel,
    TarifasDelGimnasio,
  ],
  providers: [proveerCampos()],
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
      <mat-form-field>
        <mat-label>Descripción</mat-label>
        <textarea
          matInput
          name="descripcion"
          rows="4"
          [maxlength]="LARGO_DESCRIPCION"
          [ngModel]="valor(datos().descripcion)"
          (ngModelChange)="escribir(datos().descripcion, $event)"
        ></textarea>
        <mat-hint>
          {{ datos().queHay + ' ' + quedan(datos().descripcion, LARGO_DESCRIPCION) }}
        </mat-hint>
      </mat-form-field>

      <mat-form-field>
        <mat-label>Horario</mat-label>
        <input
          matInput
          name="horario"
          [maxlength]="LARGO_HORARIO"
          [ngModel]="valor(datos().horario)"
          (ngModelChange)="escribir(datos().horario, $event)"
        />
        <mat-hint>Como se dice en voz alta: «Lunes a sábado de 9:00 a 20:00».</mat-hint>
      </mat-form-field>

      <mat-form-field>
        <mat-label>WhatsApp</mat-label>
        <!-- El +56 fijo y solo los 9 dígitos (T121), como en «Datos del club». -->
        <span matTextPrefix>+56&nbsp;</span>
        <input
          matInput
          appTelefono
          #telefono="ngModel"
          name="whatsapp"
          [ngModel]="valor(datos().whatsapp)"
          (ngModelChange)="escribir(datos().whatsapp, $event)"
        />
        <mat-error>{{ errorDelCampo(telefono.control) }}</mat-error>
        <mat-hint>
          Los 9 dígitos, el +56 ya va. Si lo dejas en blanco, no hay botón para escribir.
        </mat-hint>
      </mat-form-field>

      @if (lugar() === 'GIMNASIO') {
        <!-- El tope de una clase grupal de preparación física (T231): el servidor rechaza
             una más grande. La individual es de un alumno y no lo usa. -->
        <!-- El ancho en el campo y no en el input: el campo es de bloque y llenaría la fila. -->
        <mat-form-field class="w-56">
          <mat-label>Cupo de una clase grupal</mat-label>
          <input
            matInput
            type="number"
            name="cupoGrupal"
            min="2"
            max="40"
            [ngModel]="cupoGrupal()"
            (ngModelChange)="cupoEditado.set($event)"
          />
          <mat-hint>Cuántos alumnos caben como máximo, de 2 a 40.</mat-hint>
        </mat-form-field>
      }

      @if (error(); as falla) {
        <app-aviso variante="error">{{ falla }}</app-aviso>
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
  protected readonly errorDelCampo = errorDelCampo;

  private readonly snackBar = inject(MatSnackBar);
  private readonly api = inject(AdminCanchas);
  /** Los datos que lee el sitio público, para que muestre lo recién guardado. */
  private readonly sitio = inject(Club);

  /** Lo pasa su panel en «Servicios» (T290); hasta ahí llegaba por los datos de la ruta. */
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
  }

  protected async guardar(): Promise<void> {
    const { descripcion, horario, whatsapp, conArticulo } = this.datos();

    this.error.set(null);
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
      this.snackBar.open('Guardado. La portada y «El club» ya lo muestran.', undefined, LO_HECHO);
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla, `No se pudo guardar ${conArticulo}.`));
    } finally {
      this.guardando.set(false);
    }
  }
}
