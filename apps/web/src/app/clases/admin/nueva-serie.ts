import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatTimepickerModule } from '@angular/material/timepicker';

import { diaEnPalabras, horaEnElClub } from '../../catalogo-canchas/reloj-del-club';
import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import {
  Clases,
  DecisionDeFecha,
  FechaDeLaSerie,
  NivelClase,
  NIVELES,
  SerieNueva,
  TipoClase,
} from '../clases.service';
import { proveerCampos } from '../../ui/campos';
import { fechaATexto, horaATexto, proveerFechaYHora, textoAHora } from '../../ui/fecha-y-hora';

/** El lugar del día en la semana del club, que empieza el lunes: el domingo, 0, va al final. */
const enLaSemana = (dia: number) => (dia + 6) % 7;

/** Con lo que nace el primer día marcado. */
/**
 * Un día de la serie mientras se escribe: las horas como las entrega el selector de Material,
 * y a texto recién al mandar la serie (A5, T244).
 */
interface DiaDelFormulario {
  diaSemana: number;
  horaDesde: Date | null;
  horaHasta: Date | null;
  canchaId: number;
}

const DIA_EN_BLANCO = {
  horaDesde: textoAHora('19:00'),
  horaHasta: textoAHora('20:00'),
  canchaId: 0,
};

/** Los días en el orden de la semana del club, con el número que espera la API (0 = domingo). */
const DIAS = [
  { valor: 1, nombre: 'Lunes' },
  { valor: 2, nombre: 'Martes' },
  { valor: 3, nombre: 'Miércoles' },
  { valor: 4, nombre: 'Jueves' },
  { valor: 5, nombre: 'Viernes' },
  { valor: 6, nombre: 'Sábado' },
  { valor: 0, nombre: 'Domingo' },
];

/** El formulario vacío. Función y no constante, para no compartir el objeto. */
const enBlanco = () => ({
  tipo: 'TENIS' as TipoClase,
  /** Solo en el gimnasio: la individual es de un alumno y no pregunta el cupo (T233). */
  modalidad: 'grupal' as 'grupal' | 'individual',
  profesorId: 0,
  /** Un renglón por día marcado, en el orden de la semana (T230). */
  dias: [] as DiaDelFormulario[],
  desde: null as Date | null,
  hasta: null as Date | null,
  cupoMaximo: 6,
  nivel: 'INICIACION' as NivelClase,
  notas: '',
});

/**
 * Agendar una serie de clases desde el panel (T115): "martes y jueves de 19 a 20, hasta el
 * 15 de diciembre".
 *
 * Tres pasos en la misma pantalla: escribir la serie, **revisarla fecha por fecha** y
 * agendarla. Las fechas con algo encima —reservas, o la cancha cerrada— piden una decisión,
 * cancelar o saltar (decisión 9), y el botón de agendar no se habilita hasta que estén todas
 * decididas: nada se cancela sin estar en la lista que el admin vio. El servidor vuelve a
 * revisar al confirmar.
 */
