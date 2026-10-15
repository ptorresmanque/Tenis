import { Component, computed, inject, input, linkedSignal, resource } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatTableModule } from '@angular/material/table';

import { hoyEnElClub } from '../../../catalogo-canchas/reloj-del-club';
import { Aviso } from '../../../ui/aviso';
import { proveerCampos } from '../../../ui/campos';
import { Esqueleto } from '../../../ui/esqueleto';
import { EstadoVacio } from '../../../ui/estado-vacio';
import { proveerPaginador } from '../../../ui/paginador';
import { cuotaVencida, enDiaMes, ESTADOS_SOCIO } from '../socios.service';
import { InvitacionesPendientes } from './invitaciones-pendientes';
import {
  OrdenDePersonas,
  TipoDePersona,
  UsuarioDeLaLista,
  Usuarios,
} from '../usuarios.service';

const FILTROS: { valor: TipoDePersona | 'todos'; etiqueta: string }[] = [
  { valor: 'todos', etiqueta: 'Todos' },
  { valor: 'socios', etiqueta: 'Socios' },
  { valor: 'profesores', etiqueta: 'Profesores' },
  { valor: 'gestores', etiqueta: 'Gestores' },
  { valor: 'administradores', etiqueta: 'Administradores' },
  { valor: 'sin-tipo', etiqueta: 'Sin tipo' },
];

/**
 * Personas (T296, SPEC-panel.md D2 y A4): las cuentas del club en una tabla, con chips de filtro
 * por tipo, búsqueda, orden y paginación en el servidor. Reemplaza a Socios, Usuarios y
 * Profesores, que llegan acá con su filtro. Cada nombre lleva a la ficha de la cuenta, donde se
 * le dan los tipos.
 *
 * **Lo elegido vive en la URL** (`?tipo=…&q=…&orden=…&pagina=…`), y la pantalla lo lee como
 * inputs: así un enlace se comparte, «Atrás» vuelve a la búsqueda anterior y las rutas viejas
 * redirigen con su filtro.
 *
 * **Sin FAB** (D12): nadie se crea desde acá. Socios y profesores parten de una cuenta que la
 * persona crea en el sitio.
 */
