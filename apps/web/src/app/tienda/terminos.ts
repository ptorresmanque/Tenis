import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Los términos de venta de la tienda en línea, `/tienda/terminos` (T167), con lo que exige
 * la Ley N.º 19.496, modificada por la Ley N.º 21.398 (`SPEC-tienda.md` § Legal).
 *
 * **El texto es fijo, con versión y fecha**, como la política de privacidad: lo que la
 * persona aceptó al comprar no puede cambiar por un ajuste en el panel. Describe lo que la
 * tienda hace de verdad: si cambia el retiro, el despacho o las devoluciones, cambia esta
 * página y su versión.
 *
 * Es un borrador que el equipo escribió a partir del spec y del código; el club lo revisa
 * con su asesor antes de abrir la tienda (`tasks/plan-tienda.md` § Pasos manuales).
 */
@Component({
  selector: 'app-terminos-de-venta',
  imports: [RouterLink],
  template: `
    <article class="max-w-prose">
      <h1 class="titular text-5xl sm:text-6xl">Términos de venta</h1>
      <p class="mt-2 text-sm text-muted-foreground">
        Versión {{ version }} · vigente desde el {{ vigenteDesde }}
      </p>

      <p class="mt-6">
        Estas son las condiciones de las compras en la tienda en línea de FEDAL Tennis Center. Te
        las mostramos antes de pagar y te las mandamos con la confirmación de tu compra. Se aplican
        las normas de la Ley N.º 19.496 sobre Protección de los Derechos de los Consumidores.
      </p>

      <h2 class="titular mt-10 text-3xl sm:text-4xl">1. Quién vende</h2>
      <ul class="mt-3 grid list-disc gap-1 ps-5">
        <li>Fedal SpA, RUT 77.950.109-4, con domicilio en Lircay lt 42, Temuco.</li>
        <li>
          Para cualquier consulta, reclamo, retracto o devolución:
          <a [href]="'mailto:' + correo" class="underline">{{ correo }}</a
          >.
        </li>
      </ul>

      <h2 class="titular mt-10 text-3xl sm:text-4xl">2. Precios y pago</h2>
      <ul class="mt-3 grid list-disc gap-1 ps-5">
        <li>Los precios están en pesos chilenos e incluyen IVA.</li>
        <li>
          El precio de socio lo ve y lo paga el socio activo y al día con su cuota, con su sesión
          iniciada. Se calcula al pagar.
        </li>
        <li>El total no incluye el despacho, que se paga aparte (sección 4).</li>
        <li>
          Se paga con Webpay, con tarjeta de crédito, débito o prepago. El número de tu tarjeta lo
          procesa Transbank y nunca pasa por el club.
        </li>
        <li>
          El comprobante de Webpay vale como boleta. Si necesitas factura, la pides al pagar con los
          datos de tu empresa, y te la mandamos por correo.
        </li>
        <li>
          Mientras pagas, apartamos lo que compras durante 15 minutos. Si algo se agota antes de que
          pagues, te avisamos antes de cobrar.
        </li>
      </ul>

      <h2 class="titular mt-10 text-3xl sm:text-4xl">3. Retiro en el club</h2>
      <p class="mt-3">
        El retiro en el club no tiene costo. Te avisamos por correo cuando tu pedido esté listo, y
        lo retiras en el horario de atención de la tienda, que está en
        <a routerLink="/el-club" fragment="tienda-y-cafeteria" class="underline">El club</a>. El
        pedido no se cancela si tardas en retirarlo: a los 7 días te mandamos un recordatorio.
      </p>

      <h2 class="titular mt-10 text-3xl sm:text-4xl">4. Despacho</h2>
      <p class="mt-3">
        Despachamos con Starken a la dirección que nos indiques. El despacho es
        <strong>por pagar</strong>: lo pagas a Starken al recibir el paquete, según su tarifa, y no
        está incluido en el total de tu compra. Cuando lo despachemos, te mandamos por correo el
        número de seguimiento. Los productos por encargo no se despachan: se retiran en el club.
      </p>

      <h2 class="titular mt-10 text-3xl sm:text-4xl">5. Por encargo</h2>
      <p class="mt-3">
        Algunos productos se venden por encargo: los pagas al comprar y llegan en los días que
        indica su ficha. Ese plazo es una estimación del proveedor; si se atrasa, te avisamos, y si
        no llega puedes pedir la devolución de lo que pagaste.
      </p>

      <h2 class="titular mt-10 text-3xl sm:text-4xl">6. Garantía legal</h2>
      <p class="mt-3">
        Tienes <strong>seis meses</strong> de garantía legal desde que recibes el producto. Si falla
        o no corresponde a lo que compraste, puedes pedir, a tu elección, el cambio, la reparación o
        la devolución de lo que pagaste. Escríbenos a
        <a [href]="'mailto:' + correo" class="underline">{{ correo }}</a> con tu número de pedido.
      </p>

      <h2 class="titular mt-10 text-3xl sm:text-4xl">7. Derecho a retracto</h2>
      <p class="mt-3">
        Como es una compra a distancia, tienes <strong>10 días</strong> desde que recibes el
        producto para retractarte, sin expresar causa. El producto se devuelve en buen estado, con
        su empaque y sus accesorios, y te devolvemos lo que pagaste a más tardar dentro de 45 días
        desde que nos avisas.
      </p>
      <p class="mt-3">
        No hay retracto en los productos que por su naturaleza no pueden devolverse, que se
        deterioran o caducan con rapidez, que se hicieron según tus especificaciones o que son de
        uso personal.
      </p>

      <h2 class="titular mt-10 text-3xl sm:text-4xl">8. Devoluciones y cancelaciones</h2>
      <ul class="mt-3 grid list-disc gap-1 ps-5">
        <li>
          Si devolvemos dinero —por garantía, retracto o un pedido que cancelamos—, lo hacemos por
          el mismo medio con que pagaste o, si no se puede, por transferencia a la cuenta que nos
          indiques.
        </li>
        <li>
          Si un pago llega cuando lo que compraste ya no queda, te contactamos para ofrecerte otra
          talla, esperar a que llegue o devolverte lo pagado.
        </li>
        <li>Si el producto te llegó por despacho, coordinamos contigo cómo devolverlo.</li>
      </ul>

      <p class="mt-10 text-sm text-muted-foreground">
        Tus datos se tratan según la
        <a routerLink="/privacidad" class="underline">política de privacidad</a>.
      </p>
    </article>
  `,
})
export class TerminosDeVenta {
  /** Cambiar el texto es subir la versión y la fecha. */
  protected readonly version = '1.0';
  protected readonly vigenteDesde = '12 de octubre de 2026';
  protected readonly correo = 'contacto@fedal.cl';
}
