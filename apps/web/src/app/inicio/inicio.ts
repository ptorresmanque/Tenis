import { Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Disponibilidad } from '../catalogo-canchas/disponibilidad';
import {
  diaEnPalabras,
  enPesos,
  horaEnElClub,
  hoyEnElClub,
} from '../catalogo-canchas/reloj-del-club';
import { nombreDeSuperficie } from '../catalogo-canchas/superficies';
import { Auth } from '../core/auth/auth';
import { Torneos } from '../torneos/torneos.service';
import { EstadoVacio } from '../ui/estado-vacio';
import { Insignia } from '../ui/insignia';

/**
 * La portada.
 *
 * **Muestra horas de verdad, no un folleto.** Las que se ofrecen abajo salen de la
 * misma consulta que la grilla, así que el precio y la disponibilidad son los del
 * momento: una portada con horarios inventados envejece el mismo día.
 *
 * **Anuncia los torneos con la inscripción abierta**, que es lo único de "La vida del
 * club" que la portada muestra. El resto de esa sección del diseño —clases y ranking—
 * sigue fuera: acá va lo que alguien puede hacer *hoy*, y de esos tres módulos el único
 * con una fecha de cierre encima es la inscripción a un torneo.
 *
 * Lo que se anuncia sale del mismo endpoint público que la página de torneos, filtrado
 * por estado **y por fecha de cierre**: un torneo puede quedar en `INSCRIPCION` con el
 * plazo vencido hasta que el admin arma el cuadro, y mandar a alguien a un formulario
 * que lo va a rechazar es peor que no anunciarlo.
 */