@Component({
  selector: 'app-personas',
  imports: [
    MatButton,
    MatButtonToggleModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIcon,
    MatInput,
    MatPaginator,
    MatTableModule,
    FormsModule,
    RouterLink,
    Aviso,
    Esqueleto,
    EstadoVacio,
    InvitacionesPendientes,
  ],
  providers: [proveerCampos(), proveerPaginador()],
  template: `
    <header class="cabecera-panel">
      <div>
        <h1 class="titular text-4xl">Personas</h1>
        <p class="mt-1 text-muted-foreground">
          Todas las cuentas del club. Para hacer socia o profesor a alguien, esa persona crea
          primero su cuenta en el sitio; después se marca en su ficha.
        </p>
      </div>
    </header>

    <mat-chip-listbox
      class="mt-4"
      aria-label="Filtrar por tipo"
      [value]="filtro()"
      (change)="filtrar($event.value)"
    >
      @for (opcion of FILTROS; track opcion.valor) {
        <mat-chip-option [value]="opcion.valor">{{ opcion.etiqueta }}</mat-chip-option>
      }
    </mat-chip-listbox>

    <div class="mt-3 flex flex-wrap items-end gap-3">
      <form role="search" class="flex min-w-64 flex-1 items-start gap-3" (ngSubmit)="buscar()">
        <mat-form-field class="flex-1">
          <!-- Corta, y lo que se busca en la ayuda: a 375 px la etiqueta larga se cortaba. -->
          <mat-label>Buscar</mat-label>
          <input
            matInput
            name="busqueda"
            type="search"
            [ngModel]="textoBuscado()"
            (ngModelChange)="textoBuscado.set($event)"
          />
          <mat-hint>Nombre, correo o número de socio</mat-hint>
        </mat-form-field>
        <button matButton="outlined" type="submit">Buscar</button>
      </form>

      <mat-button-toggle-group
        aria-label="Ordenar por"
        hideSingleSelectionIndicator
        [value]="ordenElegido()"
        (change)="ordenar($event.value)"
      >
        <mat-button-toggle value="nombre">Nombre</mat-button-toggle>
        <mat-button-toggle value="numero">N° de socio</mat-button-toggle>
      </mat-button-toggle-group>
    </div>

    @if (filtro() === 'profesores' && profesoresSinCuenta() > 0) {
      <!-- D14: siguen dando sus clases; cada uno se asocia desde la ficha de su cuenta cuando
           se registre. -->
      <app-aviso variante="aviso" class="mt-3 block">
        {{ profesoresSinCuenta() }}
        {{ profesoresSinCuenta() === 1 ? 'profesor sigue' : 'profesores siguen' }} sin cuenta.
        Siguen dando sus clases; cuando se registre en el sitio, asócialo desde la ficha de su
        cuenta.
      </app-aviso>
    }

    @if (filtro() === 'socios') {
      <!-- D14: las invitaciones de antes, que estaban en el padrón (T299). -->
      <app-invitaciones-pendientes class="mt-3 block" />
    }

    @if (listado.isLoading() && !listado.hasValue()) {
      <app-esqueleto class="mt-4 block" [filas]="6" etiqueta="Cargando las personas…" />
    } @else if (listado.error()) {
      <p class="mt-4 text-destructive">No se pudo cargar la lista. Reintenta en un momento.</p>
    } @else if (listado.hasValue()) {
      @if (listado.value().usuarios.length === 0) {
        <app-estado-vacio
          class="mt-4 block"
          icono="person_search"
          titulo="Nadie coincide"
          detalle="Prueba con otro texto o con otro filtro."
        />
      } @else {
        <p class="mt-4 text-sm text-muted-foreground">
          {{ listado.value().total }} {{ listado.value().total === 1 ? 'persona' : 'personas' }}
        </p>
        <div class="mt-2 overflow-x-auto rounded-xl border border-border bg-card">
          <table mat-table aria-label="Personas del club" [dataSource]="listado.value().usuarios">
            <ng-container matColumnDef="nombre">
              <th mat-header-cell *matHeaderCellDef scope="col">Nombre</th>
              <td mat-cell *matCellDef="let persona">
                <a
                  class="font-medium text-primary"
                  [routerLink]="['/administracion/personas', persona.id]"
                >
                  {{ persona.nombre }} {{ persona.apellido }}
                </a>
              </td>
            </ng-container>
            <ng-container matColumnDef="correo">
              <th mat-header-cell *matHeaderCellDef scope="col">Correo</th>
              <!-- En una línea: en el teléfono la tabla se desplaza de lado, como el padrón, y
                   partido letra por letra el correo estiraba cada fila. -->
              <td mat-cell *matCellDef="let persona" class="text-sm whitespace-nowrap text-muted-foreground">
                {{ persona.email }}
              </td>
            </ng-container>
            <ng-container matColumnDef="tipos">
              <th mat-header-cell *matHeaderCellDef scope="col">Tipos</th>
              <td mat-cell *matCellDef="let persona">
                <mat-chip-set class="insignias" aria-label="Tipos de la cuenta">
                  @for (tipo of tiposDe(persona); track tipo.etiqueta) {
                    <mat-chip class="insignia neutro">
                      <mat-icon matChipAvatar aria-hidden="true">{{ tipo.icono }}</mat-icon>
                      {{ tipo.etiqueta }}
                    </mat-chip>
                  }
                </mat-chip-set>
              </td>
            </ng-container>
            <ng-container matColumnDef="cuota">
              <th mat-header-cell *matHeaderCellDef scope="col">Cuota</th>
              <td mat-cell *matCellDef="let persona" class="text-sm whitespace-nowrap">
                @if (persona.socio; as socio) {
                  {{ cuotaDe(socio) }}
                } @else {
                  <span aria-hidden="true">—</span><span class="sr-only">No es socio</span>
                }
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="COLUMNAS; sticky: true"></tr>
            <tr mat-row *matRowDef="let persona; columns: COLUMNAS"></tr>
          </table>
        </div>

        @if (listado.value().total > listado.value().porPagina) {
          <mat-paginator
            class="mt-4"
            aria-label="Páginas de personas"
            hidePageSize
            [length]="listado.value().total"
            [pageSize]="listado.value().porPagina"
            [pageIndex]="paginaElegida() - 1"
            (page)="irALaPagina($event)"
          />
        }
      }
    }
  `,
})
export class PersonasPanel {
  private readonly api = inject(Usuarios);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  // Lo que trae la URL, como texto: se valida antes de usarlo.
  readonly tipo = input<string>();
  readonly q = input<string>();
  readonly orden = input<string>();
  readonly pagina = input<string>();