@Component({
  selector: 'app-nueva-serie',
  imports: [
    MatButton,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInput,
    MatTimepickerModule,
    FormsModule,
    Aviso,
  ],
  providers: [proveerCampos(), proveerFechaYHora()],
  host: { class: 'block' },
  template: `
    <form class="rounded-xl border border-border bg-card p-4 shadow-sm" (ngSubmit)="revisar()">
      <h2 class="rotulo-seccion">Agendar una serie</h2>
      <p class="mt-2 text-sm text-muted-foreground">
        Una clase por cada día marcado entre las dos fechas, hasta 6 meses. Antes de agendar te
        mostramos cada fecha y lo que tiene encima.
      </p>

      <div class="mt-3 grid gap-3 sm:grid-cols-2">
        <!-- T233. Una serie no mezcla tipos: de tenis, con una cancha por día, o todos sus
             días al gimnasio. -->
        <fieldset class="sm:col-span-2">
          <legend class="text-sm font-medium">Tipo de clase</legend>
          <div class="mt-1 flex flex-wrap gap-x-4 gap-y-2">
            <label class="inline-flex min-h-11 items-center gap-2">
              <input
                type="radio"
                class="size-5"
                name="serie-tipo"
                value="TENIS"
                [(ngModel)]="datos.tipo"
              />Tenis</label
            >
            <label class="inline-flex min-h-11 items-center gap-2">
              <input
                type="radio"
                class="size-5"
                name="serie-tipo"
                value="PREPARACION_FISICA"
                [(ngModel)]="datos.tipo"
              />Preparación física</label
            >
          </div>
        </fieldset>

        <!-- El profesor arma su serie a su nombre (T222): no elige. -->
        @if (profesorFijo() === null) {
          <mat-form-field>
            <mat-label>Profesor</mat-label>
            <select matNativeControl name="serie-profesor" [(ngModel)]="datos.profesorId">
              <option [value]="0" disabled>Elige un profesor</option>
              @for (profesor of profesores(); track profesor.id) {
                <option [value]="profesor.id">
                  {{ profesor.nombreVisible }} · {{ profesor.especialidad }}
                </option>
              }
            </select>
          </mat-form-field>
        }

        <!-- Casillas y no un selector múltiple: se ven los siete a la vez y cada una se
             marca con un toque. -->
        <fieldset class="sm:col-span-2">
          <legend class="text-sm font-medium">Días de la semana</legend>
          <div class="mt-1 flex flex-wrap gap-x-4 gap-y-2">
            @for (dia of dias; track dia.valor) {
              <label class="inline-flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  class="size-5"
                  [checked]="marcado(dia.valor)"
                  (change)="alternarDia(dia.valor)"
                />{{ dia.nombre }}</label
              >
            }
          </div>
        </fieldset>

        <!-- T230. Cada día con su horario y su cancha: el lunes de 19 a 20 en una y el martes
             de 18 a 19 en otra. El [name] registra el campo en el formulario y matInput lo
             deja en el elemento (T246). Las horas van sin el botón del reloj para que quepan
             lado a lado a 375 px: la lista se abre igual desde el campo. -->
        @for (dia of datos.dias; track dia.diaSemana) {
          <fieldset class="sm:col-span-2">
            <legend class="font-display font-semibold">{{ nombreDelDia(dia.diaSemana) }}</legend>
            <div class="mt-1 flex flex-wrap items-start gap-3">
              <mat-form-field class="w-28">
                <mat-label>Desde</mat-label>
                <input
                  matInput
                  placeholder="hh:mm"
                  autocomplete="off"
                  [matTimepicker]="relojDesde"
                  [name]="'serie-hora-desde-' + dia.diaSemana"
                  [(ngModel)]="dia.horaDesde"
                  (ngModelChange)="tocar(dia)"
                />
                <mat-timepicker #relojDesde />
              </mat-form-field>

              <mat-form-field class="w-28">
                <mat-label>Hasta</mat-label>
                <input
                  matInput
                  placeholder="hh:mm"
                  autocomplete="off"
                  [matTimepicker]="relojHasta"
                  [name]="'serie-hora-hasta-' + dia.diaSemana"
                  [(ngModel)]="dia.horaHasta"
                  (ngModelChange)="tocar(dia)"
                />
                <mat-timepicker #relojHasta />
              </mat-form-field>

              @if (datos.tipo === 'TENIS') {
                <mat-form-field class="min-w-40 flex-1">
                  <mat-label>Cancha</mat-label>
                  <select
                    matNativeControl
                    [name]="'serie-cancha-' + dia.diaSemana"
                    [(ngModel)]="dia.canchaId"
                    (ngModelChange)="tocar(dia)"
                  >
                    <option [value]="0" disabled>Elige una cancha</option>
                    @for (cancha of canchas(); track cancha.id) {
                      <option [value]="cancha.id">{{ cancha.nombre }}</option>
                    }
                  </select>
                </mat-form-field>
              }
            </div>
          </fieldset>
        }

        <mat-form-field class="w-48">
          <mat-label>Primera fecha</mat-label>
          <input
            matInput
            name="serie-desde"
            placeholder="dd-mm-aaaa"
            autocomplete="off"
            [matDatepicker]="calendarioDesde"
            [(ngModel)]="datos.desde"
          />
          <mat-datepicker-toggle matIconSuffix [for]="calendarioDesde" />
          <mat-datepicker #calendarioDesde />
        </mat-form-field>

        <mat-form-field class="w-48">
          <mat-label>Última fecha</mat-label>
          <input
            matInput
            name="serie-hasta"
            placeholder="dd-mm-aaaa"
            autocomplete="off"
            [matDatepicker]="calendarioHasta"
            [(ngModel)]="datos.hasta"
          />
          <mat-datepicker-toggle matIconSuffix [for]="calendarioHasta" />
          <mat-datepicker #calendarioHasta />
        </mat-form-field>

        @if (datos.tipo === 'TENIS') {
          <mat-form-field>
            <mat-label>Nivel</mat-label>
            <select matNativeControl name="serie-nivel" [(ngModel)]="datos.nivel">
              @for (opcion of opcionesDeNivel; track opcion.valor) {
                <option [value]="opcion.valor">{{ opcion.etiqueta }}</option>
              }
            </select>
          </mat-form-field>
        } @else {
          <!-- Grupal hasta el cupo que configura el club; el servidor rechaza uno mayor. -->
          <fieldset>
            <legend class="text-sm font-medium">Modalidad</legend>
            <div class="mt-1 flex flex-wrap gap-x-4 gap-y-2">
              <label class="inline-flex min-h-11 items-center gap-2">
                <input
                  type="radio"
                  class="size-5"
                  name="serie-modalidad"
                  value="grupal"
                  [(ngModel)]="datos.modalidad"
                />Grupal</label
              >
              <label class="inline-flex min-h-11 items-center gap-2">
                <input
                  type="radio"
                  class="size-5"
                  name="serie-modalidad"
                  value="individual"
                  [(ngModel)]="datos.modalidad"
                />Individual</label
              >
            </div>
          </fieldset>
        }

        @if (datos.tipo === 'TENIS' || datos.modalidad === 'grupal') {
          <mat-form-field>
            <mat-label>Cupo</mat-label>
            <input
              matInput
              type="number"
              [min]="datos.tipo === 'TENIS' ? 1 : 2"
              max="40"
              name="serie-cupo"
              [(ngModel)]="datos.cupoMaximo"
            />
          </mat-form-field>
        }

        <mat-form-field class="sm:col-span-2">
          <mat-label>Notas</mat-label>
          <input
            matInput
            name="serie-notas"
            placeholder="Opcional: qué se trabaja, qué llevar"
            [(ngModel)]="datos.notas"
          />
        </mat-form-field>
      </div>

      <button
        matButton="outlined"
        type="submit"
        class="mt-3"
        [attr.aria-busy]="enCurso() === 'revisar'"
        [disabled]="trabajando()"
      >
        Revisar fechas
      </button>
    </form>

    @if (error(); as falla) {
      <app-aviso variante="error" class="mt-3 block">{{ falla }}</app-aviso>
    }

    @if (fechas(); as revisadas) {
      <section
        class="mt-3 rounded-xl border border-border bg-card p-4 text-sm"
        aria-labelledby="titulo-fechas-serie"
      >
        <h3 id="titulo-fechas-serie" class="font-display text-base font-semibold">
          {{ revisadas.length }} {{ revisadas.length === 1 ? 'fecha' : 'fechas' }}
        </h3>

        <ul class="mt-2 divide-y divide-border">
          @for (fila of revisadas; track fila.fecha) {
            <li class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span class="min-w-48 font-medium">
                {{ enPalabras(fila.fecha) }}, {{ hora(fila.inicio) }}–{{ hora(fila.fin) }}
              </span>

              <span class="flex-1">
                @if (fila.choque) {
                  <span class="text-destructive">{{ fila.choque }}</span>
                } @else if (fila.afectadas.length > 0 && profesorFijo() === null) {
                  @for (tomada of fila.afectadas; track tomada.id) {
                    <span class="block text-destructive">
                      {{ tomada.folio }} · {{ tomada.nombre }}
                      @if (tomada.pagada && profesorFijo() === null) {
                        (pagada, se devuelve si se cancela)
                      }
                    </span>
                  }
                } @else if (fila.afectadas.length > 0) {
                  <!-- Al profesor la API no le dice de quién son (T218). -->
                  <span class="block text-destructive">
                    Tiene reservas: solo se puede saltar. Para cancelarlas, habla con
                    administración.
                  </span>
                } @else {
                  <span class="text-muted-foreground">Libre</span>
                }
              </span>

              <mat-form-field class="chico w-auto">
                <select
                  matNativeControl
                  [name]="'decision-' + fila.fecha"
                  [attr.aria-label]="'Qué hacer el ' + enPalabras(fila.fecha)"
                  [value]="decisiones()[fila.fecha] ?? ''"
                  (change)="decidir(fila.fecha, $any($event.target).value)"
                >
                  @if (fila.choque) {
                    <option value="">Elige qué hacer</option>
                    <option value="saltar">Saltar esta fecha</option>
                  } @else if (fila.afectadas.length > 0) {
                    <option value="">Elige qué hacer</option>
                    <!-- Cancelarle la hora a un socio lo decide administración (T219). -->
                    @if (profesorFijo() === null) {
                      <option value="cancelar">Cancelar sus reservas y avisar</option>
                    }
                    <option value="saltar">Saltar esta fecha</option>
                  } @else {
                    <option value="">Agendar</option>
                    <option value="saltar">Saltar esta fecha</option>
                  }
                </select>
              </mat-form-field>
            </li>
          }
        </ul>

        <div class="mt-3 flex flex-wrap items-center gap-3">
          <button
            matButton="filled"
            type="button"
            aria-describedby="motivo-serie"
            [disabled]="trabajando() || motivoParaNoAgendar() !== null"
            [attr.aria-busy]="enCurso() === 'agendar'"
            (click)="agendar()"
          >
            Agendar serie
          </button>
          <!-- Por qué no se puede, a la vista y no en un tooltip: un botón gris sin
               explicación se lee como una pantalla rota. -->
          <p id="motivo-serie" class="text-muted-foreground">
            {{
              motivoParaNoAgendar() ??
                (datos.tipo === 'TENIS'
                  ? 'Las clases cierran la cancha a esa hora.'
                  : 'Las clases ocupan el gimnasio a esa hora.')
            }}
          </p>
        </div>
      </section>
    }
  `,
})
export class NuevaSerie {
  private readonly api = inject(Clases);

