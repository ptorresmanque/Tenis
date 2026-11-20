import { LiveAnnouncer } from '@angular/cdk/a11y';
import {
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  resource,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { ActivatedRoute, Params, Router } from '@angular/router';

import { enPesos, hoyEnElClub } from '../catalogo-canchas/reloj-del-club';
import { DescargarCsv } from '../reportes/descargar-csv';
import { proveerCampos } from '../ui/campos';
import { Esqueleto } from '../ui/esqueleto';
import { EstadoVacio } from '../ui/estado-vacio';
import { fechaATexto, proveerFechaYHora, textoAFecha } from '../ui/fecha-y-hora';
import { proveerPaginador } from '../ui/paginador';
import { FichaDelPago } from './ficha-del-pago';
import {
  ESTADO_DEL_PAGO,
  fechaYHoraDelClub,
  MEDIO_DEL_PAGO,
  medioDelPago,
} from './pagos-en-palabras';
import {
  ConceptoDelPago,
  EstadoDelPago,
  FilaDePago,
  FiltroDePagos,
  MedioDelPago,
  OrigenDelPago,
  PagosDelClub,
} from './pagos.service';

const CONCEPTOS: { valor: ConceptoDelPago; etiqueta: string }[] = [
  { valor: 'RESERVA', etiqueta: 'Reservas' },
  { valor: 'CUOTA', etiqueta: 'Cuotas' },
  { valor: 'INSCRIPCION', etiqueta: 'Inscripciones' },
];

const ESTADOS = Object.keys(ESTADO_DEL_PAGO) as EstadoDelPago[];

const MEDIOS_DE_PAGO: MedioDelPago[] = ['WEBPAY', 'EFECTIVO', 'TRANSFERENCIA'];

const MEDIOS: { valor: MedioDelPago | 'TODOS'; etiqueta: string }[] = [
  { valor: 'TODOS', etiqueta: 'Todos' },
  ...MEDIOS_DE_PAGO.map((valor) => ({ valor, etiqueta: MEDIO_DEL_PAGO[valor] })),
];

/**
 * Finanzas › Pagos (T398, `SPEC-panel.md` § Los pagos del club): los pagos por Webpay y los
 * cobros del mesón, uno por uno, con su resumen y su planilla. Solo el admin entra (el guard del
 * panel no se la abre a nadie más).
 *
 * Todo lo elegido va en la dirección, como en Personas: un enlace a un filtro se comparte, y
 * volver atrás vuelve al filtro anterior. Cambiar un filtro o el orden vuelve a la primera página.
 */
@Component({
  selector: 'app-pagos-del-club',
  imports: [
    DescargarCsv,
    Esqueleto,
    EstadoVacio,
    FichaDelPago,
    FormsModule,
    MatButton,
    MatButtonToggleModule,
    MatChipsModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIcon,
    MatInput,
    MatPaginatorModule,
    MatSelectModule,
    MatSlideToggle,
    MatSortModule,
    MatTableModule,
    ReactiveFormsModule,
  ],
  providers: [proveerCampos(), proveerPaginador(), proveerFechaYHora()],
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-muted-foreground">
        Los pagos por Webpay y los cobros del mesón, uno por uno.
      </p>
      <app-descargar-csv [url]="urlDelCsv()" />
    </div>

    <!-- Los filtros, con lo que vale por omisión a la vista: el mes en curso y todo lo demás. -->
    <div class="mt-4 flex flex-wrap items-start gap-3">
      <mat-form-field class="w-72">
        <mat-label>Fechas</mat-label>
        <mat-date-range-input [formGroup]="rango" [rangePicker]="calendario">
          <input matStartDate formControlName="desde" aria-label="Desde" />
          <input matEndDate formControlName="hasta" aria-label="Hasta" />
        </mat-date-range-input>
        <mat-hint>dd-mm-aaaa – dd-mm-aaaa</mat-hint>
        <mat-datepicker-toggle matIconSuffix [for]="calendario" />
        <mat-date-range-picker #calendario>
          <mat-date-range-picker-actions>
            <button matButton matDateRangePickerCancel>Cancelar</button>
            <button matButton="filled" matDateRangePickerApply>Aplicar</button>
          </mat-date-range-picker-actions>
        </mat-date-range-picker>
        <mat-error>Elige dos fechas válidas, la primera antes que la segunda.</mat-error>
      </mat-form-field>

      <mat-form-field class="w-56">
        <mat-label>Estado</mat-label>
        <mat-select data-estado [value]="filtro().estado ?? ''" (selectionChange)="filtrarEstado($event.value)">
          <mat-option value="">Todos</mat-option>
          @for (estado of ESTADOS; track estado) {
            <mat-option [value]="estado">{{ ESTADO_DEL_PAGO[estado].palabra }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <form role="search" class="flex min-w-64 flex-1 items-start gap-3" (ngSubmit)="buscar()">
        <mat-form-field class="flex-1">
          <mat-label>Buscar</mat-label>
          <input
            matInput
            name="busqueda"
            type="search"
            [ngModel]="textoBuscado()"
            (ngModelChange)="textoBuscado.set($event)"
          />
          <mat-hint>Orden de compra, autorización, nombre o folio</mat-hint>
        </mat-form-field>
        <button matButton="outlined" type="submit">Buscar</button>
      </form>
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
      <!-- Varios a la vez; ninguno es todos. -->
      <mat-chip-listbox
        multiple
        aria-label="Concepto"
        [value]="filtro().conceptos"
        (change)="filtrarConceptos($event.value)"
      >
        @for (opcion of CONCEPTOS; track opcion.valor) {
          <mat-chip-option [value]="opcion.valor">{{ opcion.etiqueta }}</mat-chip-option>
        }
      </mat-chip-listbox>

      <mat-button-toggle-group
        aria-label="Medio"
        hideSingleSelectionIndicator
        [value]="filtro().medio ?? 'TODOS'"
        (change)="filtrarMedio($event.value)"
      >
        @for (opcion of MEDIOS; track opcion.valor) {
          <mat-button-toggle [value]="opcion.valor">{{ opcion.etiqueta }}</mat-button-toggle>
        }
      </mat-button-toggle-group>

      <!-- Se aplica al instante: es un interruptor y no parte de un formulario (Material). -->
      <mat-slide-toggle [checked]="filtro().porRevisar" (change)="soloPorRevisar($event.checked)">
        Solo por revisar
      </mat-slide-toggle>
    </div>

    <p class="mt-3 text-sm text-muted-foreground">
      Las reservas de visitante cobradas en el mesón no aparecen: el sistema no guarda su monto.
    </p>

    @if (listado.hasValue()) {
      <!-- Del filtro entero, no de la página (asunción 6). -->
      <ul data-resumen class="mt-6 grid gap-3 sm:grid-cols-3">
        @for (dato of resumen(); track dato.titulo) {
          <li>
            <p class="flex items-center gap-2 text-sm text-muted-foreground">
              <mat-icon class="text-primary" aria-hidden="true">{{ dato.icono }}</mat-icon>
              {{ dato.titulo }}
            </p>
            <p class="mt-1 font-display text-3xl font-bold tabular-nums">{{ dato.valor }}</p>
          </li>
        }
      </ul>
    }

    @if (listado.isLoading() && !listado.hasValue()) {
      <app-esqueleto class="mt-6 block" [filas]="6" etiqueta="Buscando los pagos…" />
    } @else if (listado.error()) {
      <p class="mt-6 text-destructive">No se pudo cargar la lista. Reintenta en un momento.</p>
    } @else if (listado.hasValue()) {
      @if (listado.value().pagos.length === 0) {
        <app-estado-vacio
          class="mt-6 block"
          icono="search_off"
          titulo="Ningún pago coincide"
          detalle="Prueba con otras fechas o quita un filtro."
        />
      } @else {
        <p class="mt-6 text-sm text-muted-foreground">
          {{ listado.value().total }} {{ listado.value().total === 1 ? 'pago' : 'pagos' }}
        </p>
        <!-- Se desplaza de lado en el teléfono: el contenedor es una parada del teclado, con
             nombre (modern-web-guidance, sortable-table y responsive-table). -->
        <div
          role="region"
          tabindex="0"
          aria-label="Pagos del club"
          class="mt-2 overflow-x-auto rounded-xl border border-border bg-card"
        >
          <table
            mat-table
            matSort
            matSortStart="desc"
            matSortDisableClear
            aria-label="Pagos del club"
            [matSortActive]="filtro().orden"
            [matSortDirection]="filtro().direccion"
            [dataSource]="listado.value().pagos"
            (matSortChange)="ordenar($event)"
          >
            <ng-container matColumnDef="fecha">
              <th mat-header-cell *matHeaderCellDef mat-sort-header sortActionDescription="Ordenar por fecha" scope="col">
                Fecha
              </th>
              <td mat-cell *matCellDef="let pago" class="text-sm whitespace-nowrap tabular-nums">
                {{ fechaYHora(pago.fecha) }}
              </td>
            </ng-container>
            <ng-container matColumnDef="concepto">
              <th mat-header-cell *matHeaderCellDef scope="col">Concepto</th>
              <td mat-cell *matCellDef="let pago" class="text-sm">{{ pago.detalle }}</td>
            </ng-container>
            <ng-container matColumnDef="quien">
              <th mat-header-cell *matHeaderCellDef scope="col">Quién pagó</th>
              <td mat-cell *matCellDef="let pago" class="text-sm">
                <span class="font-medium">{{ pago.quien }}</span>
                <span class="block text-muted-foreground">{{ pago.esSocio ? 'Socio' : 'Visitante' }}</span>
              </td>
            </ng-container>
            <ng-container matColumnDef="medio">
              <th mat-header-cell *matHeaderCellDef scope="col">Medio</th>
              <td mat-cell *matCellDef="let pago" class="text-sm whitespace-nowrap">{{ medioDe(pago) }}</td>
            </ng-container>
            <ng-container matColumnDef="monto">
              <!-- Los números a la derecha (Material, table). -->
              <th
                mat-header-cell
                *matHeaderCellDef
                mat-sort-header
                arrowPosition="before"
                sortActionDescription="Ordenar por monto"
                scope="col"
                class="text-end"
              >
                Monto
              </th>
              <td mat-cell *matCellDef="let pago" class="text-end tabular-nums whitespace-nowrap">
                {{ pesos(pago.montoClp) }}
              </td>
            </ng-container>
            <ng-container matColumnDef="estado">
              <th mat-header-cell *matHeaderCellDef scope="col">Estado</th>
              <td mat-cell *matCellDef="let pago">
                @let insignia = insigniaDe(pago);
                <mat-chip-set class="insignias" aria-label="Estado del pago">
                  <mat-chip class="insignia" [class]="insignia.variante">
                    <mat-icon matChipAvatar aria-hidden="true">{{ insignia.icono }}</mat-icon>
                    {{ insignia.palabra }}
                  </mat-chip>
                </mat-chip-set>
              </td>
            </ng-container>
            <ng-container matColumnDef="revision">
              <th mat-header-cell *matHeaderCellDef scope="col">Revisión</th>
              <td mat-cell *matCellDef="let pago">
                @if (pago.porRevisar) {
                  <mat-chip-set class="insignias" aria-label="Revisión del pago">
                    <mat-chip class="insignia aviso">
                      <mat-icon matChipAvatar aria-hidden="true">flag</mat-icon>
                      Por revisar
                    </mat-chip>
                  </mat-chip-set>
                } @else {
                  <span aria-hidden="true">—</span><span class="sr-only">Nada por revisar</span>
                }
              </td>
            </ng-container>

            <ng-container matColumnDef="ver">
              <th mat-header-cell *matHeaderCellDef scope="col"><span class="sr-only">Ficha</span></th>
              <td mat-cell *matCellDef="let pago">
                <!-- El nombre dice cuál: en la tabla, veinte «Ver el pago» iguales no le sirven al
                     lector de pantalla. -->
                <button matButton type="button" class="whitespace-nowrap" (click)="abrirFicha(pago)">
                  Ver el pago<span class="sr-only">
                    de {{ pago.quien }}, {{ fechaYHora(pago.fecha) }}</span
                  >
                </button>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="COLUMNAS; sticky: true"></tr>
            <tr mat-row *matRowDef="let pago; columns: COLUMNAS"></tr>
          </table>
        </div>

        @if (listado.value().total > listado.value().porPagina) {
          <mat-paginator
            class="mt-4"
            aria-label="Páginas de pagos"
            hidePageSize
            showFirstLastButtons
            [length]="listado.value().total"
            [pageSize]="listado.value().porPagina"
            [pageIndex]="paginaElegida() - 1"
            (page)="irALaPagina($event)"
          />
        }
      }
    }

    @if (pagoAbierto(); as abierto) {
      <app-ficha-del-pago
        [origen]="abierto.origen"
        [id]="abierto.id"
        (cerrar)="ir({ pago: null })"
        (cambio)="listado.reload()"
      />
    }
  `,
})
export class PagosPanel {
  private readonly api = inject(PagosDelClub);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly anunciador = inject(LiveAnnouncer);

  // Lo que trae la URL, como texto: se valida antes de usarlo.
  readonly desde = input<string>();
  readonly hasta = input<string>();
  readonly concepto = input<string>();
  readonly estado = input<string>();
  readonly medio = input<string>();
  readonly q = input<string>();
  readonly porRevisar = input<string>();
  readonly orden = input<string>();
  readonly direccion = input<string>();
  readonly pagina = input<string>();
  /** La ficha abierta, «webpay-7»: un enlace la abre (la ficha de la reserva enlaza acá). */
  readonly pago = input<string>();

  protected readonly CONCEPTOS = CONCEPTOS;
  protected readonly ESTADOS = ESTADOS;
  protected readonly ESTADO_DEL_PAGO = ESTADO_DEL_PAGO;
  protected readonly MEDIOS = MEDIOS;
  protected readonly COLUMNAS = [
    'fecha',
    'concepto',
    'quien',
    'medio',
    'monto',
    'estado',
    'revision',
    'ver',
  ];

  /** El filtro de la URL, con lo que no se entiende reemplazado por lo de siempre. */
  protected readonly filtro = computed((): FiltroDePagos => {
    const hoy = hoyEnElClub();
    const mesEnCurso = { desde: `${hoy.slice(0, 7)}-01`, hasta: ultimoDiaDelMes(hoy) };
    const desde = esFecha(this.desde()) ? this.desde()! : mesEnCurso.desde;
    const hasta = esFecha(this.hasta()) ? this.hasta()! : mesEnCurso.hasta;
    const rango = desde <= hasta ? { desde, hasta } : mesEnCurso;
    const conceptos = (this.concepto() ?? '')
      .split(',')
      .filter((uno): uno is ConceptoDelPago => CONCEPTOS.some(({ valor }) => valor === uno));

    return {
      ...rango,
      conceptos,
      estado: ESTADOS.find((uno) => uno === this.estado()) ?? null,
      medio: MEDIOS_DE_PAGO.find((uno) => uno === this.medio()) ?? null,
      q: this.q() ?? '',
      porRevisar: this.porRevisar() === 'true',
      orden: this.orden() === 'monto' ? 'monto' : 'fecha',
      direccion: this.direccion() === 'asc' ? 'asc' : 'desc',
    };
  });

  protected readonly pagoAbierto = computed(() => {
    const [, origen, id] = /^(webpay|cuota|inscripcion)-(\d+)$/.exec(this.pago() ?? '') ?? [];
    return origen ? { origen: origen as OrigenDelPago, id: Number(id) } : null;
  });

  protected readonly paginaElegida = computed(() => {
    const numero = Number(this.pagina());
    return Number.isInteger(numero) && numero >= 1 ? numero : 1;
  });

  /** Lo escrito en el buscador; vuelve a lo de la URL si la URL cambia. */
  protected readonly textoBuscado = linkedSignal(() => this.q() ?? '');

  protected readonly listado = resource({
    params: () => ({ filtro: this.filtro(), pagina: this.paginaElegida() }),
    loader: ({ params }) => this.api.listar(params.filtro, params.pagina),
  });

  protected readonly urlDelCsv = computed(() => this.api.urlDelCsv(this.filtro()));

  protected readonly resumen = computed(() => {
    const resumen = this.listado.hasValue() ? this.listado.value().resumen : null;
    return [
      { titulo: 'Cobrado', icono: 'payments', valor: enPesos(resumen?.cobradoClp ?? 0) },
      { titulo: 'Devuelto', icono: 'money_off', valor: enPesos(resumen?.devueltoClp ?? 0) },
      { titulo: 'Por revisar', icono: 'flag', valor: String(resumen?.porRevisar ?? 0) },
    ];
  });

  /** El rango del calendario, que se aplica con «Aplicar» o al escribir las dos fechas. */
  protected readonly rango = new FormGroup({
    desde: new FormControl<Date | null>(null),
    hasta: new FormControl<Date | null>(null),
  });

  constructor() {
    // El calendario muestra lo de la URL, sin volver a navegar por eso.
    effect(() => {
      const { desde, hasta } = this.filtro();
      this.rango.setValue(
        { desde: textoAFecha(desde), hasta: textoAFecha(hasta) },
        { emitEvent: false },
      );
    });

    this.rango.valueChanges.pipe(takeUntilDestroyed()).subscribe(({ desde, hasta }) => {
      const nuevoDesde = fechaATexto(desde ?? null);
      const nuevoHasta = fechaATexto(hasta ?? null);
      // A medio escribir, o al revés: se espera a que las dos estén bien.
      if (!nuevoDesde || !nuevoHasta || nuevoDesde > nuevoHasta) return;

      const actual = untracked(this.filtro);
      if (nuevoDesde === actual.desde && nuevoHasta === actual.hasta) return;
      this.ir({ desde: nuevoDesde, hasta: nuevoHasta, pagina: null });
    });
  }

  protected filtrarConceptos(valores: ConceptoDelPago[]): void {
    this.ir({ concepto: valores.length > 0 ? valores.join(',') : null, pagina: null });
  }

  protected filtrarEstado(valor: EstadoDelPago | ''): void {
    this.ir({ estado: valor || null, pagina: null });
  }

  protected filtrarMedio(valor: MedioDelPago | 'TODOS'): void {
    this.ir({ medio: valor === 'TODOS' ? null : valor, pagina: null });
  }

  protected soloPorRevisar(activo: boolean): void {
    this.ir({ porRevisar: activo ? 'true' : null, pagina: null });
  }

  protected buscar(): void {
    this.ir({ q: this.textoBuscado().trim() || null, pagina: null });
  }

  /**
   * Ordena en el servidor y vuelve a la primera página. El lector no anuncia el cambio de
   * `aria-sort`: se dice con el anunciador (Material, sort).
   */
  protected ordenar({ active, direction }: Sort): void {
    const orden = active === 'monto' ? 'monto' : 'fecha';
    const direccion = direction === 'asc' ? 'asc' : 'desc';
    void this.anunciador.announce(
      `Ordenado por ${orden}, ${direccion === 'asc' ? 'de menor a mayor' : 'de mayor a menor'}.`,
    );
    this.ir({ orden, direccion, pagina: null });
  }

  /** Por la URL: volver atrás la cierra, y el enlace se comparte. */
  protected abrirFicha({ origen, id }: FilaDePago): void {
    this.ir({ pago: `${origen}-${id}` });
  }

  protected irALaPagina(evento: PageEvent): void {
    this.ir({ pagina: evento.pageIndex + 1 });
  }

  /** Cambia lo elegido en la URL; el resto de lo que dice se queda. */
  protected ir(cambios: Params): void {
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: cambios,
      queryParamsHandling: 'merge',
    });
  }

  protected insigniaDe(pago: FilaDePago): (typeof ESTADO_DEL_PAGO)[EstadoDelPago] {
    return ESTADO_DEL_PAGO[pago.estado];
  }

  protected readonly fechaYHora = fechaYHoraDelClub;
  protected readonly medioDe = medioDelPago;
  protected readonly pesos = enPesos;
}

/** Una fecha AAAA-MM-DD que existe: «2039-02-30» no. */
function esFecha(texto: string | undefined): boolean {
  return !!texto && fechaATexto(textoAFecha(texto)) === texto;
}

function ultimoDiaDelMes(fecha: string): string {
  const [anio, mes] = fecha.split('-').map(Number);
  return fechaATexto(new Date(anio, mes, 0));
}
