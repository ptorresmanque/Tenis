import { Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Disponibilidad } from '../catalogo-canchas/disponibilidad';
import { Marcador } from '../catalogo-canchas/marcador';
import {
  diaEnPalabras,
  enPesos,
  horaEnElClub,
  hoyEnElClub,
} from '../catalogo-canchas/reloj-del-club';
import { Auth } from '../core/auth/auth';
import { Torneos } from '../torneos/torneos.service';
import { Cinta } from '../ui/cinta';
import { Esqueleto } from '../ui/esqueleto';
import { Foto } from '../ui/foto';
import { Insignia } from '../ui/insignia';

/**
 * La portada.
 *
 * **Es el marcador de un partido en curso, no el folleto de un club.** Esa es la
 * decisión que ordena todo lo demás y está escrita en el contrato de dirección
 * de esta superficie. En la práctica significa tres cosas: el azul ocupa
 * regiones enteras en vez de aparecer como acento, las secciones son bandas
 * horizontales de altura desigual en vez de tarjetas iguales en una retícula, y
 * **cada banda reserva el blanco puro para un solo dato**, que es el que hay que
 * leer desde lejos.
 *
 * Lo que reemplaza: seis secciones con la misma forma —caja blanca, borde gris,
 * sombra chica— repetida veinte veces. La auditoría del 2026-09-08 midió que esa
 * era la única familia de composición del sitio entero.
 *
 * **Muestra horas de verdad, no un folleto.** Las que se ofrecen salen de la
 * misma consulta que la grilla, así que el precio y la disponibilidad son los del
 * momento: una portada con horarios inventados envejece el mismo día.
 *
 * **Los dos caminos pesan igual.** El club quiere las dos cosas —que alguien
 * arriende una hora y que alguien se asocie— y lo dijo así el 2026-09-08. No hay
 * botón primario y secundario: hay dos entradas, cada una con su bloque.
 */
