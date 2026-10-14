import { Component, computed, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';

import { HoraAfectada } from '../../catalogo-canchas/admin/admin-canchas.service';
import { Disponibilidad } from '../../catalogo-canchas/disponibilidad';
import {
  diaEnPalabras,
  fechaEnElClub,
  horaEnElClub,
  hoyEnElClub,
} from '../../catalogo-canchas/reloj-del-club';
import { Auth } from '../../core/auth/auth';
import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { EstadoVacio } from '../../ui/estado-vacio';
import { Insignia } from '../../ui/insignia';
import {
  ClaseDelDia,
  ClaseNueva,
  Clases,
  cupoEnPalabras,
  NivelClase,
  NIVELES,
  queClaseEs,
  TipoClase,
} from '../clases.service';
import { Profesores } from '../profesores.service';
import { InscritosDeLaClase } from './inscritos';
import { NuevaSerie } from './nueva-serie';
import { CampoFecha } from '../../ui/campo-fecha';
import { CampoHora } from '../../ui/campo-hora';
import { Esqueleto } from '../../ui/esqueleto';

/** El formulario vacío. Función y no constante, para no compartir el objeto. */
const enBlanco = () => ({
  tipo: 'TENIS' as TipoClase,
  /** Solo en el gimnasio: la individual es de un alumno y no pregunta el cupo (T233). */
  modalidad: 'grupal' as 'grupal' | 'individual',
  canchaId: 0,
  profesorId: 0,
  horaDesde: '18:00',
  horaHasta: '19:00',
  cupoMaximo: 6,
  nivel: 'INICIACION' as NivelClase,
  notas: '',
});

/**
 * Las clases del club, día por día.
 *
 * **Agendar una clase cierra la cancha**, y por eso esta pantalla pregunta antes de
 * confirmar cuando hay horas tomadas debajo: es la misma operación que el cierre por
 * mantención y merece la misma advertencia. Lo que se confirma no es "¿seguro?", es
 * la lista de a quién se le quita la hora.
 */
@Component({
  selector: 'app-agenda-clases',
  imports: [
    MatIcon,
    FormsModule,
    Aviso,
    EstadoVacio,
    Insignia,
    InscritosDeLaClase,
    NuevaSerie,
    CampoFecha,
    CampoHora,
    Esqueleto,
  ],
  template: `
    <!-- La cabecera del panel (TV7.1), sin acción: agendar es el formulario de
         abajo, y la navegación entre días va debajo de la cabecera. -->
    <header class="cabecera-panel">
      <div>
        <h1 class="titular text-4xl">Clases</h1>
        <p class="mt-1 text-muted-foreground">{{ enPalabras(fecha()) }}</p>
      </div>
    </header>

    <div class="mt-4 flex flex-wrap items-end gap-3">
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="boton boton-secundario boton-chico"
          aria-label="Día anterior"
          (click)="moverDia(-1)"
        >
          <mat-icon class="text-base" aria-hidden="true">chevron_left</mat-icon>
        </button>
        <button
          type="button"
          class="boton boton-secundario boton-chico"
          [disabled]="fecha() === hoy"
          (click)="fecha.set(hoy)"
        >
          Hoy
        </button>
        <button
          type="button"
          class="boton boton-secundario boton-chico"
          aria-label="Día siguiente"
          (click)="moverDia(1)"
        >
          <mat-icon class="text-base" aria-hidden="true">chevron_right</mat-icon>
        </button>
      </div>

      <div>
        <label for="fecha-clases" class="block text-sm font-medium">Ir a un día</label>
        <app-campo-fecha
          class="mt-1"
          inputId="fecha-clases"
          claseCampo="w-36 cursor-pointer py-2"
          [valor]="fecha()"
          (valorChange)="cambiarFecha($event)"
        />
      </div>
    </div>

    @if (error(); as falla) {
      <app-aviso variante="error" class="mt-4 block">{{ falla }}</app-aviso>
    }
    @if (aviso(); as texto) {
      <app-aviso variante="exito" class="mt-4 block">{{ texto }}</app-aviso>
    }

    @if (clases.isLoading()) {
      <app-esqueleto class="mt-4 block" [filas]="5" etiqueta="Cargando la agenda de clases…" />
    } @else if (clases.error()) {
      <p class="mt-4 text-destructive">
        No se pudieron cargar las clases. Reintenta en un momento.
      </p>
    } @else if (clases.value().length === 0) {
      <app-estado-vacio
        class="mt-4 block"
        icono="school"
        titulo="No hay clases este día"
        detalle="Agenda una con el formulario de abajo."
      />
    } @else {
      <ul class="mt-4 space-y-3">
        @for (clase of clases.value(); track clase.id) {
          <li class="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p class="font-display text-lg font-semibold">
                {{ hora(clase.inicio) }}–{{ hora(clase.fin) }}
              </p>
              <p class="font-medium">{{ clase.lugar }}</p>
              <app-insignia variante="info" icono="school">
                {{ queClaseEs(clase) }}
              </app-insignia>
              @if (clase.estado === 'REALIZADA') {
                <app-insignia variante="neutro" icono="check">Ya se dio</app-insignia>
              }
              <button
                type="button"
                class="boton boton-secundario boton-chico ms-auto"
                [attr.aria-expanded]="abierta() === clase.id"
                (click)="alternar(clase.id)"
              >
                {{ abierta() === clase.id ? 'Ocultar inscritos' : 'Ver inscritos' }}
              </button>
              @if (clase.estado === 'PROGRAMADA') {
                <!-- Una clase que ya se dio no se cancela: el servidor lo rechaza y
                     ofrecerlo es un callejón. -->
                <button
                  type="button"
                  class="boton boton-texto boton-chico"
                  [disabled]="trabajando()"
                  [attr.aria-busy]="enCurso() === 'cancelar-' + clase.id"
                  (click)="cancelar(clase)"
                >
                  Cancelar clase
                </button>
                <!-- T117. Esta y las siguientes de la serie: las horas vuelven a la grilla
                     y las clases anteriores quedan como estaban. -->
                @if (clase.serieId !== null) {
                  <button
                    type="button"
                    class="boton boton-texto boton-chico"
                    [disabled]="trabajando()"
                    [attr.aria-busy]="enCurso() === 'cancelarSerieDesde-' + clase.id"
                    (click)="cancelarSerieDesde(clase, clase.serieId)"
                  >
                    Cancelar desde esta fecha
                  </button>
                }
              }
            </div>

            <p class="mt-1">
              {{ clase.profesor }}
              <span class="text-sm text-muted-foreground">
                · {{ cupoEnPalabras(clase.cupoMaximo) }}
              </span>
            </p>

            @if (clase.notas) {
              <p class="mt-1 text-sm text-muted-foreground">{{ clase.notas }}</p>
            }

            @if (abierta() === clase.id) {
              <app-inscritos [claseId]="clase.id" />
            }
          </li>
        }
      </ul>
    }

    <form class="mt-6 rounded-xl border border-border bg-card p-4 shadow-sm" (ngSubmit)="agendar()">
      <h2 class="rotulo-seccion">Agendar una clase</h2>
      <p class="mt-2 text-sm text-muted-foreground">
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
        <fieldset class="sm:col-span-2">
          <legend class="text-sm font-medium">Tipo de clase</legend>
          <div class="mt-1 flex flex-wrap gap-x-4 gap-y-2">
            <label class="inline-flex min-h-11 items-center gap-2">
              <input
                type="radio"
                class="size-5"
                name="tipo"
                value="TENIS"
                [(ngModel)]="datos.tipo"
              />Tenis</label
            >
            <label class="inline-flex min-h-11 items-center gap-2">
              <input
                type="radio"
                class="size-5"
                name="tipo"
                value="PREPARACION_FISICA"
                [(ngModel)]="datos.tipo"
              />Preparación física</label
            >
          </div>
        </fieldset>

        @if (datos.tipo === 'TENIS') {
          <label class="block">
            <span class="text-sm font-medium">Cancha</span>
            <select class="campo mt-1" name="canchaId" [(ngModel)]="datos.canchaId">
              <option [value]="0" disabled>Elige una cancha</option>
              @for (cancha of canchasActivas(); track cancha.id) {
                <option [value]="cancha.id">{{ cancha.nombre }}</option>
              }
            </select>
          </label>
        }

        <!-- El profesor agenda a su nombre (T222): no elige. -->
        @if (profesorFijo() === null) {
          <label class="block">
            <span class="text-sm font-medium">Profesor</span>
            <select class="campo mt-1" name="profesorId" [(ngModel)]="datos.profesorId">
              <option [value]="0" disabled>Elige un profesor</option>
              @if (profesores.hasValue()) {
                @for (profesor of profesores.value(); track profesor.id) {
                  <option [value]="profesor.id">
                    {{ profesor.nombreVisible }} · {{ profesor.especialidad }}
                  </option>
                }
              }
            </select>
            @if (profesores.error()) {
              <span class="text-sm text-destructive"> No se pudieron cargar los profesores. </span>
            } @else if (profesores.value().length === 0) {
              <span class="text-sm text-muted-foreground">
                No hay profesores activos: anota uno primero.
              </span>
            }
          </label>
        }

        <div>
          <label class="block text-sm font-medium" for="clase-hora-desde">Desde</label>
          <app-campo-hora
            class="mt-1"
            inputId="clase-hora-desde"
            name="horaDesde"
            claseCampo="w-28"
            [(ngModel)]="datos.horaDesde"
          />
        </div>

        <div>
          <label class="block text-sm font-medium" for="clase-hora-hasta">Hasta</label>
          <app-campo-hora
            class="mt-1"
            inputId="clase-hora-hasta"
            name="horaHasta"
            claseCampo="w-28"
            [(ngModel)]="datos.horaHasta"
          />
        </div>

        @if (datos.tipo === 'TENIS') {
          <label class="block">
            <span class="text-sm font-medium">Nivel</span>
            <select class="campo mt-1" name="nivel" [(ngModel)]="datos.nivel">
              @for (opcion of opcionesDeNivel; track opcion.valor) {
                <option [value]="opcion.valor">{{ opcion.etiqueta }}</option>
              }
            </select>
          </label>
        } @else {
          <!-- Grupal hasta el cupo que configura el club; el servidor rechaza uno mayor. -->
          <fieldset>
            <legend class="text-sm font-medium">Modalidad</legend>
            <div class="mt-1 flex flex-wrap gap-x-4 gap-y-2">
              <label class="inline-flex min-h-11 items-center gap-2">
                <input
                  type="radio"
                  class="size-5"
                  name="modalidad"
                  value="grupal"
                  [(ngModel)]="datos.modalidad"
                />Grupal</label
              >
              <label class="inline-flex min-h-11 items-center gap-2">
                <input
                  type="radio"
                  class="size-5"
                  name="modalidad"
                  value="individual"
                  [(ngModel)]="datos.modalidad"
                />Individual</label
              >
            </div>
          </fieldset>
        }

        @if (datos.tipo === 'TENIS' || datos.modalidad === 'grupal') {
          <label class="block">
            <span class="text-sm font-medium">Cupo</span>
            <input
              class="campo mt-1"
              type="number"
              name="cupoMaximo"
              [min]="datos.tipo === 'TENIS' ? 1 : 2"
              max="40"
              [(ngModel)]="datos.cupoMaximo"
            />
          </label>
        }

        <label class="block sm:col-span-2">
          <span class="text-sm font-medium">Notas</span>
          <input
            class="campo mt-1"
            name="notas"
            placeholder="Opcional: qué se trabaja, qué llevar"
            [(ngModel)]="datos.notas"
          />
        </label>
      </div>

      <button
        type="submit"
        class="boton boton-primario mt-3"
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
            type="button"
            class="boton boton-destructivo boton-chico"
            [disabled]="trabajando() || hayPagoEnCurso()"
            [attr.aria-busy]="enCurso() === 'confirmar'"
            (click)="confirmar()"
          >
            Agendar igual y avisarles
          </button>
          <button
            type="button"
            class="boton boton-texto boton-chico"
            (click)="porConfirmar.set(null)"
          >
            Mejor no
          </button>
        </div>
      </div>
      }
    }

    <!-- La serie (T115), en su propio componente: escribirla, revisarla fecha por fecha
         y agendarla son tres pasos que no caben en el formulario de la clase suelta. -->
    <app-nueva-serie
      class="mt-6"
      [canchas]="canchasActivas()"
      [profesores]="profesores.hasValue() ? profesores.value() : []"
      [profesorFijo]="profesorFijo()"
      (agendada)="serieAgendada($event)"
    />
  `,
})
export class AgendaDeClases {
  private readonly api = inject(Clases);
  private readonly profes = inject(Profesores);
  private readonly disponibilidad = inject(Disponibilidad);
  private readonly usuario = inject(Auth).usuario;

  /**
   * El profesor que no es admin agenda a su nombre (T222): sin selector, sin pedir las
   * fichas de los demás, y solo en horas libres. `null` para el admin, que elige.
   */
  protected readonly profesorFijo = computed(() => {
    const yo = this.usuario();
    return yo && !yo.esAdmin ? yo.profesorId : null;
  });

  protected readonly fecha = signal(hoyEnElClub());
  protected readonly hoy = hoyEnElClub();

  protected datos = enBlanco();

  protected readonly trabajando = signal(false);
  /** Qué acción está viajando, para que gire su botón y no todos (T154). */
  protected readonly enCurso = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  /** Las horas que la clase se llevaría por delante, ya vistas por el admin. */
  protected readonly porConfirmar = signal<HoraAfectada[] | null>(null);

  private readonly version = signal(0);

  protected readonly clases = resource({
    params: () => ({ fecha: this.fecha(), version: this.version() }),
    loader: ({ params }) => this.api.delDia(params.fecha),
    defaultValue: [] as ClaseDelDia[],
  });

  /** Solo los activos: el filtro lo impone el servidor, esto es la comodidad. */
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

  /** Qué clase tiene su lista abierta. Una a la vez: el día entero no cabe. */
  protected readonly abierta = signal<number | null>(null);

  protected alternar(id: number): void {
    this.abierta.update((actual) => (actual === id ? null : id));
  }

  protected readonly hora = horaEnElClub;
  protected readonly enPalabras = diaEnPalabras;

  protected readonly queClaseEs = queClaseEs;
  protected readonly cupoEnPalabras = cupoEnPalabras;

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

  protected async cancelar(clase: ClaseDelDia): Promise<void> {
    // `prompt` y no un formulario propio: el motivo es obligatorio y esta es la
    // única acción de la pantalla que lo pide.
    const motivo = window.prompt(`¿Por qué se cancela la clase de ${clase.profesor}?`);

    if (motivo === null || motivo.trim() === '') return;

    await this.intentar(`cancelar-${clase.id}`, async () => {
      await this.api.cancelar(clase.id, motivo);
      this.aviso.set('Clase cancelada. La cancha vuelve a estar disponible.');
    });
  }

  /** La serie quedó agendada: se dice cuánto y se recarga el día, que puede tener una. */
  protected serieAgendada(resumen: string): void {
    this.error.set(null);
    this.aviso.set(resumen);
    this.version.update((v) => v + 1);
  }

  /** Cancela esta clase y las siguientes de su serie, con el motivo (T117). */
  protected async cancelarSerieDesde(clase: ClaseDelDia, serieId: number): Promise<void> {
    const desde = fechaEnElClub(clase.inicio);
    const motivo = window.prompt(
      `¿Por qué se cancela la serie de ${clase.profesor} desde el ${diaEnPalabras(desde)}?`,
    );

    if (motivo === null || motivo.trim() === '') return;

    await this.intentar(`cancelarSerieDesde-${clase.id}`, async () => {
      const { canceladas } = await this.api.cancelarSerieDesde(serieId, desde, motivo);
      this.aviso.set(
        `Se cancelaron ${canceladas} ${canceladas === 1 ? 'clase' : 'clases'} de la serie, ` +
          `desde el ${diaEnPalabras(desde)}. Esas horas vuelven a estar disponibles.`,
      );
    });
  }

  protected cambiarFecha(valor: string): void {
    if (valor) this.fecha.set(valor);
  }

  /** Se mueve desde el mediodía UTC: los domingos del cambio de hora no tienen 24. */
  protected moverDia(pasos: number): void {
    const dia = new Date(`${this.fecha()}T12:00:00.000Z`);
    dia.setUTCDate(dia.getUTCDate() + pasos);

    this.fecha.set(fechaEnElClub(dia));
  }

  private async crear(): Promise<void> {
    const clase = this.formulario();
    const { canceladas } = await this.api.agendar(clase);

    this.porConfirmar.set(null);
    this.datos = enBlanco();
    this.aviso.set(agendada(clase, canceladas.length));
  }

  private formulario(): ClaseNueva {
    const ficha = {
      // Los `select` devuelven texto aunque el valor sea un número.
      profesorId: this.profesorFijo() ?? Number(this.datos.profesorId),
      fecha: this.fecha(),
      horaDesde: this.datos.horaDesde,
      horaHasta: this.datos.horaHasta,
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
    this.aviso.set(null);
    this.trabajando.set(true);
    this.enCurso.set(clave);

    try {
      await accion();
      this.version.update((v) => v + 1);
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

/** Lo que dice la agenda al agendar: dónde quedó la clase y a cuántos se avisó. */
function agendada(clase: ClaseNueva, canceladas: number): string {
  if (clase.tipo === 'PREPARACION_FISICA') return 'Clase agendada en el gimnasio.';
  if (canceladas === 0) return 'Clase agendada. La cancha queda cerrada esa hora.';

  return canceladas === 1
    ? 'Clase agendada. Avisamos a la persona que tenía esa hora.'
    : `Clase agendada. Avisamos a las ${canceladas} personas que tenían esa hora.`;
}
