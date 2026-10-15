import { Component, computed, inject, input, linkedSignal, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatRadioModule } from '@angular/material/radio';
import { MatIcon } from '@angular/material/icon';
import { MatButton } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { MatSelectModule } from '@angular/material/select';

import { proveerCampos } from '../../ui/campos';
import { horaATexto, proveerFechaYHora, textoAHora } from '../../ui/fecha-y-hora';
import { HoraAfectada } from '../../catalogo-canchas/admin/admin-canchas.service';
import { Disponibilidad } from '../../catalogo-canchas/disponibilidad';
import { SelectorDeDia } from '../../catalogo-canchas/grilla/selector-de-dia';
import { diaDeLaUrl, horaEnElClub } from '../../catalogo-canchas/reloj-del-club';
import { Auth } from '../../core/auth/auth';
import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { ClaseNueva, Clases, NivelClase, NIVELES, TipoClase } from '../clases.service';
import { Profesores } from '../profesores.service';
import { NuevaSerie } from './nueva-serie';
import { LO_HECHO } from '../../ui/material';

/** El formulario vacío. Función y no constante, para no compartir el objeto. */
const enBlanco = () => ({
  tipo: 'TENIS' as TipoClase,
  /** Solo en el gimnasio: la individual es de un alumno y no pregunta el cupo (T233). */
  modalidad: 'grupal' as 'grupal' | 'individual',
  canchaId: 0,
  profesorId: 0,
  /** Como las entrega el selector de Material, y a texto al agendar (A5, T244). */
  horaDesde: textoAHora('18:00'),
  horaHasta: textoAHora('19:00'),
  cupoMaximo: 6,
  nivel: 'INICIACION' as NivelClase,
  notas: '',
});

/**
 * Agendar una clase o una serie (T294, SPEC-panel.md D7), en su página. Antes los dos
 * formularios iban al final de la agenda de clases, debajo de todas las clases del día. Se llega
 * con el FAB «Agendar» de Clases, que trae el día en `?fecha=`, y al agendar se vuelve a ese
 * día. El profesor llega igual y agenda a su nombre (T222).
 *
 * **Agendar una clase cierra la cancha**, y por eso esta página pregunta antes de confirmar
 * cuando hay horas tomadas debajo: es la misma operación que el cierre por mantención y merece
 * la misma advertencia. Lo que se confirma no es "¿seguro?", es la lista de a quién se le quita
 * la hora.
 */
