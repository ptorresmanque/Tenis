import { Component, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { enPesos } from '../../catalogo-canchas/reloj-del-club';
import { Esqueleto } from '../../ui/esqueleto';
import { EstadoVacio } from '../../ui/estado-vacio';
import { Insignia } from '../../ui/insignia';
import { ESTADOS, FECHA } from '../estados-del-pedido';
import type { EstadoPedido } from '../tienda.service';
import { CanalPedido, PedidosDeLaTiendaAdmin } from './pedidos.service';

const FILTROS_DE_ESTADO: { valor: '' | EstadoPedido; etiqueta: string }[] = [
  { valor: '', etiqueta: 'Por atender' },
  { valor: 'PAGADO', etiqueta: 'Pagados' },
  { valor: 'LISTO_PARA_RETIRO', etiqueta: 'Listos para retirar' },
  { valor: 'DESPACHADO', etiqueta: 'Despachados' },
  { valor: 'ENTREGADO', etiqueta: 'Entregados' },
  { valor: 'CANCELADO', etiqueta: 'Cancelados' },
  { valor: 'EXPIRADO', etiqueta: 'Sin pagar' },
];

const ENTREGAS = { RETIRO: 'Retiro', DESPACHO: 'Despacho', EN_MESON: 'En el mesón' };

/**
 * Los pedidos en el panel (T169). **Por omisión, lo que hay que atender**: pagado y
 * todavía sin entregar. Las marcas —requiere revisión, 30 días sin retirar— las calcula la
 * API al listar, y van en la fila para verlas sin abrir el pedido.
 */
@Component({
  selector: 'app-pedidos-de-la-tienda',
  imports: [RouterLink, Esqueleto, EstadoVacio, Insignia],
  template: `
    <section aria-labelledby="titulo-pedidos">
      <h2 id="titulo-pedidos" class="rotulo-seccion">Pedidos</h2>
      <p class="mt-2 max-w-prose text-sm text-muted-foreground">
        Lo pagado en línea y en el mesón. Un pedido sin pagar en 15 minutos pasa solo a "sin pagar".
      </p>

      <div class="mt-4 flex flex-wrap items-end gap-4">
        <div class="grid gap-1 text-sm">
          <label for="filtro-estado" class="font-medium">Estado</label>
          <select id="filtro-estado" class="campo" (change)="estado.set(valorDe($event))">
            @for (opcion of FILTROS_DE_ESTADO; track opcion.valor) {
              <option [value]="opcion.valor" [selected]="opcion.valor === estado()">
                {{ opcion.etiqueta }}
              </option>
            }
          </select>
        </div>
        <div class="grid gap-1 text-sm">
          <label for="filtro-canal" class="font-medium">Canal</label>
          <select id="filtro-canal" class="campo" (change)="canal.set(valorDe($event))">
            <option value="">Todos</option>
            <option value="EN_LINEA">En línea</option>
            <option value="MESON">Mesón</option>
          </select>
        </div>
      </div>

      @if (pedidos.isLoading() && !pedidos.hasValue()) {
        <app-esqueleto class="mt-4 block" [filas]="5" etiqueta="Cargando los pedidos…" />
      } @else if (pedidos.error()) {
        <p class="mt-4 text-destructive">
          No se pudieron cargar los pedidos. Reintenta en un momento.
        </p>
      } @else if ((pedidos.value() ?? []).length === 0) {
        <app-estado-vacio
          class="mt-4 block"
          icono="receipt_long"
          titulo="No hay pedidos"
          detalle="Cuando alguien compre, su pedido aparece aquí."
        />
      } @else {
        <div class="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
          <table class="tabla">
            <caption class="sr-only">
              Pedidos de la tienda
            </caption>
            <thead>
              <tr>
                <th scope="col">Pedido</th>
                <th scope="col">Cliente</th>
                <th scope="col">Entrega</th>
                <th scope="col" class="numero">Total</th>
                <th scope="col">Estado</th>
                <th scope="col"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              @for (pedido of pedidos.value(); track pedido.id) {
                <tr>
                  <th scope="row">
                    <span class="font-semibold">N.º {{ pedido.id }}</span>
                    <span class="block text-sm text-muted-foreground">
                      {{ fecha(pedido.creadoEn) }}{{ pedido.canal === 'MESON' ? ' · Mesón' : '' }}
                    </span>
                  </th>
                  <td>
                    {{ pedido.nombre || 'Sin nombre' }}
                    <span class="block text-sm text-muted-foreground">
                      {{ pedido.lineas === 1 ? '1 producto' : pedido.lineas + ' productos' }}
                    </span>
                  </td>
                  <td>{{ ENTREGAS[pedido.entrega] }}</td>
                  <td class="numero whitespace-nowrap">{{ pesos(pedido.totalClp) }}</td>
                  <td>
                    <div class="flex flex-wrap gap-1">
                      <app-insignia [variante]="ESTADOS[pedido.estado].variante">{{
                        ESTADOS[pedido.estado].texto
                      }}</app-insignia>
                      @if (pedido.requiereRevision) {
                        <app-insignia variante="error" icono="report"
                          >Requiere revisión</app-insignia
                        >
                      }
                      @if (pedido.sinRetirar) {
                        <app-insignia variante="aviso" icono="hourglass_bottom"
                          >30 días sin retirar</app-insignia
                        >
                      }
                    </div>
                  </td>
                  <td>
                    <a
                      class="boton boton-secundario boton-chico whitespace-nowrap"
                      [routerLink]="['/administracion/tienda/pedidos', pedido.id]"
                    >
                      Ver <span class="sr-only">el pedido N.º {{ pedido.id }}</span>
                    </a>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
})
export class PedidosPanel {
  private readonly api = inject(PedidosDeLaTiendaAdmin);

  protected readonly FILTROS_DE_ESTADO = FILTROS_DE_ESTADO;
  protected readonly ESTADOS = ESTADOS;
  protected readonly ENTREGAS = ENTREGAS;
  protected readonly pesos = enPesos;

  protected readonly estado = signal<'' | EstadoPedido>('');
  protected readonly canal = signal<'' | CanalPedido>('');

  protected readonly pedidos = resource({
    params: () => ({ estado: this.estado() || null, canal: this.canal() || null }),
    loader: ({ params }) => this.api.listar(params),
  });

  protected valorDe<T extends string>(evento: Event): T {
    return (evento.target as HTMLSelectElement).value as T;
  }

  protected fecha(iso: string): string {
    return FECHA.format(new Date(iso));
  }
}
