import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatAutocompleteModule, MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { MatButton } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';

import { proveerCampos } from '../ui/campos';
import { AcompananteNuevo, SocioDelDirectorio } from './reservas.service';

/** El mismo tope que la API (`MAXIMO_ACOMPANANTES` en `reservas.dto.ts`, T105). */
export const MAXIMO_ACOMPANANTES = 3;

/**
 * «Con quién juega», de 1 a 3 personas (T107, T280): el mismo campo en la reserva del sitio y en
 * la del mesón (T388). Antes, el del mesón era un texto libre que mandaba a cualquiera como
 * invitado, y un socio escrito ahí le gastaba al titular una reserva con invitados del mes.
 *
 * Con sugerencias, ofrece los socios que recibe, con su número porque dos pueden llamarse igual,
 * y los invitados anteriores; lo que no está en ninguna lista queda como invitado nuevo. Sin
 * ellas (el visitante del sitio), solo nombres. Los que ya se agregaron son chips con cómo se
 * leyó cada nombre: un socio escrito a mano que quedó como invitado se corrige acá, antes de
 * gastar cupo.
 *
 * Quien lo usa llama a `agregarLoEscrito()` antes de enviar: «Agregar» es un paso que se salta
 * fácil, y lo escrito a la vista también cuenta.
 */
@Component({
  selector: 'app-campo-de-acompanantes',
  // El autocompletar antes que los chips: así Enter con una sugerencia marcada la agrega a ella
  // (lineamientos de Angular Material, chips).
  imports: [MatAutocompleteModule, MatChipsModule, MatFormFieldModule, MatButton, MatIcon],
  providers: [proveerCampos()],
  host: { class: 'block' },
  template: `
    <!-- Enter agrega y no envía: con el formulario, Enter reservaba con la mitad escrita. El botón
         baja de línea antes que apretar el campo: en el teléfono, un chip angosto cortaba justo
         «socio N.º …» o «invitado», que es lo que se revisa. -->
    <div class="flex flex-wrap items-start gap-x-2">
      <mat-form-field class="min-w-64 flex-1">
        <mat-label>{{ etiquetaDelCampo() }}</mat-label>
        <mat-chip-grid #listaDeChips [attr.aria-label]="nombreDeLaLista()">
          @for (acompanante of acompanantes(); track $index) {
            <mat-chip-row (removed)="quitar($index)">
              {{ etiqueta(acompanante) }}
              <button matChipRemove [attr.aria-label]="'Quitar a ' + etiqueta(acompanante)">
                <mat-icon aria-hidden="true">cancel</mat-icon>
              </button>
            </mat-chip-row>
          }
        </mat-chip-grid>
        <!-- Hermano de la grilla y no adentro (lineamientos de Material, chips), con el mismo
             nombre que se ve: la etiqueta del campo nombra la grilla. Sin corrector: se buscan
             nombres, no se escribe prosa (modern-web-guidance, forms). -->
        <input
          #campo
          id="acompanante"
          name="acompanante"
          autocomplete="off"
          autocorrect="off"
          spellcheck="false"
          [attr.aria-label]="etiquetaDelCampo()"
          [placeholder]="conSugerencias() ? 'Nombre y apellido' : ''"
          [matChipInputFor]="listaDeChips"
          [matAutocomplete]="sugeridas"
          [matAutocompleteDisabled]="!conSugerencias()"
          [disabled]="acompanantes().length >= maximo"
          [value]="porAgregar()"
          (input)="porAgregar.set($any($event.target).value)"
          (matChipInputTokenEnd)="alApretarEnter()"
        />
        <mat-autocomplete #sugeridas="matAutocomplete" (optionSelected)="elegir($event.option.value)">
          <!-- Sin «Sin resultados» (T388): acá un nombre que no está en la lista no es un error,
               es un invitado nuevo, y el panel abierto con esa opción tapaba «Agregar» en el
               diálogo angosto del sitio. Sin coincidencias, el panel se cierra y queda el botón. -->
          @for (sugerencia of filtradas(); track sugerencia.valor) {
            <mat-option [value]="sugerencia.valor"
              >{{ sugerencia.valor
              }}<span class="text-muted-foreground"> · {{ sugerencia.tipo }}</span></mat-option
            >
          }
        </mat-autocomplete>
      </mat-form-field>
      @if (acompanantes().length < maximo) {
        <button
          matButton="outlined"
          type="button"
          class="mt-2"
          [disabled]="porAgregar().trim() === ''"
          (click)="agregar()"
        >
          Agregar
        </button>
      }
    </div>
    @if (acompanantes().length >= maximo) {
      <p class="text-sm text-muted-foreground">Listo: {{ maximo }} es el máximo por reserva.</p>
    }
  `,
})
export class CampoDeAcompanantes {
  /** Los socios que se sugieren. Quien lo usa deja fuera al titular. */
  readonly socios = input<readonly SocioDelDirectorio[]>([]);
  /** Los nombres que el titular declaró en reservas anteriores (T106). */
  readonly invitados = input<readonly string[]>([]);
  /** Sin sugerencias (el visitante del sitio): no ve el padrón, y escribe solo nombres. */
  readonly conSugerencias = input(true);
  /** El nombre de la lista de chips, para quien no la ve: a quién acompañan. */
  readonly nombreDeLaLista = input('Quienes juegan contigo');

