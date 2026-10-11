import { Injectable, computed, inject, resource, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';

import { irAPagar } from '../../core/pagos/ir-a-pagar';
import { ReservasPublicas } from '../../reservas/reserva-publica.service';
import { mensajeDeRechazo, Reservas } from '../../reservas/reservas.service';
import { BloqueDisponible, Cancha, DuracionMin, GrillaDeCancha } from '../disponibilidad';
import { minutosDe } from '../reloj-del-club';

/** Una hora de la grilla: la cancha y su bloque. */
interface Eleccion {
  cancha: Cancha;
  bloque: BloqueDisponible;
}

/**
 * La grilla en modo mover: el clic cambia una reserva que ya existe en vez de tomar una
 * nueva.
 *
 * Se llega desde dos lados, y los dos viajan en la URL y no en un servicio compartido: así
 * sobreviven a un refresco y a compartir el enlace, y quien no viene de ahí no paga nada.
 * `mover` trae el id, desde "mis reservas" del socio; `moverToken` trae el token, desde el
 * enlace del visitante (T88), que no tiene sesión.
 *
 * Uno por grilla: va en sus `providers`, no en la raíz.
 */
@Injectable()
export class MoverReserva {
  private readonly reservas = inject(Reservas);
  private readonly enlace = inject(ReservasPublicas);
  private readonly router = inject(Router);
  private readonly parametros = toSignal(inject(ActivatedRoute).queryParamMap);

  /** La reserva del socio que se mueve, por su id. */
  readonly porId = computed(() => {
    const id = Number(this.parametros()?.get('mover'));

    return Number.isInteger(id) && id > 0 ? id : null;
  });

  /** La que se mueve desde su enlace, sin sesión (T88): el token es la llave. */
  readonly porToken = computed(() => this.parametros()?.get('moverToken') || null);

  /** Si el próximo clic mueve una reserva en vez de elegir una hora nueva. */
  readonly activo = computed(() => this.porId() !== null || this.porToken() !== null);

  /** Lo que pagó quien mueve desde el enlace, para decirle la regla antes de elegir. */
  private readonly reservaDelEnlace = resource({
    params: () => this.porToken() ?? undefined,
    loader: ({ params: token }) => this.enlace.porToken(token),
  });

  readonly pagadoPorElEnlace = computed(() =>
    this.reservaDelEnlace.hasValue() ? this.reservaDelEnlace.value().pagadoClp : null,
  );

  /**
   * La cancha de la reserva que se mueve, por su nombre, que es único. La barra la
   * preelige si sigue libre en la celda: alargar una hora no la cambia de cancha (T104).
   * Desde "mis reservas" viaja en la URL; desde el enlace, la dice la reserva misma.
   */
  readonly cancha = computed(() => {
    if (this.porToken() !== null) {
      return this.reservaDelEnlace.hasValue() ? this.reservaDelEnlace.value().cancha : null;
    }

    return this.porId() !== null ? (this.parametros()?.get('cancha') ?? null) : null;
  });

  readonly error = signal<string | null>(null);

  /**
   * Un solo movimiento en vuelo: con la red lenta, quien no ve reacción vuelve a apretar, y
   * dos PATCH dejan la reserva donde responda el último, no donde eligió.
   */
  readonly enviando = signal(false);

  /**
   * El día sin contar la reserva que se mueve (T87): con la grilla pública, alargarla en la
   * misma cancha y hora salía ocupado por ella misma. Nulo si no se mueve ninguna.
   */
  grillaDelDia(consulta: {
    fecha: string;
    duracion: DuracionMin;
    porId: number | null;
    porToken: string | null;
  }): Promise<GrillaDeCancha[]> | null {
    const { fecha, duracion, porId, porToken } = consulta;

    if (porId !== null) return this.reservas.grillaParaMover(porId, fecha, duracion);
    if (porToken !== null) return this.enlace.grillaParaMover(porToken, fecha, duracion);

    return null;
  }

  /**
   * El socio confirma el cambio en la barra y se mueve al tiro: no paga, y no hay
   * diferencia que cobrarle ni ruta a Webpay.
   */
  async moverAlTiro(eleccion: Eleccion): Promise<void> {
    const reservaId = this.porId();

    if (reservaId === null || this.enviando()) return;

    this.enviando.set(true);
    this.error.set(null);

    try {
      await this.reservas.mover(reservaId, destinoDe(eleccion));
      await this.router.navigate(['/mis-reservas']);
    } catch (falla) {
      // Se queda en la grilla a propósito: la hora que eligió no se pudo, pero las
      // otras siguen ahí y volver atrás para reintentar sería un paso de más.
      this.error.set(mensajeDeRechazo(falla).mensaje);
    } finally {
      this.enviando.set(false);
    }
  }

  /**
   * Confirma el cambio desde el enlace (T91), con la hora marcada en la barra.
   *
   * Si vale más que lo pagado, va a pagar la diferencia: la reserva se mueve recién
   * cuando Webpay autoriza, y la vuelta lleva a su página (T89). Si no, se mueve al tiro
   * y no se devuelve nada. La diferencia la recalcula el servidor; lo de acá decide solo
   * a qué ruta ir, y si el servidor no está de acuerdo, lo dice su rechazo.
   */
  async cambiarPorEnlace(eleccion: Eleccion): Promise<void> {
    const token = this.porToken();
    const pagado = this.pagadoPorElEnlace();

    if (token === null || pagado === null || this.enviando()) return;

    this.enviando.set(true);
    this.error.set(null);
    const destino = destinoDe(eleccion);

    try {
      if ((eleccion.bloque.montoClp ?? 0) > pagado) {
        irAPagar(await this.enlace.pagarDiferencia(token, destino));
      } else {
        await this.enlace.mover(token, destino);
        // A la página de la reserva, que es su "mis reservas", con lo que pasó.
        await this.router.navigate(['/r', token], { queryParams: { cambio: 'hecho' } });
      }
    } catch (falla) {
      this.error.set(mensajeDeRechazo(falla).mensaje);
    } finally {
      this.enviando.set(false);
    }
  }
}

/** A dónde va un cambio: la cancha, el inicio y la duración del bloque elegido. */
function destinoDe({ cancha, bloque }: Eleccion) {
  return {
    canchaId: cancha.id,
    inicio: bloque.inicio,
    // La del bloque, como al reservar: la grilla lo pidió de la duración elegida.
    duracionMin: minutosDe(bloque),
  };
}
