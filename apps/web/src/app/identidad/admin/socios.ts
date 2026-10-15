import {
  Component,
  computed,
  effect,
  inject,
  resource,
  signal,
  untracked,
} from '@angular/core';

import { proveerCampos } from '../../ui/campos';
import { fechaATexto, proveerFechaYHora } from '../../ui/fecha-y-hora';
import { Esqueleto } from '../../ui/esqueleto';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { MatButton } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatPaginator } from '@angular/material/paginator';

import { hoyEnElClub } from '../../catalogo-canchas/reloj-del-club';
import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { EstadoVacio } from '../../ui/estado-vacio';
import { proveerPaginador } from '../../ui/paginador';
import { FichaSocio } from './ficha-socio';
import {
  AltaDeSocio,
  EstadoSocio,
  SocioDelClub,
  Socios,
  cuotaVencida,
  enDiaMes,
  ESTADOS_SOCIO,
} from './socios.service';
import { LO_HECHO } from '../../ui/material';

interface Formulario {
  email: string;
  numeroSocio: string;
  /** Como la entrega el calendario de Material, y a texto al dar el alta (A5, T244). */
  alDiaHasta: Date | null;
}

const EN_BLANCO: Formulario = { email: '', numeroSocio: '', alDiaHasta: null };

/**
 * Los socios del club, desde la administración.
 *
 * El alta pide **solo el correo**: el club asigna el número correlativo y deja al
 * socio al día hasta fin de mes. Pedir los tres datos convertiría el caso normal
 * —"lo aceptamos, mándale la invitación"— en un formulario que hay que estudiar.
 */