  readonly acompanantes = model<AcompananteNuevo[]>([]);
  /** Se llenaron los tres: quien lo usa lleva el foco a su botón de enviar. */
  readonly completo = output<void>();

  protected readonly porAgregar = signal('');
  protected readonly maximo = MAXIMO_ACOMPANANTES;

  private readonly campo = viewChild<ElementRef<HTMLInputElement>>('campo');
  private readonly disparador = viewChild(MatAutocompleteTrigger);
  private readonly injector = inject(Injector);

  /** A la vista (T107): en el formulario del visitante, que ya tiene su «Nombre», no decía de quién. */
  protected readonly etiquetaDelCampo = computed(() =>
    this.conSugerencias() ? 'Nombre de un socio o de un invitado' : 'Nombre de quien juega contigo',
  );

  /** Los socios que todavía no están en la lista: agregar dos veces al mismo no es válido. */
  private readonly sociosDisponibles = computed(() => {
    const puestos = new Set(
      this.acompanantes()
        .map((acompanante) => acompanante.numeroSocio)
        .filter((numero) => numero !== undefined),
    );

    return this.socios().filter((socio) => !puestos.has(socio.numeroSocio));
  });

  /** Lo que sugiere el campo: los socios que quedan y los invitados anteriores que faltan. */
  private readonly sugerencias = computed(() => {
    const puestos = new Set(
      this.acompanantes().flatMap(({ nombre }) => (nombre ? [clave(nombre)] : [])),
    );

    return [
      ...this.sociosDisponibles().map((socio) => ({
        valor: comoSugerencia(socio),
        tipo: 'Socio del club',
      })),
      ...this.invitados()
        .filter((nombre) => !puestos.has(clave(nombre)))
        .map((nombre) => ({ valor: nombre, tipo: 'Invitado anterior' })),
    ];
  });

  /**
   * Las sugerencias que calzan con lo escrito (T280): el autocompletar de Material muestra lo que
   * se le da. Sin tildes ni mayúsculas, como se comparan los nombres al agregarlos.
   */
  protected readonly filtradas = computed(() => {
    const escrito = clave(this.porAgregar());

    return escrito === ''
      ? this.sugerencias()
      : this.sugerencias().filter(({ valor }) => clave(valor).includes(escrito));
  });

  /** Lo que quedó escrito sin apretar «Agregar»: también cuenta al enviar. */
  agregarLoEscrito(): void {
    if (this.porAgregar().trim() !== '') this.agregar();
  }