  readonly canchas = input.required<{ id: number; nombre: string }[]>();
  readonly profesores =
    input.required<{ id: number; nombreVisible: string; especialidad: string }[]>();
  /** El profesor que arma su propia serie (T222): sin selector, y sin cancelar reservas. */
  readonly profesorFijo = input<number | null>(null);

  /** El resumen de lo que se agendó, para que la agenda lo diga y se recargue. */
  readonly agendada = output<string>();

  protected datos = enBlanco();
  protected readonly dias = DIAS;
  protected readonly opcionesDeNivel = Object.entries(NIVELES).map(([valor, etiqueta]) => ({
    valor,
    etiqueta,
  }));

  /** Lo que devolvió la revisión, y la serie que se revisó: si cambia, hay que revisar de nuevo. */
  protected readonly fechas = signal<FechaDeLaSerie[] | null>(null);
  private revisada: string | null = null;

  protected readonly decisiones = signal<Record<string, DecisionDeFecha>>({});
  protected readonly trabajando = signal(false);
  /** Qué acción está viajando, para que gire su botón y no todos (T154). */
  protected readonly enCurso = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly hora = horaEnElClub;
  protected readonly enPalabras = diaEnPalabras;

  /** El último renglón que se cambió: el día que se marque nace con su horario y su cancha. */
  private ultimoTocado: Omit<DiaDelFormulario, 'diaSemana'> = DIA_EN_BLANCO;