@Component({
  selector: 'app-socios',
  imports: [
    MatTableModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInput,
    MatButton,
    MatIcon,
    Esqueleto,
    FormsModule,
    Aviso,
    EstadoVacio,
    MatPaginator,
    MatButtonToggleModule,
    FichaSocio,
    MatChipsModule,
  ],
  providers: [proveerCampos(), proveerFechaYHora(), proveerPaginador()],
  template: `
    <!-- La cabecera del panel (TV7.1), sin acción: dar de alta es su sección. -->
    <header class="cabecera-panel">
      <h1 class="titular text-4xl">Socios</h1>
    </header>

    <section class="mt-6" aria-labelledby="titulo-alta">
      <h2 id="titulo-alta" class="rotulo-seccion">
        Dar de alta un socio
      </h2>
      <p class="mt-2 text-sm text-muted-foreground">
        Alcanza con el correo. Cuando esa persona cree su cuenta —con contraseña o
        con Google— le aparece la ficha de socio sola.
      </p>

      <form class="mt-3 flex flex-wrap items-end gap-3" (ngSubmit)="invitar()">
        <mat-form-field class="w-64">
          <mat-label>Correo</mat-label>
          <input
            matInput
            id="email-socio"
            name="email-socio"
            type="email"
            [(ngModel)]="formulario.email"
          />
        </mat-form-field>

        <!-- Sin texto de ayuda: el marcador "automático" ya lo dice, y una línea
             de más acá desalinea la fila entera del formulario. -->
        <mat-form-field class="w-32">
          <mat-label>Número</mat-label>
          <input
            matInput
            id="numero-socio"
            name="numero-socio"
            placeholder="automático"
            [(ngModel)]="formulario.numeroSocio"
          />
        </mat-form-field>

        <mat-form-field class="abre-al-tocar">
          <mat-label>Al día hasta</mat-label>
          <input
            matInput
            id="al-dia-hasta"
            name="al-dia-hasta"
            placeholder="dd-mm-aaaa"
            autocomplete="off"
            [matDatepicker]="calendarioAlDiaHasta"
            [(ngModel)]="formulario.alDiaHasta"
          />
          <mat-datepicker-toggle matIconSuffix [for]="calendarioAlDiaHasta" />
          <mat-datepicker #calendarioAlDiaHasta />
        </mat-form-field>

        <button
          matButton="filled"
          type="submit"
          [disabled]="guardando()"
          [attr.aria-busy]="guardando()"
        >
          Invitar
        </button>
      </form>

      @if (error(); as falla) {
        <app-aviso variante="error" class="mt-3 block">{{ falla }}</app-aviso>
      }
    </section>

    <section class="mt-8" aria-labelledby="titulo-pendientes">
      <h2 id="titulo-pendientes" class="rotulo-seccion">
        Invitaciones pendientes
      </h2>

      @if (listado.hasValue()) {
        @let datos = listado.value();
        @if (datos.invitaciones.length === 0) {
          <p class="mt-2 text-sm text-muted-foreground">
            No hay invitaciones pendientes: todos los correos invitados ya tienen
            su cuenta.
          </p>
        } @else {
          <ul class="mt-3 space-y-2">
            @for (invitacion of datos.invitaciones; track invitacion.id) {
              <li
                class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border
                       border-border bg-card p-3 text-sm shadow-sm"
              >
                <mat-icon class="text-muted-foreground" aria-hidden="true">mail</mat-icon>
                <span class="font-medium">{{ invitacion.email }}</span>
                <span class="text-muted-foreground">
                  socio {{ invitacion.numeroSocio }}
                </span>
                <button
                  matButton="outlined"
                  type="button"
                  class="peligro chico ms-auto"
                  (click)="revocar(invitacion.id, invitacion.email)"
                >
                  Revocar
                  <span class="sr-only">la invitación de {{ invitacion.email }}</span>
                </button>
              </li>
            }
          </ul>
        }
      }
    </section>

    <section class="mt-8" aria-labelledby="titulo-socios">
      <div class="flex flex-wrap items-center gap-3">
        <h2 id="titulo-socios" class="rotulo-seccion">Socios</h2>
        <mat-chip-set class="insignias">
          <mat-chip class="insignia info">
            <mat-icon matChipAvatar aria-hidden="true">group</mat-icon>
            {{ listado.hasValue() ? listado.value().socios.length : 0 }}
          </mat-chip>
        </mat-chip-set>
      </div>

      <div class="mt-3 flex flex-wrap items-end gap-3">
        <mat-form-field class="min-w-64 flex-1">
          <mat-label>Buscar</mat-label>
          <input
            matInput
            type="search"
            name="buscar"
            placeholder="Nombre, correo o número"
            [ngModel]="busqueda()"
            (ngModelChange)="busqueda.set($event)"
          />
        </mat-form-field>

        <mat-button-toggle-group
          aria-label="Filtrar por estado"
          hideSingleSelectionIndicator
          [value]="filtro()"
          (change)="filtro.set($event.value)"
        >
          @for (opcion of FILTROS; track opcion.valor) {
            <mat-button-toggle [value]="opcion.valor">
              {{ opcion.etiqueta }}
            </mat-button-toggle>
          }
        </mat-button-toggle-group>
      </div>

      @if (listado.isLoading()) {
        <app-esqueleto class="mt-3 block" [filas]="6" etiqueta="Cargando el padrón…" />
      } @else if (listado.error()) {
        <p class="mt-3 text-destructive">
          No se pudo cargar el padrón. Reintenta en un momento.
        </p>
      } @else if (filtrados().length === 0) {
        <app-estado-vacio
          class="mt-4 block"
          icono="person_search"
          titulo="Ningún socio coincide"
          detalle="Prueba con otro texto o quita el filtro de estado."
        />
      } @else {
        <div class="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
          <table mat-table [dataSource]="pagina()">
            <caption class="sr-only">
              Socios del club, {{ filtrados().length }} en total
            </caption>
            <ng-container matColumnDef="numero">
              <th mat-header-cell *matHeaderCellDef scope="col">Número</th>
              <td mat-cell *matCellDef="let socio" class="font-mono text-sm">
                {{ socio.numeroSocio }}
              </td>
            </ng-container>
            <ng-container matColumnDef="nombre">
              <th mat-header-cell *matHeaderCellDef scope="col">Nombre</th>
              <td mat-cell *matCellDef="let socio" class="font-medium">
                {{ socio.usuario.nombre }} {{ socio.usuario.apellido }}
              </td>
            </ng-container>
            <ng-container matColumnDef="correo">
              <th mat-header-cell *matHeaderCellDef scope="col">Correo</th>
              <td mat-cell *matCellDef="let socio" class="text-sm text-muted-foreground">
                {{ socio.usuario.email }}
              </td>
            </ng-container>
            <ng-container matColumnDef="estado">
              <th mat-header-cell *matHeaderCellDef scope="col">Estado</th>
              <td mat-cell *matCellDef="let socio">
                <!-- Calculado acá y no leído de la fecha: si no, el admin
                     compara mentalmente seis fechas contra hoy, una por una. -->
                @if (socio.estado !== 'ACTIVO') {
                  <mat-chip-set class="insignias">
                    <mat-chip class="insignia neutro">
                      <mat-icon matChipAvatar aria-hidden="true">pause_circle</mat-icon>
                      {{ nombreEstado(socio.estado) }}
                    </mat-chip>
                  </mat-chip-set>
                } @else if (moroso(socio.alDiaHasta)) {
                  <mat-chip-set class="insignias">
                    <mat-chip class="insignia error">
                      <mat-icon matChipAvatar aria-hidden="true">cancel</mat-icon>
                      Cuota vencida
                    </mat-chip>
                  </mat-chip-set>
                } @else {
                  <mat-chip-set class="insignias">
                    <mat-chip class="insignia exito">
                      <mat-icon matChipAvatar aria-hidden="true">check_circle</mat-icon>
                      Al día
                    </mat-chip>
                  </mat-chip-set>
                }
              </td>
            </ng-container>
            <ng-container matColumnDef="alDiaHasta">
              <th mat-header-cell *matHeaderCellDef scope="col">Al día hasta</th>
              <td mat-cell *matCellDef="let socio" class="text-sm whitespace-nowrap">
                {{ enDiaMes(socio.alDiaHasta) }}
              </td>
            </ng-container>
            <ng-container matColumnDef="acciones">
              <th mat-header-cell *matHeaderCellDef scope="col">
                <span class="sr-only">Acciones</span>
              </th>
              <td mat-cell *matCellDef="let socio">
                <!-- Sin cortes: en el teléfono la tabla se desplaza igual, y a
                     su ancho mínimo partía "Ver ficha" en dos líneas (TV7.4). -->
                <button
                  matButton="outlined"
                  type="button"
                  class="chico whitespace-nowrap"
                  (click)="editando.set(socio)"
                >
                  Ver ficha
                  <span class="sr-only">
                    de {{ socio.usuario.nombre }} {{ socio.usuario.apellido }}
                  </span>
                </button>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="COLUMNAS; sticky: true"></tr>
            <tr mat-row *matRowDef="let socio; columns: COLUMNAS"></tr>
          </table>
        </div>

        <!-- La ficha es un MatDialog (T252): se dibuja sobre la página, y acá solo vive
             mientras está abierta. -->
        @if (editando(); as socio) {
          <app-ficha-socio
            [socio]="socio"
            (guardado)="recargar()"
            (cerrado)="editando.set(null)"
          />
        }

        @if (filtrados().length > POR_PAGINA) {
          <mat-paginator
            class="mt-4"
            aria-label="Páginas del padrón"
            hidePageSize
            [length]="filtrados().length"
            [pageSize]="POR_PAGINA"
            [pageIndex]="paginaActual() - 1"
            (page)="paginaActual.set($event.pageIndex + 1)"
          />
        }
      }
    </section>
  `,
})
export class SociosPanel {
  private readonly snackBar = inject(MatSnackBar);
  private readonly api = inject(Socios);

