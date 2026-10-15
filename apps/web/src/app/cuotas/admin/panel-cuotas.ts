import { Component, computed, inject, resource, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatIcon } from '@angular/material/icon';
import { pedirMotivo } from '../../ui/dialogo-de-motivo';
import { proveerCampos } from '../../ui/campos';
import { Esqueleto } from '../../ui/esqueleto';

import { enPesos, hoyEnElClub } from '../../catalogo-canchas/reloj-del-club';
import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { EstadoVacio } from '../../ui/estado-vacio';
import { CuotaDelMes, Cuotas, MedioPago } from '../cuotas.service';
import { LO_HECHO } from '../../ui/material';

const MEDIOS: Record<MedioPago, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  WEBPAY: 'Webpay',
};

/** El mes en curso del club, "AAAA-MM". */
function mesActual(): string {
  return hoyEnElClub().slice(0, 7);
}

/**
 * Las cuotas del mes.
 *
 * **No hay botón de "emitir".** Abrir el mes es lo que lo emite, que es la decisión de
 * `SPEC-cuotas.md`: un botón que hay que acordarse de apretar tiene el mismo problema
 * que el cron que se decidió no tener —falla en silencio— y encima invita a apretarlo
 * dos veces.
 */
@Component({
  selector: 'app-panel-cuotas',
  imports: [
    MatFormFieldModule,
    MatInput,
    MatButton,
    MatTableModule,
    Esqueleto,
    Aviso,
    EstadoVacio,
    MatChipsModule,
    MatIcon,
  ],
  providers: [proveerCampos()],
  template: `
    <!-- La cabecera del panel (TV7.1), sin acción: se cobra fila por fila. -->
    <header class="cabecera-panel">
      <div>
        <h1 class="titular text-4xl">Cuotas</h1>
        <p class="mt-1 text-muted-foreground">
          La cuota de cada socio activo, mes a mes. Se emite sola al abrir el mes. La
          incorporación aparece en el mes en que el socio entró.
        </p>
      </div>
    </header>

    <div class="mt-4 flex flex-wrap items-end gap-4">
      <mat-form-field>
        <mat-label>Mes</mat-label>
        <input
          matInput
          id="mes"
          type="month"
          class="cursor-pointer"
          [value]="mes()"
          (change)="cambiarMes($event)"
        />
      </mat-form-field>

      @if (datos.hasValue()) {
        @let mes = datos.value();
        <dl class="flex flex-wrap gap-6">
          <div>
            <dt class="text-sm text-muted-foreground">Emitido</dt>
            <dd class="font-display text-2xl font-bold tabular-nums">
              {{ pesos(mes.totalEmitidoClp) }}
            </dd>
          </div>
          <div>
            <dt class="text-sm text-muted-foreground">Pagado</dt>
            <dd class="font-display text-2xl font-bold text-accent-strong tabular-nums">
              {{ pesos(mes.totalPagadoClp) }}
            </dd>
          </div>
          <div>
            <dt class="text-sm text-muted-foreground">Por cobrar</dt>
            <dd class="font-display text-2xl font-bold text-destructive tabular-nums">
              {{ pesos(porCobrar()) }}
            </dd>
          </div>
        </dl>
      }
    </div>

    @if (error(); as falla) {
      <app-aviso variante="error" class="mt-4 block">{{ falla }}</app-aviso>
    }

    @if (datos.isLoading()) {
      <app-esqueleto class="mt-4 block" [filas]="5" etiqueta="Cargando las cuotas…" />
    } @else if (datos.error()) {
      <p class="mt-4 text-destructive">
        No se pudieron cargar las cuotas. Reintenta en un momento.
      </p>
    } @else if (cuotas().length === 0) {
      <app-estado-vacio
        class="mt-4 block"
        icono="payments"
        titulo="Ninguna cuota en este mes"
        detalle="Se emiten a los socios activos desde el mes en que ingresaron."
      />
    } @else {
      <div class="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
        <table mat-table [dataSource]="cuotas()">
          <caption class="sr-only">
            Cuotas de {{ mes() }}, {{ cuotas().length }} en total
          </caption>
          <ng-container matColumnDef="numero">
            <th mat-header-cell *matHeaderCellDef scope="col">Nº</th>
            <td mat-cell *matCellDef="let cuota" class="font-mono text-sm">
              {{ cuota.socio.numeroSocio }}
            </td>
          </ng-container>
          <ng-container matColumnDef="socio">
            <th mat-header-cell *matHeaderCellDef scope="col">Socio</th>
            <td mat-cell *matCellDef="let cuota" class="font-medium">
              {{ cuota.socio.nombre }}
              @if (cuota.tipo === 'INCORPORACION') {
                <!-- Marcada y no escondida: es deuda de este mes, y un socio nuevo
                     debe dos cuotas. Sin la marca, el club ve su nombre dos veces
                     con montos distintos y no entiende. -->
                <mat-chip-set class="insignias">
                  <mat-chip class="insignia info">
                    <mat-icon matChipAvatar aria-hidden="true">person_add</mat-icon>
                    Incorporación
                  </mat-chip>
                </mat-chip-set>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="monto">
            <th mat-header-cell *matHeaderCellDef scope="col">Monto</th>
            <td mat-cell *matCellDef="let cuota" class="whitespace-nowrap">
              {{ pesos(cuota.montoClp - cuota.descuentoClp) }}
              @if (cuota.descuentoClp > 0) {
                <span class="block text-xs text-muted-foreground">
                  con {{ pesos(cuota.descuentoClp) }} de descuento
                </span>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="estado">
            <th mat-header-cell *matHeaderCellDef scope="col">Estado</th>
            <td mat-cell *matCellDef="let cuota">
              @if (cuota.estado === 'PAGADA') {
                <mat-chip-set class="insignias">
                  <mat-chip class="insignia exito">
                    <mat-icon matChipAvatar aria-hidden="true">check_circle</mat-icon>
                    Pagada
                  </mat-chip>
                </mat-chip-set>
              } @else if (cuota.estado === 'ANULADA') {
                <mat-chip-set class="insignias">
                  <mat-chip class="insignia neutro">
                    <mat-icon matChipAvatar aria-hidden="true">block</mat-icon>
                    Anulada
                  </mat-chip>
                </mat-chip-set>
              } @else {
                <mat-chip-set class="insignias">
                  <mat-chip class="insignia aviso">
                    <mat-icon matChipAvatar aria-hidden="true">schedule</mat-icon>
                    Por cobrar
                  </mat-chip>
                </mat-chip-set>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="cobrar">
            <th mat-header-cell *matHeaderCellDef scope="col">
              <span class="sr-only">Cobrar</span>
            </th>
            <td mat-cell *matCellDef="let cuota">
              @if (cuota.estado === 'PENDIENTE') {
                <div class="flex flex-wrap gap-1">
                  <button
                    matButton="outlined"
                    type="button"
                    class="chico"
                    [disabled]="cobrando()"
                    [attr.aria-busy]="enCurso() === 'cobrar-' + cuota.id + '-EFECTIVO'"
                    (click)="cobrar(cuota, 'EFECTIVO')"
                  >
                    Efectivo
                  </button>
                  <button
                    matButton="outlined"
                    type="button"
                    class="chico"
                    [disabled]="cobrando()"
                    [attr.aria-busy]="enCurso() === 'cobrar-' + cuota.id + '-TRANSFERENCIA'"
                    (click)="cobrar(cuota, 'TRANSFERENCIA')"
                  >
                    Transferencia
                  </button>
                  <!-- Los dos ajustes piden un motivo que el servidor exige, y son
                       de los que el club usa una vez al mes: un formulario propio
                       para eso es una pantalla más que mantener. -->
                  <button
                    matButton
                    type="button"
                    class="chico"
                    [disabled]="cobrando()"
                    [attr.aria-busy]="enCurso() === 'condonar-' + cuota.id"
                    (click)="condonar(cuota)"
                  >
                    Condonar
                  </button>
                  <button
                    matButton
                    type="button"
                    class="peligro chico"
                    [disabled]="cobrando()"
                    [attr.aria-busy]="enCurso() === 'anular-' + cuota.id"
                    (click)="anular(cuota)"
                  >
                    Anular
                  </button>
                </div>
              } @else if (cuota.medio) {
                <span class="text-sm text-muted-foreground">
                  {{ nombreMedio(cuota.medio) }}
                </span>
              }
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="COLUMNAS; sticky: true"></tr>
          <tr mat-row *matRowDef="let cuota; columns: COLUMNAS"></tr>
        </table>
      </div>
    }
  `,
})
export class PanelDeCuotas {
  private readonly snackBar = inject(MatSnackBar);
  private readonly api = inject(Cuotas);
  private readonly dialogos = inject(MatDialog);