  protected readonly FILTROS = FILTROS;
  protected readonly COLUMNAS = ['nombre', 'correo', 'tipos', 'cuota'];

  /** El tipo de la URL si es uno de los filtros; si no, todos. */
  protected readonly tipoElegido = computed(() =>
    FILTROS.some((opcion) => opcion.valor === this.tipo() && opcion.valor !== 'todos')
      ? (this.tipo() as TipoDePersona)
      : undefined,
  );
  protected readonly filtro = computed(() => this.tipoElegido() ?? 'todos');
  protected readonly ordenElegido = computed<OrdenDePersonas>(() =>
    this.orden() === 'numero' ? 'numero' : 'nombre',
  );
  protected readonly paginaElegida = computed(() => {
    const numero = Number(this.pagina());
    return Number.isInteger(numero) && numero >= 1 ? numero : 1;
  });

  /** Lo escrito en el buscador; vuelve a lo de la URL si la URL cambia. */
  protected readonly textoBuscado = linkedSignal(() => this.q() ?? '');

  protected readonly listado = resource({
    params: () => ({
      q: this.q() ?? '',
      pagina: this.paginaElegida(),
      tipo: this.tipoElegido(),
      orden: this.ordenElegido(),
    }),
    loader: ({ params }) => this.api.listar(params.q, params.pagina, params.tipo, params.orden),
  });

  protected readonly profesoresSinCuenta = computed(() =>
    this.listado.hasValue() ? this.listado.value().profesoresSinCuenta : 0,
  );

  private readonly hoy = hoyEnElClub();

  /** Elegir de nuevo el chip elegido lo apaga: entonces son todos. */
  protected filtrar(valor: TipoDePersona | 'todos' | undefined): void {
    this.ir({ tipo: valor && valor !== 'todos' ? valor : null, pagina: null });
  }

  protected buscar(): void {
    this.ir({ q: this.textoBuscado().trim() || null, pagina: null });
  }

  protected ordenar(orden: OrdenDePersonas): void {
    this.ir({ orden: orden === 'nombre' ? null : orden, pagina: null });
  }

  protected irALaPagina(evento: PageEvent): void {
    this.ir({ pagina: evento.pageIndex + 1 });
  }

  /** Cambia lo elegido en la URL; el resto de lo que dice se queda. */
  private ir(cambios: Params): void {
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: cambios,
      queryParamsHandling: 'merge',
    });
  }

  /** Los tipos de una cuenta, como chips: el número de socio, profesor, gestor y admin. */
  protected tiposDe(persona: UsuarioDeLaLista): { etiqueta: string; icono: string }[] {
    return [
      ...(persona.socio
        ? [{ etiqueta: `Socio N° ${persona.socio.numeroSocio}`, icono: 'badge' }]
        : []),
      ...(persona.profesor?.activo ? [{ etiqueta: 'Profesor', icono: 'school' }] : []),
      ...(persona.esGestor ? [{ etiqueta: 'Gestor', icono: 'support_agent' }] : []),
      ...(persona.esAdmin ? [{ etiqueta: 'Administrador', icono: 'shield_person' }] : []),
    ];
  }

  /** «Al día hasta 31-12-2026», «Cuota vencida» o el estado, como en el padrón. */
  protected cuotaDe(socio: NonNullable<UsuarioDeLaLista['socio']>): string {
    if (socio.estado !== 'ACTIVO') return ESTADOS_SOCIO[socio.estado];
    if (!socio.alDiaHasta) return 'Sin cuotas pagadas';
    return cuotaVencida(socio.alDiaHasta, this.hoy)
      ? `Cuota vencida (${enDiaMes(socio.alDiaHasta)})`
      : `Al día hasta ${enDiaMes(socio.alDiaHasta)}`;
  }
}