  protected marcado(valor: number): boolean {
    return this.datos.dias.some((dia) => dia.diaSemana === valor);
  }

  protected nombreDelDia(valor: number): string {
    return DIAS.find((dia) => dia.valor === valor)!.nombre;
  }

  protected alternarDia(valor: number): void {
    const { dias } = this.datos;

    this.datos.dias = this.marcado(valor)
      ? dias.filter((dia) => dia.diaSemana !== valor)
      : [...dias, { ...this.ultimoTocado, diaSemana: valor }].sort(
          (a, b) => enLaSemana(a.diaSemana) - enLaSemana(b.diaSemana),
        );
  }

  protected tocar(dia: DiaDelFormulario): void {
    this.ultimoTocado = dia;
  }

  protected decidir(fecha: string, valor: string): void {
    this.decisiones.update((actuales) => {
      const nuevas = { ...actuales };
      delete nuevas[fecha];
      // "Agendar" y "Elige qué hacer" son la ausencia de decisión.
      if (valor === 'cancelar' || valor === 'saltar') nuevas[fecha] = valor;
      return nuevas;
    });
  }

  /**
   * Por qué todavía no se puede agendar, o nulo si se puede. Es lo que el botón dice: la
   * serie cambió desde la revisión, o hay fechas con algo encima sin decidir.
   */
  protected motivoParaNoAgendar(): string | null {
    if (JSON.stringify(this.serie()) !== this.revisada) {
      return 'Cambiaste la serie: revisa las fechas de nuevo.';
    }

    const decisiones = this.decisiones();
    const pendientes = (this.fechas() ?? []).filter(
      (fila) => (fila.choque !== null || fila.afectadas.length > 0) && !decisiones[fila.fecha],
    );

    if (pendientes.length === 0) return null;

    return (
      `Falta decidir ${pendientes.length} ${pendientes.length === 1 ? 'fecha' : 'fechas'}: ` +
      `${pendientes.map((fila) => diaEnPalabras(fila.fecha)).join('; ')}.`
    );
  }