@Component({
  selector: 'app-inicio',
  imports: [RouterLink, Cinta, Esqueleto, Foto, Insignia, Marcador],
  template: `
    <!--
      BANDA 1 — La foto y la promesa.

      Cuatro elementos de texto y ni uno más: el titular, la bajada, y los dos
      caminos. Las horas libres, que son el dato por el que alguien entra, van en
      la banda siguiente y no acá: meterlas dentro convertiría el primer momento
      en una lista de cosas.
    -->
    <section
      class="relative isolate -mx-4 overflow-hidden sm:mx-0 sm:rounded-region"
      aria-labelledby="promesa"
    >
      <app-foto
        descripcion="Las canchas del club al atardecer, con las luces encendidas y
                     gente jugando al fondo"
        proporcion="16/9"
        [prioritaria]="true"
        claseCaja="min-h-[32rem] sm:min-h-[34rem] sm:max-h-[calc(100dvh-11rem)]"
      />

      <!--
        El scrim va de abajo hacia arriba y no cubre parejo: una foto tapada
        entera deja de ser una foto.

        Es azul y no negro porque el tinte del color de cancha es la mitad del
        lenguaje de esta portada; un velo negro la volvería una foto oscurecida
        y nada más. Y arriba llega al 65% en vez del 20% que tenía: por debajo de
        eso se transparenta el texto del marcador de posición y compite con el
        titular. Cuando la foto llegue, al 65% se sigue viendo entera.
      -->
      <div
        class="absolute inset-0 bg-gradient-to-t from-campo via-campo/90 to-campo/65"
        aria-hidden="true"
      ></div>

      <div
        class="absolute inset-0 flex flex-col justify-end gap-4 p-6 text-on-campo sm:p-10"
      >
        <!-- En dos líneas a todo ancho, como en la propuesta: en una sola, a
             1280px, el titular era una tira y dejaba de ser un titular. -->
        <h1 id="promesa" class="titular text-6xl sm:text-7xl lg:text-8xl">
          Tu cancha, <span class="block">a un clic</span>
        </h1>
        <p class="max-w-prose text-lg text-on-campo/90">
          Mira las horas libres de hoy y reserva sin llamar a nadie.
        </p>

        <div class="mt-2 grid gap-3 sm:max-w-lg sm:grid-cols-2">
          <a
            routerLink="/disponibilidad"
            class="boton boton-sobre-campo"
          >
            Ver disponibilidad
          </a>
          @if (!hayCuenta()) {
            <!--
              Dice "Crear cuenta" y no "Hacerme socio", que es lo que decía antes.

              Los dos botones llevan a /registro, que **crea una cuenta**;
              asociarse con pago de cuota es otra cosa y todavía no existe (es la
              tarea 6.4 del plan anterior, que quedó fuera de este). Un botón que
              promete una membresía y entrega un formulario de cuenta miente en
              el primer clic. Lo que vende la membresía es la sección de más
              abajo, que sí puede explicarla.

              Y es la misma etiqueta que usa la barra de arriba: cuatro nombres
              para la misma acción obligan a decidir cuatro veces si son la misma.
            -->
            <a
              routerLink="/registro"
              class="boton boton-contorno-sobre-campo"
            >
              Crear cuenta
            </a>
          }
        </div>
      </div>
    </section>

    <!--
      EL ZÓCALO — La próxima hora libre, como la barra inferior de una
      transmisión (TV3.1). Va pegado al hero y fuera de él, para que el hero se
      quede en sus cuatro elementos. En escritorio entra en la primera pantalla
      desde 720px de alto, porque el hero se achica para dejarle sitio: los 11rem
      del tope son la barra, el margen de arriba y el propio zócalo. Sin ese tope,
      a 1366×768 la hora quedaba cortada a la mitad (revisión de TV3.1). Usa la
      primera de "Libre hoy" sin una consulta nueva, y es el único que dice la
      carga, el vacío y el error.
    -->
    <section class="-mx-4 sm:mx-0" aria-labelledby="proxima-libre">
      <!-- En el teléfono el rótulo va arriba, a todo el ancho y sin corte: al
           costado se comía media fila y la hora quedaba en la otra mitad. -->
      <div class="bg-card shadow-md sm:flex sm:items-stretch">
        <h2
          id="proxima-libre"
          class="bg-rotulo px-4 py-1.5 font-display text-sm font-bold tracking-wider
                 text-on-rotulo uppercase sm:flex sm:items-center sm:ps-5 sm:corte-fin"
        >
          Próxima hora libre
        </h2>
        <div
          role="status"
          aria-live="polite"
          class="flex flex-1 flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-5"
        >
          @if (grillas.isLoading()) {
            <app-esqueleto class="flex-1" [filas]="1" etiqueta="Buscando la próxima hora libre…" />
          } @else if (grillas.error()) {
            <p class="text-muted-foreground">
              No pudimos cargar las horas de hoy.
              <a routerLink="/disponibilidad" class="font-semibold text-primary underline">
                Mira la disponibilidad
              </a>
            </p>
          } @else if (proximaLibre(); as libre) {
            <p class="font-display text-marcador text-primary">{{ hora(libre.inicio) }}</p>
            <div class="min-w-0 flex-1">
              <p class="font-display text-lg font-bold uppercase">{{ libre.cancha }}</p>
              <p class="text-sm text-muted-foreground">
                Arriendo {{ pesos(libre.montoClp) }}. Socio sin costo.
              </p>
            </div>
            <a routerLink="/disponibilidad" class="boton boton-primario w-full sm:w-auto">
              Reservar
              <span class="sr-only">{{ libre.cancha }} a las {{ hora(libre.inicio) }}</span>
            </a>
          } @else {
            <p class="font-semibold">
              Hoy ya no quedan horas libres.
              <a routerLink="/disponibilidad" class="text-primary underline">
                Mira los próximos días.
              </a>
            </p>
          }
        </div>
      </div>
    </section>

    @if (abiertos().length > 0) {
      <!--
        LA CINTA — El torneo con la inscripción abierta.

        **La pidió el club**: quien entra a reservar una hora no baja hasta el
        final, y una inscripción tiene fecha de cierre. El rótulo ancla a la
        sección en vez de sacar a nadie de la portada.

        Es su propia banda y no un quinto renglón del hero. taste § 4.7 prohíbe
        el texto chico bajo los botones —el hero es un momento, no una lista— y
        manda esas cosas a una sección propia debajo. Acá las dos reglas se
        cumplen: el club tiene su aviso sobre el pliegue y el hero queda en sus
        cuatro elementos.

        Hasta TV3.2 era un aviso verde con una frase. Ahora es la cinta de la
        transmisión, con la misma condición: la frase pasó a nombrar la región, y
        el rótulo dice "Inscripciones abiertas" a secas porque la frase entera no
        cabe fija en un teléfono.
      -->
      <app-cinta
        class="-mx-4 mt-3 sm:mx-0"
        [etiqueta]="avisoDeTorneos()"
        [mensajes]="mensajesDeTorneos()"
      >
        <a href="#torneos-abiertos" class="underline-offset-4 hover:underline">
          Inscripciones abiertas
        </a>
      </app-cinta>
    }

    <!--
      BANDA 2 — El marcador.

      La razón de que exista la portada: qué horas quedan hoy. Desde TV3.3 es el
      tablero de la transmisión, las horas contra las canchas: se lee de un
      vistazo cuándo y dónde, y cada celda libre lleva a reservar como el
      "Reservar" del carril al que reemplaza.

      Aparece solo si hay horas que listar. Cargando, sin horas o con la API
      caída, el aviso lo da el zócalo: la banda repetía la misma frase debajo, y
      con dos regiones vivas el lector de pantalla la anunciaba dos veces
      (revisión de TV3.1).
    -->
    @if (proximaLibre()) {
      <section
        class="-mx-4 mt-6 bg-campo px-4 py-8 text-on-campo sm:mx-0 sm:rounded-region sm:px-8"
        aria-labelledby="libre-hoy"
      >
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="libre-hoy" class="titular text-4xl sm:text-5xl">Libre hoy</h2>
          <a routerLink="/disponibilidad" class="text-sm font-semibold underline">
            Ver todos los horarios
          </a>
        </div>

        <app-marcador class="mt-5" [grillas]="grillasSeguras()" />
      </section>
    }

    <!--
      BANDA 3 — Las canchas, en cifras y no en lista.

      Ocho canchas en una lista de ocho filas es una tabla disfrazada. Lo que
      alguien necesita saber antes de venir son tres números, y esos van grandes.
    -->
    <section class="mt-16 grid gap-6 lg:grid-cols-2 lg:items-start" aria-labelledby="canchas">
      <!-- items-start y no items-center: en una grilla, una celda se estira al
           alto de la fila, y una foto estirada pierde su proporción. -->
      <app-foto
        descripcion="Una cancha vista desde el fondo, a la altura de la red, con la
                     superficie de cemento a la vista"
        proporcion="3/2"
        claseCaja="rounded-caja"
      />

      <div>
        <h2 id="canchas" class="font-display text-3xl font-bold">Nuestras canchas</h2>
        <p class="mt-2 max-w-prose text-muted-foreground">
          Todas de la misma superficie dura, todo el año. Sin arcilla y sin pasto: la
          pelota pica igual en enero que en julio.
        </p>

        <dl class="mt-6 grid grid-cols-3 gap-4">
          @for (dato of resumenDeCanchas(); track dato.etiqueta) {
            <div>
              <dt class="text-sm text-muted-foreground">{{ dato.etiqueta }}</dt>
              <dd class="font-display text-marcador text-primary">{{ dato.valor }}</dd>
            </div>
          }
        </dl>

        @if (desdeCuanto() !== null) {
          <p class="mt-6 text-lg">
            Desde
            <strong class="font-display text-2xl text-accent-strong">
              {{ pesos(desdeCuanto()!) }}
            </strong>
            la hora para quien no es socio.
          </p>
        }
      </div>
    </section>

    @if (abiertos().length > 0) {
      <!--
        BANDA 4 — Los torneos con la inscripción abierta.

        Solo aparece cuando hay alguno: una sección que dice "no hay torneos" no
        le sirve a nadie. Lo que se anuncia sale del mismo endpoint público que
        la página de torneos, filtrado por estado **y por fecha de cierre**: un
        torneo puede quedar en INSCRIPCION con el plazo vencido hasta que el
        admin arma el cuadro, y mandar a alguien a un formulario que lo va a
        rechazar es peor que no anunciarlo.
      -->
      <section class="mt-16" aria-labelledby="torneos-abiertos">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="torneos-abiertos" class="font-display text-3xl font-bold">
            Inscripciones abiertas
          </h2>
          <a routerLink="/torneos" class="text-sm font-semibold text-primary underline">
            Ver todos los torneos
          </a>
        </div>

        <ul class="mt-6 grid gap-4 md:grid-cols-2">
          @for (torneo of abiertos(); track torneo.id) {
            <!-- El fondo verde suave y no una barra de color en el canto: esa
                 franja es el tell más reconocible de una interfaz generada, y el
                 detector de impeccable la marca. -->
            <li class="rounded-caja bg-accent-soft p-6">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="font-display text-xl font-bold">{{ torneo.nombre }}</h3>
                <app-insignia variante="exito" icono="how_to_reg">
                  Inscripción abierta
                </app-insignia>
              </div>

              <p class="mt-1 text-sm text-muted-foreground">
                {{ enPalabras(torneo.fechaInicio) }}–{{ enPalabras(torneo.fechaFin) }}
              </p>
              <p class="text-sm font-medium">
                Te puedes inscribir hasta el {{ enPalabras(torneo.cierreInscripcion) }}.
              </p>

              <!-- **Una línea por categoría**: el valor y el cupo son de cada cuadro,
                   así que un precio del torneo mentiría —Honor puede costar el doble
                   que la 5ª el mismo fin de semana—. -->
              <ul class="mt-3 grid gap-1">
                @for (categoria of torneo.categorias; track categoria.id) {
                  <li class="flex flex-wrap gap-x-2 text-sm">
                    <strong>{{ categoria.categoria }}</strong>
                    <span class="text-accent-strong">{{ precio(categoria.montoClp) }}</span>
                    <span class="text-muted-foreground">
                      @if (categoria.cuposLibres > 0) {
                        · quedan {{ categoria.cuposLibres }} de {{ categoria.cupo }}
                      } @else {
                        · sin cupos, se entra en lista de espera
                      }
                    </span>
                  </li>
                }
              </ul>

              <a
                routerLink="/torneos"
                [queryParams]="{ inscripcion: torneo.id }"
                class="boton boton-primario mt-4 w-full"
              >
                Inscribirme
                <span class="sr-only">en {{ torneo.nombre }}</span>
              </a>
            </li>
          }
        </ul>
      </section>
    }

    @if (!hayCuenta()) {
      <!--
        BANDA 5 — Los dos caminos, del mismo peso.

        Dos bloques de color pleno, uno al lado del otro, sin jerarquía entre
        ellos. Es la decisión del club del 2026-09-08 puesta en la composición:
        el arriendo es el 55% del ingreso y la captación de socios es lo que más
        les urge, así que ninguno de los dos puede quedar como el chico.
      -->
      <section class="mt-16" aria-labelledby="dos-caminos">
        <h2 id="dos-caminos" class="sr-only">Socio o visitante</h2>

        <div class="grid gap-4 md:grid-cols-2">
          <div
            class="relative isolate overflow-hidden rounded-region bg-campo
                   p-8 text-on-campo"
          >
            <h3 class="font-display text-3xl font-bold">Socio</h3>
            <p class="mt-1 text-on-campo/90">
              Cuota mensual al día y la cancha sale sin costo.
            </p>
            <ul class="mt-6 grid gap-2">
              @for (punto of PLAN_SOCIO; track punto) {
                <li class="flex gap-2 text-sm">
                  <span class="icono shrink-0" aria-hidden="true">check_circle</span>
                  {{ punto }}
                </li>
              }
            </ul>
            <a routerLink="/registro" class="boton boton-sobre-campo mt-8 w-full">
              Crear cuenta
            </a>
          </div>

          <div class="rounded-region border-2 border-primary p-8">
            <h3 class="font-display text-3xl font-bold text-primary">Visitante</h3>
            <p class="mt-1 text-muted-foreground">
              Sin cuenta y sin cuota: pagas la hora que juegas.
            </p>
            <ul class="mt-6 grid gap-2">
              @for (punto of PLAN_VISITANTE; track punto) {
                <li class="flex gap-2 text-sm">
                  <span class="icono shrink-0 text-accent-strong" aria-hidden="true">
                    check_circle
                  </span>
                  {{ punto }}
                </li>
              }
            </ul>
            <a routerLink="/disponibilidad" class="boton boton-primario mt-8 w-full">
              Reservar una hora
            </a>
          </div>
        </div>
      </section>
    }

    <!--
      BANDA 6 — El cierre.

      Una foto del club a sangre y una sola cosa que hacer. La etiqueta del botón
      es la misma que arriba a propósito: dos formas de decir lo mismo en una
      página obligan a decidir dos veces qué son.
    -->
    <section
      class="relative isolate -mx-4 mt-16 overflow-hidden sm:mx-0 sm:rounded-region"
      aria-labelledby="cierre"
    >
      <app-foto
        descripcion="Socios conversando después de un partido, con las raquetas
                     todavía en la mano"
        proporcion="3/2"
        claseCaja="min-h-[18rem]"
      />
      <div class="absolute inset-0 bg-campo/85" aria-hidden="true"></div>

      <div
        class="absolute inset-0 flex flex-col items-center justify-center gap-4
               px-6 text-center text-on-campo"
      >
        <h2 id="cierre" class="font-display text-3xl font-bold sm:text-4xl">
          @if (proximaLibre()) {
            Todavía quedan horas para hoy
          } @else {
            Elige tu hora de esta semana
          }
        </h2>
        <a routerLink="/disponibilidad" class="boton boton-sobre-campo">
          Ver disponibilidad
        </a>
      </div>
    </section>
  `,
  styles: `
    /* Las bandas entran al aparecer, una sola vez y sin bloquear nada.

       Va con animation-timeline y no con IntersectionObserver porque el
       navegador la corre fuera del hilo principal: la portada es lo primero que
       se ve y no puede pagar JavaScript por una entrada. Donde la propiedad no
       existe, las secciones simplemente están ahí, que es el estado correcto. */
    @supports (animation-timeline: view()) {
      @media (prefers-reduced-motion: no-preference) {
        section {
          animation: entra linear both;
          animation-timeline: view();
          animation-range: entry 0% entry 40%;
        }
      }
    }

    @keyframes entra {
      from {
        opacity: 0;
        transform: translateY(1.5rem);
      }
    }
  `,
})
export class Inicio {
  private readonly disponibilidad = inject(Disponibilidad);
  private readonly auth = inject(Auth);
  private readonly torneos = inject(Torneos);