@Component({
  selector: 'app-agendar-clase',
  imports: [
    MatRadioModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInput,
    MatTimepickerModule,
    MatButton,
    MatButtonToggleModule,
    MatIcon,
    FormsModule,
    RouterLink,
    Aviso,
    NuevaSerie,
    SelectorDeDia,
  ],
  providers: [proveerCampos(), proveerFechaYHora()],
  template: `
    <a
      routerLink="/administracion/clases"
      [queryParams]="{ fecha: dia() }"
      class="text-sm font-semibold text-primary"
    >
      <mat-icon class="align-middle text-base" aria-hidden="true">arrow_back</mat-icon>
      Clases
    </a>

    <header class="cabecera-panel mt-2">
      <div>
        <h1 class="titular text-4xl">Agendar</h1>
      </div>
    </header>

    <mat-button-toggle-group
      class="mt-4"
      aria-label="Qué se agenda"
      hideSingleSelectionIndicator
      [value]="modo()"
      (change)="modo.set($event.value)"
    >
      <mat-button-toggle value="clase">Una clase</mat-button-toggle>
      <mat-button-toggle value="serie">Una serie</mat-button-toggle>
    </mat-button-toggle-group>

    @if (error(); as falla) {
      <app-aviso variante="error" class="mt-4 block">{{ falla }}</app-aviso>
    }

    @if (modo() === 'clase') {
      <!-- El día de la clase, el que traía Clases: se puede cambiar acá sin volver. La serie
           no lo usa: elige sus propias fechas. -->
      <app-selector-de-dia [(fecha)]="dia" />

      <form class="mt-4 rounded-xl border border-border bg-card p-4 shadow-sm" (ngSubmit)="agendar()">
        <p class="text-sm text-muted-foreground">
          @if (datos.tipo === 'PREPARACION_FISICA') {
            En el gimnasio: no cierra ninguna cancha. Es una clase a la vez, y si se cruza con
            otra te lo decimos.
          } @else if (profesorFijo() === null) {
            La cancha queda cerrada esa hora. Si hay reservas debajo, te las mostramos antes de
            confirmar.
          } @else {
            La cancha queda cerrada esa hora, a tu nombre. Solo en horas libres: si hay
            reservas, habla con administración.
          }
        </p>

        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <!-- T233. Primero el tipo: la clase del gimnasio no lleva cancha ni nivel. -->
          <div class="sm:col-span-2">
            <span id="tipo-de-clase" class="text-sm font-medium">Tipo de clase</span>
            <mat-radio-group
              class="mt-1 flex flex-wrap gap-x-4"
              name="tipo"
              aria-labelledby="tipo-de-clase"
              [(ngModel)]="datos.tipo"
            >
              <mat-radio-button value="TENIS">Tenis</mat-radio-button>
              <mat-radio-button value="PREPARACION_FISICA">Preparación física</mat-radio-button>
            </mat-radio-group>
          </div>

          @if (datos.tipo === 'TENIS') {
            <mat-form-field>
              <mat-label>Cancha</mat-label>
              <mat-select name="canchaId" [(ngModel)]="datos.canchaId">
                <mat-option [value]="0" disabled>Elige una cancha</mat-option>
                @for (cancha of canchasActivas(); track cancha.id) {
                  <mat-option [value]="cancha.id">{{ cancha.nombre }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          }

          <!-- El profesor agenda a su nombre (T222): no elige. -->
          @if (profesorFijo() === null) {
            <div>
              <mat-form-field class="w-full">
                <mat-label>Profesor</mat-label>
                <mat-select name="profesorId" [(ngModel)]="datos.profesorId">
                  <mat-option [value]="0" disabled>Elige un profesor</mat-option>
                  @if (profesores.hasValue()) {
                    @for (profesor of profesores.value(); track profesor.id) {
                      <mat-option [value]="profesor.id">
                        {{ profesor.nombreVisible }} · {{ profesor.especialidad }}
                      </mat-option>
                    }
                  }
                </mat-select>
              </mat-form-field>
              <!-- Debajo del campo y no en su mat-hint: el color del error lo pisaría Material. -->
              @if (profesores.error()) {
                <p class="text-sm text-destructive">No se pudieron cargar los profesores.</p>
              } @else if (profesores.value().length === 0) {
                <p class="text-sm text-muted-foreground">
                  No hay profesores activos: anota uno primero.
                </p>
              }
            </div>
          }

          <mat-form-field class="w-36">
            <mat-label>Desde</mat-label>
            <input
              matInput
              id="clase-hora-desde"
              name="horaDesde"
              placeholder="hh:mm"
              autocomplete="off"
              [matTimepicker]="relojHoraDesde"
              [(ngModel)]="datos.horaDesde"
            />
            <mat-timepicker-toggle matIconSuffix aria-label="Elegir la hora" [for]="relojHoraDesde" />
            <mat-timepicker #relojHoraDesde />
          </mat-form-field>

          <mat-form-field class="w-36">
            <mat-label>Hasta</mat-label>
            <input
              matInput
              id="clase-hora-hasta"
              name="horaHasta"
              placeholder="hh:mm"
              autocomplete="off"
              [matTimepicker]="relojHoraHasta"
              [(ngModel)]="datos.horaHasta"
            />
            <mat-timepicker-toggle matIconSuffix aria-label="Elegir la hora" [for]="relojHoraHasta" />
            <mat-timepicker #relojHoraHasta />
          </mat-form-field>

          @if (datos.tipo === 'TENIS') {
            <mat-form-field>
              <mat-label>Nivel</mat-label>
              <mat-select name="nivel" [(ngModel)]="datos.nivel">
                @for (opcion of opcionesDeNivel; track opcion.valor) {
                  <mat-option [value]="opcion.valor">{{ opcion.etiqueta }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          } @else {
            <!-- Grupal hasta el cupo que configura el club; el servidor rechaza uno mayor. -->
            <div>
              <span id="modalidad-de-clase" class="text-sm font-medium">Modalidad</span>
              <mat-radio-group
                class="mt-1 flex flex-wrap gap-x-4"
                name="modalidad"
                aria-labelledby="modalidad-de-clase"
                [(ngModel)]="datos.modalidad"
              >
                <mat-radio-button value="grupal">Grupal</mat-radio-button>
                <mat-radio-button value="individual">Individual</mat-radio-button>
              </mat-radio-group>
            </div>
          }

          @if (datos.tipo === 'TENIS' || datos.modalidad === 'grupal') {
            <mat-form-field>
              <mat-label>Cupo</mat-label>
              <input
                matInput
                type="number"
                name="cupoMaximo"
                [min]="datos.tipo === 'TENIS' ? 1 : 2"
                max="40"
                [(ngModel)]="datos.cupoMaximo"
              />
            </mat-form-field>
          }

          <mat-form-field class="sm:col-span-2">
            <mat-label>Notas</mat-label>
            <input
              matInput
              name="notas"
              placeholder="Opcional: qué se trabaja, qué llevar"
              [(ngModel)]="datos.notas"
            />
          </mat-form-field>
        </div>

        <!-- Confirmar es un segundo paso, en su recuadro; candidato a MatDialog en los diálogos.
             mat-guidelines-ignore: multiples-filled -->
        <button
          matButton="filled"
          type="submit"
          class="mt-3"
          [attr.aria-busy]="enCurso() === 'agendar'"
          [disabled]="trabajando()"
        >
          Agendar clase
        </button>
      </form>

      <!-- El segundo paso, y solo cuando hay algo que perder: agendar sobre una hora
           libre no pregunta nada. Lo que se confirma es esta lista. -->
      @if (porConfirmar(); as afectadas) {
        <!-- El profesor no cancela reservas (T219): en vez de la confirmación, el aviso,
             en el mismo lugar para que se vea junto al formulario. -->
        @if (profesorFijo() !== null) {
          <app-aviso variante="error" class="mt-3 block">
            Esta hora tiene reservas. Para agendar encima, habla con administración.
          </app-aviso>
        } @else {
        <div
          role="alertdialog"
          aria-labelledby="titulo-clase"
          class="mt-3 rounded-xl border border-destructive bg-card p-4 text-sm"
        >
          <h3 id="titulo-clase" class="font-display font-semibold text-destructive">
            Hay {{ afectadas.length }}
            {{ afectadas.length === 1 ? 'hora tomada' : 'horas tomadas' }} en ese rango
          </h3>
          <p class="mt-1 text-muted-foreground">
            Si agendas la clase se cancelan y avisamos por correo. A quien pagó se le devuelve todo.
            <strong>Cancelar la clase después no las devuelve.</strong>
          </p>

          <ul class="mt-2 grid gap-1">
            @for (tomada of afectadas; track tomada.id) {
              <li>
                <span class="font-medium"> {{ hora(tomada.inicio) }}–{{ hora(tomada.fin) }} </span>
                · {{ tomada.nombre }}
                @if (tomada.pagoEnCurso) {
                  <span class="text-destructive">
                    (pagándose ahora, no se puede agendar todavía)
                  </span>
                } @else if (tomada.pagada) {
                  <span class="text-destructive">(pagada, se devuelve)</span>
                } @else if (tomada.esSocio) {
                  <span class="text-muted-foreground">(socio, recupera su cupo)</span>
                }
              </li>
            }
          </ul>

          <div class="mt-3 flex flex-wrap gap-2">
            <button
              matButton="filled"
              type="button"
              class="peligro chico"
              [disabled]="trabajando() || hayPagoEnCurso()"
              [attr.aria-busy]="enCurso() === 'confirmar'"
              (click)="confirmar()"
            >
              Agendar igual y avisarles
            </button>
            <button
              matButton
              type="button"
              class="chico"
              (click)="porConfirmar.set(null)"
            >
              Mejor no
            </button>
          </div>
        </div>
        }
      }
    } @else {
      <!-- La serie (T115), en su propio componente: escribirla, revisarla fecha por fecha
           y agendarla son tres pasos que no caben en el formulario de la clase suelta. -->
      <app-nueva-serie
        class="mt-4 block"
        [canchas]="canchasActivas()"
        [profesores]="profesores.hasValue() ? profesores.value() : []"
        [profesorFijo]="profesorFijo()"
        (agendada)="serieAgendada($event)"
      />
    }
  `,
})
export class AgendarClase {
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly api = inject(Clases);
  private readonly profes = inject(Profesores);
  private readonly disponibilidad = inject(Disponibilidad);
  private readonly usuario = inject(Auth).usuario;