  protected readonly formulario: Formulario = { ...EN_BLANCO };

  protected readonly busqueda = signal('');
  protected readonly filtro = signal('todos');
  protected readonly paginaActual = signal(1);

  /** El socio cuya ficha está abierta. Nulo es lo normal. */
  protected readonly COLUMNAS = ['numero', 'nombre', 'correo', 'estado', 'alDiaHasta', 'acciones'];

  protected readonly editando = signal<SocioDelClub | null>(null);

  protected readonly POR_PAGINA = 10;

  protected readonly FILTROS = [
    { valor: 'todos', etiqueta: 'Todos' },
    { valor: 'al-dia', etiqueta: 'Al día' },
    { valor: 'vencidos', etiqueta: 'Cuota vencida' },
    { valor: 'inactivos', etiqueta: 'Suspendidos' },
  ];

  /**
   * Lo que el club está mirando: el texto del buscador y el filtro de estado.
   *
   * Filtra en el navegador porque el listado ya viene entero del servidor. El día
   * que el club tenga miles de socios, esto pasa a ser un parámetro de la
   * consulta y la tabla no se entera.
   */
  protected readonly filtrados = computed(() => {
    const texto = this.busqueda().trim().toLowerCase();
    const filtro = this.filtro();

    // Se lee también fuera de la rama del error, en la paginación.
    return (this.listado.hasValue() ? this.listado.value().socios : []).filter((socio) => {
      const coincide =
        texto === '' ||
        `${socio.numeroSocio} ${socio.usuario.nombre} ${socio.usuario.apellido} ${socio.usuario.email}`
          .toLowerCase()
          .includes(texto);

      const estado =
        filtro === 'todos' ||
        (filtro === 'inactivos' && socio.estado !== 'ACTIVO') ||
        (filtro === 'vencidos' &&
          socio.estado === 'ACTIVO' &&
          this.moroso(socio.alDiaHasta)) ||
        (filtro === 'al-dia' &&
          socio.estado === 'ACTIVO' &&
          !this.moroso(socio.alDiaHasta));

      return coincide && estado;
    });
  });