  /**
   * El calendario del año, para quedarse solo con lo que se puede inscribir hoy.
   *
   * Del mismo endpoint público que la página de torneos y sin uno nuevo: lo que la
   * portada muestra es un recorte de lo que ya se publica, y dos fuentes para el mismo
   * dato se contradicen el día que alguien cambia una.
   */
  private readonly calendario = resource({
    loader: () => this.torneos.calendario(),
    defaultValue: [],
  });

  /** Como `grillasSeguras`: `value()` lanza en estado de error. */
  private readonly calendarioSeguro = computed(() =>
    this.calendario.hasValue() ? this.calendario.value() : [],
  );

  /**
   * Los torneos que aceptan inscripciones **hoy**.
   *
   * El estado no alcanza: un torneo puede quedar en `INSCRIPCION` con la fecha de
   * cierre pasada hasta que el admin arma el cuadro, y anunciar eso en la portada es
   * mandar a alguien a un formulario que lo va a rechazar. La fecha de cierre cuenta
   * entera, como en el servidor.
   */
  protected readonly abiertos = computed(() =>
    this.calendarioSeguro()
      .filter(
        (torneo) =>
          torneo.estado === 'INSCRIPCION' &&
          torneo.cierreInscripcion.slice(0, 10) >= hoyEnElClub(),
      ),
  );