  protected async revisar(): Promise<void> {
    this.error.set(null);

    if (this.datos.dias.length === 0) {
      this.error.set('Marca al menos un día de la semana.');
      return;
    }

    // La API dice "la cancha" sin decir de qué día: con un renglón por día, acá sí se sabe.
    const sinCancha =
      this.datos.tipo === 'TENIS' && this.datos.dias.find((dia) => Number(dia.canchaId) === 0);
    if (sinCancha) {
      this.error.set(`Elige la cancha del ${this.nombreDelDia(sinCancha.diaSemana).toLowerCase()}.`);
      return;
    }

    await this.intentar('revisar', async () => {
      const serie = this.serie();
      const { fechas } = await this.api.simularSerie(serie);

      this.fechas.set(fechas);
      this.decisiones.set({});
      this.revisada = JSON.stringify(serie);
    });
  }

  protected async agendar(): Promise<void> {
    if (this.motivoParaNoAgendar() !== null) return;

    await this.intentar('agendar', async () => {
      const { clases, saltadas, canceladas } = await this.api
        .agendarSerie(this.serie(), this.decisiones())
        .catch(async (falla: unknown) => {
          // Algo apareció encima desde la revisión: se vuelve a revisar sola, para que la
          // fecha nueva esté en la tabla, y el mensaje del servidor dice cuál es.
          if ((falla as { error?: { motivo?: string } }).error?.motivo === 'FALTA_DECIDIR') {
            await this.revisarDeNuevo();
          }
          throw falla;
        });

      this.agendada.emit(
        `Serie agendada: ${clases.length} ${clases.length === 1 ? 'clase' : 'clases'}.` +
          (saltadas.length > 0
            ? ` Se ${saltadas.length === 1 ? 'saltó 1 fecha' : `saltaron ${saltadas.length} fechas`}.`
            : '') +
          (canceladas.length > 0
            ? ` Avisamos a ${canceladas.length} ${
                canceladas.length === 1
                  ? 'persona que tenía su hora'
                  : 'personas que tenían su hora'
              }.`
            : ''),
      );
      this.datos = enBlanco();
      this.fechas.set(null);
      this.revisada = null;
    });
  }

  /**
   * Vuelve a simular la serie ya revisada. Lo decidido se mantiene solo en las fechas que
   * siguen igual: si una cambió, cancelar podría alcanzar una reserva que el admin no vio.
   */
  private async revisarDeNuevo(): Promise<void> {
    const antes = new Map((this.fechas() ?? []).map((fila) => [fila.fecha, JSON.stringify(fila)]));
    const { fechas } = await this.api.simularSerie(this.serie());
    const iguales = new Set(
      fechas
        .filter((fila) => antes.get(fila.fecha) === JSON.stringify(fila))
        .map((fila) => fila.fecha),
    );

    this.fechas.set(fechas);
    this.decisiones.update((actuales) =>
      Object.fromEntries(Object.entries(actuales).filter(([fecha]) => iguales.has(fecha))),
    );
  }

  private serie(): SerieNueva {
    // En el gimnasio, sin cancha y sin nivel: el servidor rechaza los dos (T231).
    const enElGimnasio = this.datos.tipo === 'PREPARACION_FISICA';

    return {
      tipo: this.datos.tipo,
      // Los `select` devuelven texto aunque el valor sea un número.
      profesorId: this.profesorFijo() ?? Number(this.datos.profesorId),
      dias: this.datos.dias.map((dia) => ({
        diaSemana: dia.diaSemana,
        horaDesde: horaATexto(dia.horaDesde),
        horaHasta: horaATexto(dia.horaHasta),
        ...(enElGimnasio ? {} : { canchaId: Number(dia.canchaId) }),
      })),
      desde: fechaATexto(this.datos.desde),
      hasta: fechaATexto(this.datos.hasta),
      cupoMaximo:
        enElGimnasio && this.datos.modalidad === 'individual' ? 1 : Number(this.datos.cupoMaximo),
      ...(enElGimnasio ? {} : { nivel: this.datos.nivel }),
      notas: this.datos.notas,
    };
  }

  private async intentar(clave: string, accion: () => Promise<void>): Promise<void> {
    this.error.set(null);
    this.trabajando.set(true);
    this.enCurso.set(clave);

    try {
      await accion();
    } catch (falla) {
      // El del servidor: dice qué fecha y qué folio, si apareció una reserva al confirmar.
      this.error.set(mensajeDelServidor(falla, 'No se pudo agendar la serie.'));
    } finally {
      this.trabajando.set(false);
      this.enCurso.set(null);
    }
  }
}