  /** El día que trae Clases en `?fecha=` (T294); sin él, hoy. */
  readonly fecha = input<string>();
  protected readonly dia = linkedSignal(() => diaDeLaUrl(this.fecha()));

  /** Una clase suelta o una serie: los dos formularios de antes, uno a la vez. */
  protected readonly modo = signal<'clase' | 'serie'>('clase');

  /**
   * El profesor que no es admin agenda a su nombre (T222): sin selector, sin pedir las
   * fichas de los demás, y solo en horas libres. `null` para el admin, que elige.
   */
  protected readonly profesorFijo = computed(() => {
    const yo = this.usuario();
    return yo && !yo.esAdmin ? yo.profesorId : null;
  });

  protected datos = enBlanco();

  protected readonly trabajando = signal(false);
  /** Qué acción está viajando, para que gire su botón y no todos (T154). */
  protected readonly enCurso = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  /** Las horas que la clase se llevaría por delante, ya vistas por el admin. */
  protected readonly porConfirmar = signal<HoraAfectada[] | null>(null);

  /** Solo para el admin: al profesor el servidor no le muestra las fichas de los demás. */
  protected readonly profesores = resource({
    params: () => (this.profesorFijo() === null ? true : undefined),
    loader: () => this.profes.listar(true),
    defaultValue: [],
  });