  /** El aviso de la franja: un torneo se nombra, varios se cuentan. */
  protected readonly avisoDeTorneos = computed(() => {
    const abiertos = this.abiertos();

    return abiertos.length === 1
      ? `Inscripciones abiertas: ${abiertos[0].nombre}, hasta el ` +
          `${diaEnPalabras(abiertos[0].cierreInscripcion)}`
      : `${abiertos.length} torneos con la inscripción abierta`;
  });

  /**
   * Lo que pasa por la cinta: hasta cuándo, cuánto lugar queda y cuándo se
   * juega. Los cupos son los mismos que la sección de abajo; la cinta los
   * adelanta para quien no baja.
   */
  protected readonly mensajesDeTorneos = computed(() =>
    this.abiertos().flatMap((torneo) => [
      `${torneo.nombre}: inscripciones hasta el ${diaEnPalabras(torneo.cierreInscripcion)}`,
      ...torneo.categorias.map(
        ({ categoria, cupo, cuposLibres }) =>
          `${categoria}: ` +
          (cuposLibres > 0
            ? `quedan ${cuposLibres} de ${cupo} cupos`
            : 'sin cupos, se entra en lista de espera'),
      ),
      `Se juega desde el ${diaEnPalabras(torneo.fechaInicio)}`,
    ]),
  );