  protected readonly mes = signal(mesActual());

  protected readonly datos = resource({
    params: () => ({ periodo: this.mes() }),
    loader: ({ params }) => this.api.delMes(params.periodo),
  });

  protected readonly cuotas = computed<CuotaDelMes[]>(
    () => this.datos.value()?.cuotas ?? [],
  );

  /**
   * Lo que falta entrar. Calculado y no leído del servidor porque es una resta de dos
   * números que ya viajaron: pedirlo aparte sería un tercer total que puede quedar en
   * desacuerdo con los otros dos.
   */
  protected readonly porCobrar = computed(() => {
    const mes = this.datos.value();

    return mes ? mes.totalEmitidoClp - mes.totalPagadoClp : 0;
  });

  protected readonly cobrando = signal(false);
  /** Qué acción está viajando, para que gire su botón y no todos (T154). */
  protected readonly enCurso = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly COLUMNAS = ['numero', 'socio', 'monto', 'estado', 'cobrar'];

  protected readonly pesos = enPesos;

  protected nombreMedio(medio: MedioPago): string {
    return MEDIOS[medio] ?? medio;
  }

  /**
   * Cobra y recarga el mes.
   *
   * Dos botones y no un selector con confirmación: en el mesón hay alguien esperando,
   * y el medio es lo único que hay que elegir. El aviso dice hasta cuándo quedó al día
   * porque es lo que el socio pregunta a continuación.
   */
  protected async cobrar(
    cuota: CuotaDelMes,
    medio: 'EFECTIVO' | 'TRANSFERENCIA',
  ): Promise<void> {
    await this.intentar(`cobrar-${cuota.id}-${medio}`, async () => {
      await this.api.cobrar(cuota.id, medio);
      // La incorporación no extiende la vigencia —compra la entrada, no tiempo—, así
      // que prometer que "queda al día hasta fin de mes" sería mentirle al admin justo
      // en la pantalla donde va a cobrar la mensualidad a continuación.
      this.snackBar.open(
        cuota.tipo === 'INCORPORACION'
          ? `Cobrada la incorporación de ${cuota.socio.nombre}. Ya puede reservar; su mensualidad va aparte.`
          : `Cobrada la cuota de ${cuota.socio.nombre}. Queda al día hasta fin de ${cuota.periodo}.`,
        undefined,
        LO_HECHO,
      );
    });
  }

