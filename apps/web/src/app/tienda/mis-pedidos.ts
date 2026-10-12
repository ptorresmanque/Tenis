import { Component, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';

import { enPesos } from '../catalogo-canchas/reloj-del-club';
import { Auth } from '../core/auth/auth';
import { Esqueleto } from '../ui/esqueleto';
import { EstadoVacio } from '../ui/estado-vacio';
import { Insignia } from '../ui/insignia';
import { ESTADOS, FECHA } from './estados-del-pedido';
import { Tienda } from './tienda.service';

/**
 * "Mis pedidos", `/tienda/mis-pedidos` (T166): las compras de quien tiene cuenta, de la
 * más nueva a la más vieja, cada una con su enlace al seguimiento. Para cualquiera con
 * cuenta y no solo para socios: en la tienda compra cualquiera.
 */
@Component({
  selector: 'app-mis-pedidos',
  imports: [RouterLink, Esqueleto, EstadoVacio, Insignia],
  template: `
    <h1 class="titular text-5xl sm:text-6xl">Mis pedidos</h1>

    @if (!usuario()) {
      <p class="mt-4 text-muted-foreground">
        <a routerLink="/entrar" class="font-semibold text-primary underline">Entra</a> para ver tus
        compras. Si compraste sin cuenta, el enlace de cada pedido está en el correo de la compra.
      </p>
    } @else if (pedidos.isLoading()) {
      <app-esqueleto class="mt-6 block" [filas]="3" etiqueta="Cargando tus pedidos…" />
    } @else if (pedidos.error()) {
      <p class="mt-6 text-destructive">
        No se pudieron cargar tus pedidos. Reintenta en un momento.
      </p>
    } @else if ((pedidos.value() ?? []).length === 0) {
      <app-estado-vacio
        class="mt-6 block"
        icono="receipt_long"
        titulo="Todavía no tienes compras"
        detalle="Lo que compres en la tienda aparece aquí, con su seguimiento."
      />
      <p class="mt-4 text-center">
        <a routerLink="/tienda" class="boton boton-primario">Ver la tienda</a>
      </p>
    } @else {
      <ul class="mt-6 divide-y divide-border rounded-xl border border-border bg-card">
        @for (pedido of pedidos.value(); track pedido.id) {
          <li>
            <a
              [routerLink]="['/tienda/pedido', pedido.token]"
              class="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-muted"
            >
              <span>
                <span class="font-semibold">Pedido N.º {{ pedido.id }}</span>
                <span class="block text-sm text-muted-foreground">
                  {{ fecha(pedido.creadoEn) }} ·
                  {{
                    pedido._count.lineas === 1 ? '1 producto' : pedido._count.lineas + ' productos'
                  }}
                </span>
              </span>
              <span class="flex items-center gap-3">
                <app-insignia [variante]="ESTADOS[pedido.estado].variante">{{
                  ESTADOS[pedido.estado].texto
                }}</app-insignia>
                <span class="font-semibold whitespace-nowrap">{{ pesos(pedido.totalClp) }}</span>
              </span>
            </a>
          </li>
        }
      </ul>
    }
  `,
})
export class MisPedidos {
  private readonly tienda = inject(Tienda);

  protected readonly usuario = inject(Auth).usuario;
  protected readonly ESTADOS = ESTADOS;
  protected readonly pesos = enPesos;

  /** Sin sesión no se pregunta: la respuesta sería un 401. */
  protected readonly pedidos = resource({
    params: () => this.usuario()?.id,
    loader: () => this.tienda.misPedidos(),
  });

  protected fecha(iso: string): string {
    return FECHA.format(new Date(iso));
  }
}