  protected readonly enPalabras = diaEnPalabras;

  /** El precio de una categoría. Cero es gratis y se dice con la palabra. */
  protected precio(montoClp: number): string {
    return montoClp > 0 ? enPesos(montoClp) : 'gratis';
  }

  /**
   * Si hay sesión abierta, la portada deja de vender la cuenta.
   *
   * "Hacerme socio" y la sección de los dos caminos le proponen a quien ya entró
   * algo que ya hizo. Se mira la sesión y no la ficha de socio porque el visitante
   * con cuenta está en el mismo caso.
   */
  protected readonly hayCuenta = computed(() => this.auth.usuario() !== null);

  /**
   * La grilla del día.
   *
   * **Son nueve peticiones y debería ser una.** `delDia` pide el catálogo y
   * después una consulta por cancha, porque el endpoint es por cancha; con ocho
   * canchas eso es lo que cuesta pintar seis horas. El arreglo es un endpoint
   * que devuelva el día entero, que es trabajo de la API y este plan no la toca.
   * Está anotado como hallazgo 6 de la auditoría y se cierra en D8.5.
   */
  protected readonly grillas = resource({
    loader: () => this.disponibilidad.delDia(hoyEnElClub()),
    defaultValue: [],
  });

  /**
   * Las grillas, leídas sin reventar.
   *
   * `value()` de un `resource` **lanza una excepción en estado de error**, aunque
   * tenga `defaultValue`. Sin esto, si la API de disponibilidad no respondía, los
   * `computed` que la leen rompían el pintado de la portada entera en vez de que
   * cada sección dijera "no pudimos cargar". Encontrado al probar el estado de
   * error del zócalo (TV3.1). Cada sección sigue preguntando por `error()`.
   */
  protected readonly grillasSeguras = computed(() =>
    this.grillas.hasValue() ? this.grillas.value() : [],
  );

