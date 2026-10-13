import { Component, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { enPesos } from '../catalogo-canchas/reloj-del-club';
import { Auth } from '../core/auth/auth';
import { mensajeDelServidor } from '../core/errores';
import { irAPagar } from '../core/pagos/ir-a-pagar';
import { Aviso } from '../ui/aviso';
import { Campo, CampoControl } from '../ui/campo';
import { Esqueleto } from '../ui/esqueleto';
import { EstadoVacio } from '../ui/estado-vacio';
import { TelefonoDirective } from '../ui/telefono';
import { Carrito } from './carrito';
import { Tienda } from './tienda.service';

/**
 * Pagar, `/tienda/pagar` (T166): quién compra, cómo lo recibe y qué documento quiere, y el
 * resumen con el total. **El retracto y la garantía van sobre el botón, a la vista**: la
 * ley pide informarlos de forma destacada antes del pago, no en letra chica
 * (`SPEC-tienda.md` § Legal).
 *
 * El total sale de cotizar y el pedido lo vuelve a calcular la API: el navegador manda
 * solo qué y cuánto. Pagar es dos pasos —crear el pedido y empezar el cobro— en un clic.
 */
@Component({
  selector: 'app-pagina-de-pago',
  imports: [
    FormsModule,
    RouterLink,
    Aviso,
    Campo,
    CampoControl,
    Esqueleto,
    EstadoVacio,
    TelefonoDirective,
  ],
  template: `
    <p>
      <a
        routerLink="/tienda/carrito"
        class="inline-flex items-center gap-1 font-semibold text-primary underline-offset-4
               hover:underline"
      >
        <span class="icono text-lg" aria-hidden="true">arrow_back</span>
        Volver al carrito
      </a>
    </p>
    <h1 class="mt-4 titular text-5xl sm:text-6xl">Pagar</h1>

    @if (carrito.lineas().length === 0) {
      <app-estado-vacio
        class="mt-6 block"
        icono="shopping_cart"
        titulo="Tu carrito está vacío"
        detalle="Elige algo en la tienda para pagarlo aquí."
      />
      <p class="mt-4 text-center">
        <a routerLink="/tienda" class="boton boton-primario">Ver la tienda</a>
      </p>
    } @else if (cotizacion.error()) {
      <p class="mt-6 text-destructive">No se pudo cargar el carrito. Reintenta en un momento.</p>
    } @else if (cotizacion.value(); as cotizada) {
      @if (!cotizada.sePuedePagar) {
        <app-aviso class="mt-6 block" variante="error">
          Algo de tu carrito cambió y ya no se puede comprar como está.
          <a routerLink="/tienda/carrito" class="font-semibold underline">Revisa el carrito</a>.
        </app-aviso>
      } @else {
        <div class="mt-6 grid gap-8 lg:grid-cols-3">
          <form id="formulario-pago" class="grid gap-6 lg:col-span-2" (ngSubmit)="pagar()">
            <fieldset class="grid gap-4">
              <legend class="font-display text-lg font-bold tracking-wider uppercase">
                Tus datos
              </legend>
              <app-campo etiqueta="Nombre y apellido">
                <input
                  appCampoControl
                  name="nombre"
                  class="campo"
                  autocomplete="name"
                  required
                  [(ngModel)]="datos.nombre"
                />
              </app-campo>
              <div class="grid gap-4 sm:grid-cols-2">
                <app-campo etiqueta="Correo" ayuda="Te llega ahí la confirmación.">
                  <input
                    appCampoControl
                    name="email"
                    type="email"
                    class="campo"
                    autocomplete="email"
                    required
                    [(ngModel)]="datos.email"
                  />
                </app-campo>
                <app-campo etiqueta="Teléfono">
                  <span class="campo-con-prefijo">
                    <span class="prefijo">+56</span>
                    <input
                      appTelefono
                      appCampoControl
                      name="telefono"
                      class="campo"
                      required
                      [(ngModel)]="datos.telefono"
                    />
                  </span>
                </app-campo>
              </div>
            </fieldset>

            <fieldset class="grid gap-3">
              <legend class="font-display text-lg font-bold tracking-wider uppercase">
                Entrega
              </legend>
              <!-- Las dos opciones escritas y no en un @for: con value estático, el valor
                   llega al radio y a ngModel; enlazado con [value], solo a ngModel. -->
              <label [class]="OPCION">
                <input
                  type="radio"
                  name="entrega"
                  value="RETIRO"
                  class="mt-1 size-4 accent-primary"
                  [(ngModel)]="datos.entrega"
                />
                <span>
                  <span class="block font-semibold">Retiro en el club</span>
                  <span class="block text-sm text-muted-foreground">
                    Sin costo. Te avisamos por correo cuando esté listo.
                  </span>
                </span>
              </label>
              @if (cotizada.sePuedeDespachar) {
                <label [class]="OPCION">
                  <input
                    type="radio"
                    name="entrega"
                    value="DESPACHO"
                    class="mt-1 size-4 accent-primary"
                    [(ngModel)]="datos.entrega"
                  />
                  <span>
                    <span class="block font-semibold">Despacho a domicilio</span>
                    <span class="block text-sm text-muted-foreground">
                      Lo pagas a Starken al recibirlo: no está en el total.
                    </span>
                  </span>
                </label>
              } @else {
                <p class="text-sm text-muted-foreground">
                  Lo que va por encargo se retira en el club, así que este pedido es con retiro.
                </p>
              }
              @if (datos.entrega === 'DESPACHO') {
                <p class="text-sm text-muted-foreground">
                  El despacho es por pagar a Starken: llega a la dirección que escribas y lo pagas
                  al recibirlo.
                </p>
                <div class="grid gap-4 sm:grid-cols-2">
                  <app-campo etiqueta="Región">
                    <select
                      appCampoControl
                      name="region"
                      class="campo"
                      required
                      [(ngModel)]="datos.region"
                    >
                      <option value="">Elige la región</option>
                      @for (region of regiones.value() ?? []; track region) {
                        <option [value]="region">{{ region }}</option>
                      }
                    </select>
                  </app-campo>
                  <app-campo etiqueta="Comuna">
                    <input
                      appCampoControl
                      name="comuna"
                      class="campo"
                      required
                      [(ngModel)]="datos.comuna"
                    />
                  </app-campo>
                  <app-campo etiqueta="Dirección" class="sm:col-span-2">
                    <input
                      appCampoControl
                      name="direccion"
                      class="campo"
                      autocomplete="street-address"
                      required
                      [(ngModel)]="datos.direccion"
                    />
                  </app-campo>
                  <app-campo
                    etiqueta="Referencia"
                    ayuda="Opcional: depto., timbre, a quién preguntar."
                    class="sm:col-span-2"
                  >
                    <input
                      appCampoControl
                      name="referencia"
                      class="campo"
                      [(ngModel)]="datos.referencia"
                    />
                  </app-campo>
                </div>
              }
            </fieldset>

            <fieldset class="grid gap-3">
              <legend class="font-display text-lg font-bold tracking-wider uppercase">
                Documento
              </legend>
              <label class="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  name="factura"
                  class="size-4 accent-primary"
                  [(ngModel)]="datos.factura"
                />
                Necesito factura
              </label>
              @if (datos.factura) {
                <div class="grid gap-4 sm:grid-cols-2">
                  <app-campo etiqueta="RUT de la empresa">
                    <input
                      appCampoControl
                      name="rut"
                      class="campo"
                      placeholder="76.123.456-0"
                      required
                      [(ngModel)]="datos.rut"
                    />
                  </app-campo>
                  <app-campo etiqueta="Razón social">
                    <input
                      appCampoControl
                      name="razonSocial"
                      class="campo"
                      required
                      [(ngModel)]="datos.razonSocial"
                    />
                  </app-campo>
                  <app-campo etiqueta="Giro">
                    <input
                      appCampoControl
                      name="giro"
                      class="campo"
                      required
                      [(ngModel)]="datos.giro"
                    />
                  </app-campo>
                  <app-campo etiqueta="Dirección de la empresa">
                    <input
                      appCampoControl
                      name="direccionFactura"
                      class="campo"
                      required
                      [(ngModel)]="datos.direccionFactura"
                    />
                  </app-campo>
                </div>
              } @else {
                <p class="text-sm text-muted-foreground">
                  El comprobante de Webpay vale como boleta.
                </p>
              }
            </fieldset>
          </form>

          <aside
            data-resumen
            class="h-fit rounded-xl border border-border bg-card p-5"
            aria-labelledby="titulo-resumen-pago"
          >
            <h2
              id="titulo-resumen-pago"
              class="font-display text-lg font-bold tracking-wider uppercase"
            >
              Resumen
            </h2>
            <ul class="mt-3 grid gap-1 text-sm">
              @for (linea of cotizada.lineas; track linea.varianteId) {
                <li class="flex justify-between gap-3">
                  <span class="min-w-0">
                    {{ linea.cantidad }} × {{ linea.producto?.nombre }}
                    <span class="text-muted-foreground">· {{ linea.talla }}</span>
                  </span>
                  <span class="whitespace-nowrap">{{ pesos(linea.subtotalClp) }}</span>
                </li>
              }
            </ul>
            <dl class="mt-3 grid grid-cols-2 gap-y-1 border-t border-border pt-3 text-sm">
              @if (cotizada.descuentoClp > 0) {
                <dt class="text-primary">Descuento de socio</dt>
                <dd class="text-right text-primary">−{{ pesos(cotizada.descuentoClp) }}</dd>
              }
              <dt class="text-base font-bold">Total</dt>
              <dd class="text-right font-display text-2xl font-bold">
                {{ pesos(cotizada.totalClp) }}
              </dd>
            </dl>
            <p class="mt-1 text-xs text-muted-foreground">No incluye el despacho.</p>

            <!-- Lo legal, justo encima del botón: quien llega a pagar lo tiene delante
                 (Ley N.º 19.496, modificada por la Ley N.º 21.398). -->
            <div data-legal class="mt-4 rounded-lg bg-muted p-3 text-sm">
              <p>
                <strong>Derecho a retracto:</strong> tienes 10 días desde que recibes tu compra para
                devolverla, sin dar motivo.
              </p>
              <p class="mt-1"><strong>Garantía legal:</strong> seis meses desde que la recibes.</p>
              <p class="mt-1">
                <a routerLink="/tienda/terminos" class="font-semibold text-primary underline"
                  >Términos de venta</a
                >
              </p>
            </div>

            @if (error(); as falla) {
              <app-aviso class="mt-4 block" variante="error">
                {{ falla }}
                <a routerLink="/tienda/carrito" class="font-semibold underline"
                  >Volver al carrito</a
                >
              </app-aviso>
            }

            <button
              type="submit"
              form="formulario-pago"
              class="mt-4 boton boton-primario w-full"
              [disabled]="pagando()"
              [attr.aria-busy]="pagando()"
            >
              Pagar {{ pesos(cotizada.totalClp) }} con Webpay
            </button>
          </aside>
        </div>
      }
    } @else {
      <app-esqueleto class="mt-6 block" [filas]="5" etiqueta="Cargando el carrito…" />
    }
  `,
})
export class PaginaDePago {
  private readonly tienda = inject(Tienda);
  protected readonly carrito = inject(Carrito);
  protected readonly pesos = enPesos;

  protected readonly OPCION =
    'flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-4 ' +
    'has-[:checked]:border-primary';

  /** Con sesión, precargado con la cuenta: quien compra no tiene por qué escribirlo. */
  protected readonly datos = datosIniciales(inject(Auth).usuario());

  protected readonly cotizacion = resource({
    params: () => {
      const lineas = this.carrito.lineas();

      return lineas.length > 0 ? lineas : undefined;
    },
    loader: ({ params }) => this.carrito.cotizar(params),
  });

  protected readonly regiones = resource({ loader: () => this.tienda.regiones() });

  protected readonly pagando = signal(false);
  protected readonly error = signal<string | null>(null);

  /**
   * Crea el pedido y sale a Webpay. Si se agotó algo mientras tanto, la API lo dice antes
   * de cobrar, y el mensaje lleva de vuelta al carrito.
   */
  protected async pagar(): Promise<void> {
    this.pagando.set(true);
    this.error.set(null);
    const d = this.datos;

    try {
      const { token } = await this.tienda.crearPedido({
        lineas: this.carrito.lineas(),
        nombre: d.nombre,
        email: d.email,
        telefono: d.telefono,
        entrega: d.entrega,
        despacho:
          d.entrega === 'DESPACHO'
            ? {
                region: d.region,
                comuna: d.comuna,
                direccion: d.direccion,
                referencia: d.referencia,
              }
            : null,
        factura: d.factura
          ? { rut: d.rut, razonSocial: d.razonSocial, giro: d.giro, direccion: d.direccionFactura }
          : null,
      });

      const pago = await this.tienda.pagarPedido(token);
      this.carrito.recordarPago(token);
      irAPagar(pago);
    } catch (falla) {
      this.error.set(
        mensajeDelServidor(
          falla,
          'No se pudo empezar el pago. Reintenta en un momento.',
          [400, 409],
        ),
      );
      this.pagando.set(false);
    }
  }
}

function datosIniciales(usuario: ReturnType<Auth['usuario']>) {
  return {
    nombre: usuario ? `${usuario.nombre} ${usuario.apellido}`.trim() : '',
    email: usuario?.email ?? '',
    telefono: usuario?.telefono ?? '',
    entrega: 'RETIRO' as 'RETIRO' | 'DESPACHO',
    region: '',
    comuna: '',
    direccion: '',
    referencia: '',
    factura: false,
    rut: '',
    razonSocial: '',
    giro: '',
    direccionFactura: '',
  };
}