  /** La lista pública, la misma para el admin y el profesor (T222). */
  protected readonly canchas = resource({
    loader: () => this.disponibilidad.canchas(),
    defaultValue: [],
  });

  /**
   * Solo las activas, y ya vienen así: la lista pública no trae las desactivadas, que
   * no tienen grilla y el servidor rechazaría siempre.
   */
  protected readonly canchasActivas = computed(() =>
    this.canchas.hasValue() ? this.canchas.value() : [],
  );

  protected readonly opcionesDeNivel = Object.entries(NIVELES).map(([valor, etiqueta]) => ({
    valor,
    etiqueta,
  }));

  /** Con un pago abierto el servidor no deja agendar, y el botón lo dice antes. */
  protected readonly hayPagoEnCurso = computed(() =>
    (this.porConfirmar() ?? []).some((hora) => hora.pagoEnCurso),
  );

  protected readonly hora = horaEnElClub;

  /**
   * Primer paso: mira a quién afecta.
   *
   * Sin nadie debajo, agenda de una: preguntar por preguntar entrena a la gente a
   * apretar sin leer, y entonces la advertencia que importa tampoco se lee.
   */
  protected async agendar(): Promise<void> {
    this.porConfirmar.set(null);
    await this.intentar('agendar', async () => {
      const { afectadas } = await this.api.simular(this.formulario());

      if (afectadas.length === 0) {
        await this.crear();
        return;
      }

      // Al profesor, el aviso y no la confirmación: no cancela reservas (T219), y el
      // servidor lo rechazaría igual.
      this.porConfirmar.set(afectadas);
    });
  }

  /** Segundo paso: el admin ya vio a quién deja sin hora. */
  protected async confirmar(): Promise<void> {
    await this.intentar('confirmar', () => this.crear());
  }

  /** La serie quedó agendada: se dice cuánto y se vuelve al día. */
  protected serieAgendada(resumen: string): void {
    this.snackBar.open(resumen, undefined, LO_HECHO);
    this.volver();
  }

  private async crear(): Promise<void> {
    const clase = this.formulario();
    const { canceladas } = await this.api.agendar(clase);

    this.snackBar.open(agendada(clase, canceladas.length), undefined, LO_HECHO);
    this.volver();
  }

  /** A Clases, en el día de la clase: es donde aparece. */
  private volver(): void {
    void this.router.navigate(['/administracion/clases'], { queryParams: { fecha: this.dia() } });
  }

  private formulario(): ClaseNueva {
    const ficha = {
      // Los `select` devuelven texto aunque el valor sea un número.
      profesorId: this.profesorFijo() ?? Number(this.datos.profesorId),
      fecha: this.dia(),
      horaDesde: horaATexto(this.datos.horaDesde),
      horaHasta: horaATexto(this.datos.horaHasta),
      notas: this.datos.notas,
    };

    if (this.datos.tipo === 'PREPARACION_FISICA') {
      return {
        ...ficha,
        tipo: 'PREPARACION_FISICA',
        cupoMaximo: this.datos.modalidad === 'individual' ? 1 : Number(this.datos.cupoMaximo),
      };
    }

    return {
      ...ficha,
      tipo: 'TENIS',
      canchaId: Number(this.datos.canchaId),
      nivel: this.datos.nivel,
      cupoMaximo: Number(this.datos.cupoMaximo),
    };
  }

  private async intentar(clave: string, accion: () => Promise<void>): Promise<void> {
    this.error.set(null);
    this.trabajando.set(true);
    this.enCurso.set(clave);

    try {
      await accion();
    } catch (falla) {
      // El del servidor: dice si la hora no existe en la grilla, si la cancha ya
      // estaba cerrada o si el profesor está desactivado.
      this.error.set(mensajeDelServidor(falla, 'No se pudo agendar la clase.'));
    } finally {
      this.trabajando.set(false);
      this.enCurso.set(null);
    }
  }
}

/** Lo que se dice al agendar: dónde quedó la clase y a cuántos se avisó. */
function agendada(clase: ClaseNueva, canceladas: number): string {
  if (clase.tipo === 'PREPARACION_FISICA') return 'Clase agendada en el gimnasio.';
  if (canceladas === 0) return 'Clase agendada. La cancha queda cerrada esa hora.';

  return canceladas === 1
    ? 'Clase agendada. Avisamos a la persona que tenía esa hora.'
    : `Clase agendada. Avisamos a las ${canceladas} personas que tenían esa hora.`;
}