  private readonly canchas = computed(() => this.grillasSeguras().map(({ cancha }) => cancha));

  /**
   * Las tres cifras que alguien necesita antes de venir.
   *
   * Ocho canchas en una lista de ocho filas es una tabla disfrazada, y taste
   * pide otro componente para más de cinco ítems. Lo que se lee de un vistazo
   * son tres números.
   */
  protected readonly resumenDeCanchas = computed(() => {
    const canchas = this.canchas();
    const techadas = canchas.filter((cancha) => cancha.techada).length;
    const conLuz = canchas.filter((cancha) => cancha.iluminacion).length;

    return [
      { etiqueta: canchas.length === 1 ? 'Cancha' : 'Canchas', valor: `${canchas.length}` },
      { etiqueta: 'Techadas', valor: `${techadas}` },
      { etiqueta: 'Con iluminación', valor: `${conLuz}` },
    ];
  });

  /**
   * La hora más barata de hoy.
   *
   * Sale de la grilla y no de un catálogo de tarifas porque el precio *es* del
   * bloque: cambia por franja y por día. "Desde" es la palabra honesta.
   */
  protected readonly desdeCuanto = computed(() => {
    const precios = this.grillasSeguras()
      .flatMap(({ bloques }) => bloques.filter((b) => !b.bloqueado).map((b) => b.montoClp));

    return precios.length > 0 ? Math.min(...precios) : null;
  });

  /**
   * La próxima hora libre de hoy, la del zócalo.
   *
   * Hasta TV3.3 era la lista de "Libre hoy", una por hora y hasta seis. El
   * marcador muestra ahora el día entero, así que acá queda solo la primera.
   */
  protected readonly proximaLibre = computed(() => {
    const ahora = Date.now();

    const libres = this.grillasSeguras()
      .flatMap(({ cancha, bloques }) =>
        bloques
          .filter(
            (bloque) =>
              !bloque.bloqueado &&
              !bloque.reservado &&
              new Date(bloque.inicio).getTime() > ahora,
          )
          .map((bloque) => ({ ...bloque, cancha: cancha.nombre })),
      )
      .sort((una, otra) => una.inicio.localeCompare(otra.inicio));

    return libres[0] ?? null;
  });

  /**
   * Las dos formas de jugar acá.
   *
   * Los cupos del socio —cuántas horas por día, cuántos invitados al mes— no
   * están escritos: viven en `ConfiguracionClub` y el club puede cambiarlos, pero
   * hoy no hay endpoint público que los devuelva. Prometer "1 hora por día" desde
   * una constante del navegador es prometer algo que el admin puede desmentir
   * esta tarde desde su panel.
   */
  protected readonly PLAN_SOCIO = [
    'Sin pago al reservar: la hora ya está en tu cuota',
    'Cupo diario de cancha y horas en franja pico',
    'Puedes traer invitados cada mes',
    'Cambias y cancelas desde "Mis reservas"',
  ];

  protected readonly PLAN_VISITANTE = [
    'Arriendo por hora, con el precio a la vista',
    'Pagas en línea al reservar',
    'Cancelas con 24 horas y se devuelve todo',
    'Modificas hasta 6 horas antes',
  ];

  protected readonly hora = horaEnElClub;
  protected readonly pesos = enPesos;
}