  /** La tanda que se ve. Volver a la primera al filtrar evita la página vacía. */
  protected readonly pagina = computed(() => {
    const desde = (this.paginaActual() - 1) * this.POR_PAGINA;

    return this.filtrados().slice(desde, desde + this.POR_PAGINA);
  });

  constructor() {
    effect(() => {
      // Se leen para depender de ellos: al cambiar la búsqueda o el filtro, la
      // página 4 de un resultado de dos deja la tabla en blanco.
      this.busqueda();
      this.filtro();
      untracked(() => this.paginaActual.set(1));
    });
  }

  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Se recarga al cambiar, que es lo que refresca las dos listas tras cada acción. */
  private readonly version = signal(0);

  protected readonly listado = resource({
    params: () => ({ version: this.version() }),
    loader: () => this.api.listado(),
  });

  // Un valor y no un `computed`: no depende de ninguna señal, y envolverlo
  // prometería una reactividad que no existe.
  protected readonly hoy = hoyEnElClub();

  protected async invitar(): Promise<void> {
    this.error.set(null);

    const email = this.formulario.email.trim().toLowerCase();
    if (!email) {
      this.error.set('Escribe el correo de la persona que entra al club.');
      return;
    }

    // Solo lo que el admin escribió: los campos vacíos no viajan, para que el
    // servidor use sus valores por defecto en vez de recibir un texto vacío.
    const datos: AltaDeSocio = { email };
    if (this.formulario.numeroSocio.trim()) {
      datos.numeroSocio = this.formulario.numeroSocio.trim();
    }
    const alDiaHasta = fechaATexto(this.formulario.alDiaHasta);
    if (alDiaHasta) datos.alDiaHasta = alDiaHasta;

    this.guardando.set(true);
    try {
      await this.api.invitar(datos);
      this.snackBar.open(
        `${email} queda como socio en cuanto cree su cuenta con ese correo.`,
        undefined,
        LO_HECHO,
      );
      Object.assign(this.formulario, EN_BLANCO);
      this.recargar();
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla));
    } finally {
      this.guardando.set(false);
    }
  }

  protected async revocar(id: number, email: string): Promise<void> {
    this.error.set(null);

    try {
      await this.api.revocar(id);
      this.snackBar.open(`Se anuló la invitación de ${email}.`, undefined, LO_HECHO);
      this.recargar();
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla));
    }
  }

  protected recargar(): void {
    this.version.update((v) => v + 1);
  }

  protected nombreEstado(estado: EstadoSocio): string {
    return ESTADOS_SOCIO[estado] ?? estado;
  }

  protected moroso(alDiaHasta: string): boolean {
    return cuotaVencida(alDiaHasta, this.hoy);
  }

  protected readonly enDiaMes = enDiaMes;
}