@Component({
  selector: 'app-inicio',
  imports: [RouterLink, EstadoVacio, Insignia],
  template: `
    <section class="py-8 text-center sm:py-12">
      <h1 class="font-display text-5xl font-black tracking-tight text-balance sm:text-6xl">
        Tu cancha, a un clic
      </h1>
      <p class="mx-auto mt-4 max-w-prose text-lg text-muted-foreground">
        Reserva por hora sin ser socio, o entra con tu cuenta y usa tu cupo.
        Disponibilidad real y precio a la vista.
      </p>

      <div class="mt-8 flex flex-wrap justify-center gap-3">
        <a routerLink="/disponibilidad" class="boton boton-primario">
          Ver disponibilidad
        </a>
        @if (!hayCuenta()) {
          <a routerLink="/entrar" class="boton boton-secundario">Soy socio</a>
        }
      </div>

      <p
        class="mx-auto mt-8 flex max-w-xl flex-wrap items-center justify-center gap-x-2
               gap-y-1 rounded-xl border border-border bg-card px-4 py-3 text-sm
               text-muted-foreground"
      >
        <span class="icono text-primary" aria-hidden="true">verified</span>
        {{ cuantasCanchas() }} · Abierto de 08:00 a 22:00 · Reserva confirmada al
        instante
      </p>

      <!-- **La franja del torneo va sobre el pliegue y la sección abajo.** Es lo que
           pidió el club: quien entra a reservar una hora no baja hasta el final, y un
           torneo con la inscripción abierta tiene fecha de cierre. El aviso ancla a la
           sección en vez de sacar a nadie de la portada. -->
      @if (abiertos().length > 0) {
        <p class="mt-4 text-sm">
          <a
            href="#torneos-abiertos"
            class="inline-flex flex-wrap items-center justify-center gap-2 rounded-full
                   border border-primary/30 bg-primary/5 px-4 py-2 font-semibold
                   text-primary"
          >
            <span class="icono" aria-hidden="true">emoji_events</span>
            {{ avisoDeTorneos() }}
          </a>
        </p>
      }
    </section>

    @if (abiertos().length > 0) {
      <section class="mt-12" aria-labelledby="torneos-abiertos">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="torneos-abiertos" class="font-display text-2xl font-semibold">
            Inscripciones abiertas
          </h2>
          <a routerLink="/torneos" class="text-sm font-semibold text-primary">
            Ver todos los torneos
          </a>
        </div>

        <ul class="mt-4 grid gap-4 md:grid-cols-2">
          @for (torneo of abiertos(); track torneo.id) {
            <li class="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="font-display text-lg font-semibold">
                  {{ torneo.nombre }}
                </h3>
                <app-insignia variante="exito" icono="how_to_reg">
                  Inscripción abierta
                </app-insignia>
              </div>

              <p class="mt-1 text-sm text-muted-foreground">
                {{ enPalabras(torneo.fechaInicio) }} —
                {{ enPalabras(torneo.fechaFin) }}
              </p>
              <p class="text-sm font-medium">
                Te puedes inscribir hasta el
                {{ enPalabras(torneo.cierreInscripcion) }}.
              </p>

              <!-- **Una línea por categoría**: el valor y el cupo son de cada cuadro,
                   así que un precio del torneo mentiría —Honor puede costar el doble
                   que la 5ª el mismo fin de semana—. -->
              <ul class="mt-3 grid gap-1">
                @for (categoria of torneo.categorias; track categoria.id) {
                  <li class="flex flex-wrap gap-x-2 text-sm">
                    <strong>{{ categoria.categoria }}</strong>
                    <span class="text-accent-strong">
                      {{ precio(categoria.montoClp) }}
                    </span>
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

    <section class="mt-12" aria-labelledby="libre-hoy">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="libre-hoy" class="font-display text-2xl font-semibold">Libre hoy</h2>
        <a routerLink="/disponibilidad" class="text-sm font-semibold text-primary">
          Ver todos los horarios
        </a>
      </div>

      <div role="status" aria-live="polite" class="mt-4">
        @if (grillas.isLoading()) {
          <p class="text-muted-foreground">Buscando las horas de hoy…</p>
        } @else if (grillas.error()) {
          <p class="text-muted-foreground">
            No pudimos cargar las horas de hoy.
            <a routerLink="/disponibilidad" class="font-medium underline">
              Mira la disponibilidad
            </a>
          </p>
        } @else if (libresDeHoy().length === 0) {
          <app-estado-vacio
            icono="event_busy"
            titulo="Hoy ya no quedan horas libres"
            detalle="Mañana abre de nuevo a las 08:00."
          >
            <a routerLink="/disponibilidad" class="boton boton-primario">
              Ver otros días
            </a>
          </app-estado-vacio>
        }
      </div>

      @if (libresDeHoy().length > 0) {
        <ul class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          @for (libre of libresDeHoy(); track libre.inicio + libre.cancha) {
            <li
              class="flex items-center gap-4 rounded-xl border border-border bg-card p-4
                     shadow-sm"
            >
              <p class="font-display text-2xl font-bold text-primary">
                {{ hora(libre.inicio) }}
              </p>
              <div class="min-w-0 flex-1">
                <p class="truncate font-semibold">{{ libre.cancha }}</p>
                <p class="text-sm text-muted-foreground">
                  Socio sin costo · Arriendo
                  <span class="font-semibold text-accent-strong">
                    {{ pesos(libre.montoClp) }}
                  </span>
                </p>
              </div>
              <a routerLink="/disponibilidad" class="boton boton-primario boton-chico">
                Reservar
                <span class="sr-only">
                  {{ libre.cancha }} a las {{ hora(libre.inicio) }}
                </span>
              </a>
            </li>
          }
        </ul>
      }
    </section>

    <section class="mt-16" aria-labelledby="nuestras-canchas">
      <h2 id="nuestras-canchas" class="font-display text-2xl font-semibold">
        Nuestras canchas
      </h2>
      <p class="mt-1 max-w-prose text-muted-foreground">
        Todas de la misma superficie dura, todo el año. Sin arcilla y sin pasto: la
        pelota pica igual en enero que en julio.
      </p>

      <ul class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        @for (cancha of canchas(); track cancha.id) {
          <li class="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h3 class="font-display text-lg font-semibold">{{ cancha.nombre }}</h3>
            <p class="mt-2 flex flex-wrap gap-2">
              <app-insignia variante="info" icono="sports_tennis">
                {{ superficie(cancha.superficie) }}
              </app-insignia>
              @if (cancha.techada) {
                <app-insignia variante="neutro" icono="roofing">Techada</app-insignia>
              }
              @if (cancha.iluminacion) {
                <app-insignia variante="neutro" icono="lightbulb">
                  Con iluminación
                </app-insignia>
              }
            </p>
            @if (cancha.desde !== null) {
              <p class="mt-3 font-semibold text-accent-strong">
                Desde {{ pesos(cancha.desde) }} la hora
              </p>
            }
          </li>
        }
      </ul>
    </section>

    @if (!hayCuenta()) {
      <section class="mt-16" aria-labelledby="socio-o-visitante">
        <h2 id="socio-o-visitante" class="font-display text-2xl font-semibold">
          Socio o visitante
        </h2>

        <div class="mt-4 grid gap-4 md:grid-cols-2">
          @for (plan of PLANES; track plan.titulo) {
            <div
              class="rounded-xl border bg-card p-6 shadow-sm"
              [class.border-primary]="plan.destacado"
              [class.border-border]="!plan.destacado"
            >
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="font-display text-xl font-semibold">{{ plan.titulo }}</h3>
                @if (plan.destacado) {
                  <app-insignia variante="info" icono="star">Recomendado</app-insignia>
                }
              </div>
              <p class="mt-1 text-sm text-muted-foreground">{{ plan.bajada }}</p>

              <ul class="mt-4 grid gap-2">
                @for (punto of plan.puntos; track punto) {
                  <li class="flex gap-2 text-sm">
                    <span class="icono text-accent-strong" aria-hidden="true">
                      check_circle
                    </span>
                    {{ punto }}
                  </li>
                }
              </ul>

              <a [routerLink]="plan.destino" class="boton boton-primario mt-6 w-full">
                {{ plan.accion }}
              </a>
            </div>
          }
        </div>
      </section>
    }

    <section
      class="mt-16 rounded-2xl bg-primary px-6 py-12 text-center text-on-primary"
      aria-labelledby="jugamos-hoy"
    >
      <h2 id="jugamos-hoy" class="font-display text-3xl font-bold">¿Jugamos hoy?</h2>
      <p class="mt-2">
        @if (libresDeHoy().length > 0) {
          Todavía quedan horas libres para hoy.
        } @else {
          Mira los próximos días y elige la tuya.
        }
      </p>
      <a
        routerLink="/disponibilidad"
        class="boton mt-6 bg-card text-primary hover:opacity-90"
      >
        Ver disponibilidad
      </a>
    </section>
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

  /**
   * Los torneos que aceptan inscripciones **hoy**.
   *
   * El estado no alcanza: un torneo puede quedar en `INSCRIPCION` con la fecha de
   * cierre pasada hasta que el admin arma el cuadro, y anunciar eso en la portada es
   * mandar a alguien a un formulario que lo va a rechazar. La fecha de cierre cuenta
   * entera, como en el servidor.
   */
  protected readonly abiertos = computed(() =>
    this.calendario
      .value()
      .filter(
        (torneo) =>
          torneo.estado === 'INSCRIPCION' &&
          torneo.cierreInscripcion.slice(0, 10) >= hoyEnElClub(),
      ),
  );

  /** El aviso de arriba: un torneo se nombra, varios se cuentan. */
  protected readonly avisoDeTorneos = computed(() => {
    const abiertos = this.abiertos();

    return abiertos.length === 1
      ? `Inscripciones abiertas: ${abiertos[0].nombre}, hasta el ` +
          `${diaEnPalabras(abiertos[0].cierreInscripcion)}`
      : `${abiertos.length} torneos con la inscripción abierta`;
  });

  protected readonly enPalabras = diaEnPalabras;

  /** El precio de una categoría. Cero es gratis y se dice con la palabra. */
  protected precio(montoClp: number): string {
    return montoClp > 0 ? enPesos(montoClp) : 'gratis';
  }

  /**
   * Si hay sesión abierta, la portada deja de vender la cuenta.
   *
   * "Soy socio" lleva al login y la sección "Socio o visitante" ofrece registrarse:
   * las dos le proponen a quien ya entró algo que ya hizo. Se mira la sesión y no la
   * ficha de socio porque el visitante con cuenta está en el mismo caso —el botón
   * "Crear mi cuenta" tampoco tiene nada que ofrecerle.
   */
  protected readonly hayCuenta = computed(() => this.auth.usuario() !== null);

  protected readonly grillas = resource({
    loader: () => this.disponibilidad.delDia(hoyEnElClub()),
    defaultValue: [],
  });

  /**
   * Las canchas del club con lo que cuesta la hora más barata de hoy.
   *
   * El precio sale de la grilla y no de un catálogo de tarifas porque el precio
   * *es* del bloque: cambia por franja y por día. "Desde" es la palabra honesta.
   */
  protected readonly canchas = computed(() =>
    this.grillas.value().map(({ cancha, bloques }) => {
      const precios = bloques.filter((b) => !b.bloqueado).map((b) => b.montoClp);

      return {
        ...cancha,
        desde: precios.length > 0 ? Math.min(...precios) : null,
      };
    }),
  );

  /** Cuántas hay publicadas hoy, con el plural que corresponda. */
  protected readonly cuantasCanchas = computed(() => {
    const cuantas = this.canchas().length;

    return cuantas === 1 ? '1 cancha dura' : `${cuantas} canchas duras`;
  });

  /** Las próximas horas libres de hoy, las que alcanzan a jugarse. */
  protected readonly libresDeHoy = computed(() => {
    const ahora = Date.now();

    return this.grillas
      .value()
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
      .sort((una, otra) => una.inicio.localeCompare(otra.inicio))
      .slice(0, 6);
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
  protected readonly PLANES = [
    {
      titulo: 'Socio',
      bajada: 'Cuota mensual al día y la cancha sale sin costo.',
      destacado: true,
      puntos: [
        'Sin pago al reservar: la hora ya está en tu cuota',
        'Cupo diario de cancha y horas en franja pico',
        'Puedes traer invitados cada mes',
        'Cambias y cancelas desde "Mis reservas"',
      ],
      accion: 'Crear mi cuenta',
      destino: '/registro',
    },
    {
      titulo: 'Visitante',
      bajada: 'Sin cuenta y sin cuota: pagas la hora que juegas.',
      destacado: false,
      puntos: [
        'Arriendo por hora, con el precio a la vista',
        'Pagas en línea al reservar',
        'Cancelas con 24 horas y se devuelve todo',
        'Modificas hasta 6 horas antes',
      ],
      accion: 'Reservar una hora',
      destino: '/disponibilidad',
    },
  ];

  protected readonly hora = horaEnElClub;
  protected readonly pesos = enPesos;

  protected readonly superficie = nombreDeSuperficie;
}
