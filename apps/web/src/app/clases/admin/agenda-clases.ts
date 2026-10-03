import { Component, computed, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  AdminCanchas,
  HoraAfectada,
} from '../../catalogo-canchas/admin/admin-canchas.service';
import {
  diaEnPalabras,
  fechaEnElClub,
  horaEnElClub,
  hoyEnElClub,
} from '../../catalogo-canchas/reloj-del-club';
import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { EstadoVacio } from '../../ui/estado-vacio';
import { Insignia } from '../../ui/insignia';
import {
  ClaseDelDia,
  ClaseNueva,
  Clases,
  NivelClase,
  NIVELES,
} from '../clases.service';
import { Profesores } from '../profesores.service';
import { InscritosDeLaClase } from './inscritos';

/** El formulario vacío. Función y no constante, para no compartir el objeto. */
const enBlanco = () => ({
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
  imports: [FormsModule, Aviso, EstadoVacio, Insignia, InscritosDeLaClase],
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
          <span class="icono text-base" aria-hidden="true">chevron_left</span>
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
          <span class="icono text-base" aria-hidden="true">chevron_right</span>
        </button>
      </div>

      <div>
        <label for="fecha-clases" class="block text-sm font-medium">Ir a un día</label>
        <input
          id="fecha-clases"
          type="date"
          class="campo mt-1 w-auto cursor-pointer py-2"
          [value]="fecha()"
          (change)="cambiarFecha($event)"
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
      <p class="mt-4 text-muted-foreground">Cargando…</p>
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
              <p class="font-medium">{{ clase.cancha }}</p>
              <app-insignia variante="info" icono="school">
                {{ nivel(clase.nivel) }}
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
                  (click)="cancelar(clase)"
                >
                  Cancelar clase
                </button>
              }
            </div>

            <p class="mt-1">
              {{ clase.profesor }}
              <span class="text-sm text-muted-foreground">
                · hasta {{ clase.cupoMaximo }} alumnos
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

    <form
      class="mt-6 rounded-xl border border-border bg-card p-4 shadow-sm"
      (ngSubmit)="agendar()"
    >
      <h2 class="rotulo-seccion">Agendar una clase</h2>
      <p class="mt-2 text-sm text-muted-foreground">
        La cancha queda cerrada esa hora. Si hay reservas debajo, te las mostramos
        antes de confirmar.
      </p>

      <div class="mt-3 grid gap-3 sm:grid-cols-2">
        <label class="block">
          <span class="text-sm font-medium">Cancha</span>
          <select class="campo mt-1" name="canchaId" [(ngModel)]="datos.canchaId">
            <option [value]="0" disabled>Elige una cancha</option>
            @for (cancha of canchasActivas(); track cancha.id) {
              <option [value]="cancha.id">{{ cancha.nombre }}</option>
            }
          </select>
        </label>

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
            <span class="text-sm text-destructive">
              No se pudieron cargar los profesores.
            </span>
          } @else if (profesores.value().length === 0) {
            <span class="text-sm text-muted-foreground">
              No hay profesores activos: anota uno primero.
            </span>
          }
        </label>

        <label class="block">
          <span class="text-sm font-medium">Desde</span>
          <input
            class="campo mt-1"
            type="time"
            name="horaDesde"
            step="1800"
            [(ngModel)]="datos.horaDesde"
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium">Hasta</span>
          <input
            class="campo mt-1"
            type="time"
            name="horaHasta"
            step="1800"
            [(ngModel)]="datos.horaHasta"
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium">Nivel</span>
          <select class="campo mt-1" name="nivel" [(ngModel)]="datos.nivel">
            @for (opcion of opcionesDeNivel; track opcion.valor) {
              <option [value]="opcion.valor">{{ opcion.etiqueta }}</option>
            }
          </select>
        </label>

        <label class="block">
          <span class="text-sm font-medium">Cupo</span>
          <input
            class="campo mt-1"
            type="number"
            name="cupoMaximo"
            min="1"
            max="40"
            [(ngModel)]="datos.cupoMaximo"
          />
        </label>

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

      <button type="submit" class="boton boton-primario mt-3" [disabled]="trabajando()">
        Agendar clase
      </button>
    </form>

    <!-- El segundo paso, y solo cuando hay algo que perder: agendar sobre una hora
         libre no pregunta nada. Lo que se confirma es esta lista. -->
    @if (porConfirmar(); as afectadas) {
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
          Si agendas la clase se cancelan y avisamos por correo. A quien pagó se le
          devuelve todo. <strong>Cancelar la clase después no las devuelve.</strong>
        </p>

        <ul class="mt-2 grid gap-1">
          @for (tomada of afectadas; track tomada.id) {
            <li>
              <span class="font-medium">
                {{ hora(tomada.inicio) }}–{{ hora(tomada.fin) }}
              </span>
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
  `,
})
export class AgendaDeClases {
  private readonly api = inject(Clases);
  private readonly profes = inject(Profesores);
  private readonly catalogo = inject(AdminCanchas);

  protected readonly fecha = signal(hoyEnElClub());
  protected readonly hoy = hoyEnElClub();

  protected datos = enBlanco();

  protected readonly trabajando = signal(false);
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
  protected readonly profesores = resource({
    loader: () => this.profes.listar(true),
    defaultValue: [],
  });

  protected readonly canchas = resource({
    loader: () => this.catalogo.canchas(),
    defaultValue: [],
  });

  /**
   * Solo las activas.
   *
   * Una cancha desactivada no tiene grilla, así que el servidor rechaza cualquier
   * clase sobre ella: ofrecerla en el selector es ofrecer un callejón. Es el mismo
   * criterio que con los profesores desactivados.
   */
  protected readonly canchasActivas = computed(() =>
    (this.canchas.hasValue() ? this.canchas.value() : []).filter((cancha) => cancha.activa),
  );

  protected readonly opcionesDeNivel = Object.entries(NIVELES).map(
    ([valor, etiqueta]) => ({ valor, etiqueta }),
  );

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

  protected nivel(clave: NivelClase): string {
    return NIVELES[clave] ?? clave;
  }

  /**
   * Primer paso: mira a quién afecta.
   *
   * Sin nadie debajo, agenda de una: preguntar por preguntar entrena a la gente a
   * apretar sin leer, y entonces la advertencia que importa tampoco se lee.
   */
  protected async agendar(): Promise<void> {
    await this.intentar(async () => {
      const { afectadas } = await this.api.simular(this.formulario());

      if (afectadas.length === 0) {
        await this.crear();
        return;
      }

      this.porConfirmar.set(afectadas);
    });
  }

  /** Segundo paso: el admin ya vio a quién deja sin hora. */
  protected async confirmar(): Promise<void> {
    await this.intentar(() => this.crear());
  }

  protected async cancelar(clase: ClaseDelDia): Promise<void> {
    // `prompt` y no un formulario propio: el motivo es obligatorio y esta es la
    // única acción de la pantalla que lo pide.
    const motivo = window.prompt(
      `¿Por qué se cancela la clase de ${clase.profesor}?`,
    );

    if (motivo === null || motivo.trim() === '') return;

    await this.intentar(async () => {
      await this.api.cancelar(clase.id, motivo);
      this.aviso.set('Clase cancelada. La cancha vuelve a estar disponible.');
    });
  }

  protected cambiarFecha(evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value;

    if (valor) this.fecha.set(valor);
  }

  /** Se mueve desde el mediodía UTC: los domingos del cambio de hora no tienen 24. */
  protected moverDia(pasos: number): void {
    const dia = new Date(`${this.fecha()}T12:00:00.000Z`);
    dia.setUTCDate(dia.getUTCDate() + pasos);

    this.fecha.set(fechaEnElClub(dia));
  }

  private async crear(): Promise<void> {
    const { canceladas } = await this.api.agendar(this.formulario());

    this.porConfirmar.set(null);
    this.datos = enBlanco();
    this.aviso.set(
      canceladas.length === 0
        ? 'Clase agendada. La cancha queda cerrada esa hora.'
        : canceladas.length === 1
          ? 'Clase agendada. Avisamos a la persona que tenía esa hora.'
          : `Clase agendada. Avisamos a las ${canceladas.length} personas que tenían esa hora.`,
    );
  }

  private formulario(): ClaseNueva {
    return {
      ...this.datos,
      // Los `select` devuelven texto aunque el valor sea un número.
      canchaId: Number(this.datos.canchaId),
      profesorId: Number(this.datos.profesorId),
      cupoMaximo: Number(this.datos.cupoMaximo),
      fecha: this.fecha(),
    };
  }

  private async intentar(accion: () => Promise<void>): Promise<void> {
    this.error.set(null);
    this.aviso.set(null);
    this.trabajando.set(true);

    try {
      await accion();
      this.version.update((v) => v + 1);
    } catch (falla) {
      // El del servidor: dice si la hora no existe en la grilla, si la cancha ya
      // estaba cerrada o si el profesor está desactivado.
      this.error.set(mensajeDelServidor(falla, 'No se pudo agendar la clase.'));
    } finally {
      this.trabajando.set(false);
    }
  }
}