  /**
   * Agrega lo escrito: el socio que nombra, si nombra a uno, y si no, un invitado. Después el foco
   * vuelve al campo para el siguiente; si ya son tres, quien lo usa decide a dónde va.
   */
  protected agregar(): void {
    const valor = this.porAgregar().trim().replace(/\s+/g, ' ');
    if (valor === '' || this.acompanantes().length >= MAXIMO_ACOMPANANTES) return;

    const socio = this.conSugerencias() ? this.socioQueNombra(valor) : undefined;

    this.acompanantes.update((lista) => [
      ...lista,
      socio ? { numeroSocio: socio.numeroSocio } : { nombre: valor },
    ]);
    this.porAgregar.set('');
    // A mano y no solo con la señal: si ya estaba vacía, el campo se quedaría con el texto de la
    // sugerencia que el autocompletar escribió.
    const campo = this.campo()?.nativeElement;
    if (campo) campo.value = '';

    if (this.acompanantes().length >= MAXIMO_ACOMPANANTES) {
      this.completo.emit();
    } else {
      afterNextRender(() => campo?.focus(), { injector: this.injector });
    }
  }

  /** La sugerencia elegida, con el mouse o con las flechas y Enter. */
  protected elegir(valor: string): void {
    this.porAgregar.set(valor);
    this.agregar();
  }

  /**
   * Enter en el campo. Si había una sugerencia marcada con las flechas, la agrega el
   * autocompletar (`elegir`): agregar también lo escrito metería «ana» como invitada, además de
   * la socia elegida. Quién atiende Enter primero depende del orden de los imports; con esta
   * guarda, el resultado no.
   */
  protected alApretarEnter(): void {
    if (this.disparador()?.activeOption) return;
    this.agregar();
  }

  /**
   * El socio que lo escrito nombra: el de la sugerencia elegida, o el único que se llama así.
   * Escrito a mano sigue siendo socio: como invitado le gastaría cupo por alguien que no lo
   * gasta. Si dos se llaman igual, sin el número no se sabe cuál, y queda como invitado a la
   * vista de la lista para corregirlo.
   */
  private socioQueNombra(valor: string): SocioDelDirectorio | undefined {
    const disponibles = this.sociosDisponibles();
    const elegido = disponibles.find((socio) => comoSugerencia(socio) === valor);
    if (elegido) return elegido;

    const homonimos = disponibles.filter((socio) => clave(socio.nombre) === clave(valor));

    return homonimos.length === 1 ? homonimos[0] : undefined;
  }

  protected quitar(indice: number): void {
    this.acompanantes.update((lista) => lista.filter((_, i) => i !== indice));
  }

  /**
   * Cómo se lee un acompañante ya agregado. Al socio se lo nombra con su número; al invitado se lo
   * marca, para que se vea cómo quedó leído lo que se escribió.
   */
  protected etiqueta(acompanante: AcompananteNuevo): string {
    if (!acompanante.numeroSocio) {
      return this.conSugerencias()
        ? `${acompanante.nombre} · invitado`
        : (acompanante.nombre ?? '');
    }

    const socio = this.socios().find(
      (candidato) => candidato.numeroSocio === acompanante.numeroSocio,
    );

    return socio
      ? `${socio.nombre} · socio N.º ${acompanante.numeroSocio}`
      : `Socio N.º ${acompanante.numeroSocio}`;
  }
}

/** Cómo se sugiere un socio: con su número, porque dos pueden llamarse igual. */
function comoSugerencia(socio: SocioDelDirectorio): string {
  return `${socio.nombre} · N.º ${socio.numeroSocio}`;
}

/** Un nombre sin mayúsculas, tildes ni espacios de más, para compararlo con otro. */
export function clave(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es')
    .trim()
    .replace(/\s+/g, ' ');
}