  /**
   * Condonar: cobrar cero por una razón. **Deja al socio al día ese mes**, porque el
   * mes se lo dieron igual.
   */
  protected async condonar(cuota: CuotaDelMes): Promise<void> {
    const motivo = await pedirMotivo(this.dialogos, {
      titulo: `¿Condonar la cuota de ${cuota.socio.nombre}?`,
      detalle: 'Queda al día ese mes igual, y el motivo queda escrito en la cuota.',
      etiqueta: 'Por qué se condona',
      confirmar: 'Condonar',
    });

    if (motivo === null) return;

    await this.intentar(`condonar-${cuota.id}`, async () => {
      await this.api.ajustar(cuota.id, { condonar: true, motivo });
      this.snackBar.open(
        `Condonada la cuota de ${cuota.socio.nombre}. Queda al día ese mes igual.`,
        undefined,
        LO_HECHO,
      );
    });
  }

  /**
   * Anular: deshacer una emisión equivocada. **No deja al día a nadie**: esa cuota
   * nunca debió existir.
   */
  protected async anular(cuota: CuotaDelMes): Promise<void> {
    const motivo = await pedirMotivo(this.dialogos, {
      titulo: `¿Anular la cuota de ${cuota.socio.nombre}?`,
      detalle: 'No es lo mismo que condonarla: anular es decir que no correspondía emitirla.',
      etiqueta: 'Por qué se anula',
      confirmar: 'Anular',
      peligro: true,
    });

    if (motivo === null) return;

    await this.intentar(`anular-${cuota.id}`, async () => {
      await this.api.ajustar(cuota.id, { anular: true, motivo });
      this.snackBar.open(`Anulada la cuota de ${cuota.socio.nombre}.`, undefined, LO_HECHO);
    });
  }

  /**
   * Corre la acción, recarga el mes y muestra el mensaje del servidor si falla.
   *
   * Compartido por los cuatro botones: los avisos son distintos, pero el manejo
   * —limpiar, bloquear, recargar, desbloquear— es el mismo en los cuatro.
   */
  private async intentar(
    clave: string,
    accion: () => Promise<void>,
  ): Promise<void> {
    this.error.set(null);
    this.cobrando.set(true);
    this.enCurso.set(clave);

    try {
      await accion();
      this.datos.reload();
    } catch (falla) {
      // El del servidor: "Esa cuota ya estaba pagada" es el que importa, porque pasa
      // cuando dos personas trabajan desde dos pantallas.
      this.error.set(mensajeDelServidor(falla, 'No se pudo completar la acción.'));
    } finally {
      this.cobrando.set(false);
      this.enCurso.set(null);
    }
  }

  protected cambiarMes(evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value;

    // El `<input type="month">` vacío devuelve "": quedarse en el mes anterior es
    // mejor que pedirle al servidor un período que va a rechazar.
    if (valor) this.mes.set(valor);
  }
}
