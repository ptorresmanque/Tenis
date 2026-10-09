import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type EstadoTorneo =
  | 'INSCRIPCION'
  | 'CUADRO_ARMADO'
  | 'EN_CURSO'
  | 'FINALIZADO'
  | 'CANCELADO';

/** Cómo se lee cada estado en pantalla. */
export const ESTADOS_TORNEO: Record<EstadoTorneo, string> = {
  INSCRIPCION: 'Inscripción abierta',
  CUADRO_ARMADO: 'Cuadro armado',
  EN_CURSO: 'En curso',
  FINALIZADO: 'Finalizado',
  CANCELADO: 'Cancelado',
};

/** Quien juega torneos. No es el socio: vuelve el año siguiente con sus puntos. */
export interface Jugador {
  id: number;
  nombre: string;
  apellido: string;
  telefono: string | null;
  socioId: number | null;
  /** Plano y no anidado: se muestra al lado del nombre en todas las listas. */
  numeroSocio: string | null;
  activo: boolean;
}

export interface CategoriaTorneo {
  id: number;
  nombre: string;
  puntosCampeon: number;
  activa: boolean;
}

export interface Torneo {
  id: number;
  nombre: string;
  superficie: string | null;
  fechaInicio: string;
  fechaFin: string;
  cierreInscripcion: string;
  estado: EstadoTorneo;
  /**
   * Qué categorías corre.
   *
   * **El cupo es de cada una** (T62) y **cuánto vale ganarla también** (T70): en el
   * mismo fin de semana, Honor puede ser un Máster 500 y la 5ª un Club 250.
   */
  cuadros: {
    id: number;
    categoria: string;
    cupo: number;
    categoriaId: number;
    valor: string;
    puntosCampeon: number;
  }[];
  /** Cuántos comprobantes esperan que una persona los mire. */
  pagosPorRevisar: number;
  /** Cuántos esperan un lugar en alguno de sus cuadros. */
  enEspera: number;
}

/** El nivel del **jugador**: 5ª, 4ª, … Honor. No es `CategoriaTorneo`. */
export interface CategoriaJuego {
  id: number;
  nombre: string;
  orden: number;
  activa: boolean;
}

/** Un cuadro del torneo: la categoría que corre y con cuántos. */
export interface CuadroDelTorneo {
  id: number;
  torneoId: number;
  categoriaJuegoId: number;
  categoria: string;
  cupo: number;
  montoInscripcionClp: number;
  semillaSorteo: number | null;
  /** Cuánto vale ganarlo (T70): la categoría de torneo, no la de juego. */
  categoriaId: number;
  valor: string;
  puntosCampeon: number;
}

export type EstadoInscripcionTorneo = 'INSCRITA' | 'LISTA_ESPERA' | 'RETIRADA';

/** Cómo va el pago de una inscripción. **Eje aparte del estado de la inscripción.** */
export type EstadoPagoInscripcion =
  | 'EXENTA'
  | 'PENDIENTE'
  | 'PAGADA'
  | 'RECHAZADA';

/** Una inscripción a un torneo, como se lee en la lista. */
export interface InscripcionTorneo {
  id: number;
  jugadorId: number;
  jugador: string;
  numeroSocio: string | null;
  /** De qué club viene. Sale en el panel y en la lista pública. */
  procedencia: string | null;
  /**
   * Cuándo **no** puede jugar (T65).
   *
   * Solo en el panel: dice a qué hora esa persona no está en su casa, así que es dato
   * de seguridad de un tercero y no sale en la respuesta pública.
   */
  restricciones: { diaSemana: number; horaDesde: string; horaHasta: string }[];
  siembra: number | null;
  estado: EstadoInscripcionTorneo;
  inscritaEn: string;
  /** Cómo va su pago, en la misma fila que su nombre. */
  estadoPago: EstadoPagoInscripcion;
  /** Qué dijo que iba a hacer. Nulo si es gratis o lo anotó el admin. */
  medioPago: 'WEBPAY' | 'TRANSFERENCIA' | null;
  /**
   * Si hay un comprobante que mirar.
   *
   * Es lo que separa "subió algo y espera que lo revises" de "eligió Webpay y todavía
   * no paga": en la base las dos son `PENDIENTE`, y para el club son dos cosas
   * distintas —una es trabajo suyo y la otra se resuelve sola—.
   */
  tieneComprobante: boolean;
  /** A quién llamar si el comprobante no cuadra. Solo en el panel. */
  telefono: string | null;
}

/** La lista de un **cuadro**, en tres grupos porque son tres cosas distintas. */
export interface ListaDelCuadro {
  torneoId: number;
  torneoCategoriaId: number;
  categoria: string;
  cupo: number;
  /** Cuánto cuesta este cuadro. Es el mismo para todos sus inscritos. */
  montoClp: number;
  estado: EstadoTorneo;
  inscritos: InscripcionTorneo[];
  enEspera: InscripcionTorneo[];
  retirados: InscripcionTorneo[];
}

/** Un partido, como se dibuja en el cuadro. */
/** Una transmisión, **con la URL ya armada por el servidor**. Nunca el id pelado. */
export interface Transmision {
  id: number;
  canchaId: number;
  cancha: string;
  titulo: string | null;
  inicio: string;
  fin: string;
  url: string;
  miniatura: string;
}

export interface PartidoDelCuadro {
  id: number;
  ronda: number;
  ronda_nombre: string;
  posicion: number;
  jugadorA: string | null;
  jugadorB: string | null;
  jugadorAId: number | null;
  jugadorBId: number | null;
  ganadorId: number | null;
  marcador: string | null;
  walkover: boolean;
  /** Cuándo y dónde se juega (T67). Nulos mientras nadie lo programe. */
  programadoInicio: string | null;
  programadoFin: string | null;
  canchaId: number | null;
  cancha: string | null;
}

export interface Cuadro {
  torneoId: number;
  torneoCategoriaId: number;
  categoria: string;
  estado: EstadoTorneo;
  armado: boolean;
  rondas: number;
  /** Con qué se sorteó: guardada para poder rehacer el sorteo. */
  semillaSorteo: number | null;
  partidos: PartidoDelCuadro[];
}

/** Un torneo del calendario, como lo ve quien todavía no es del club. */
export interface TorneoPublico {
  id: number;
  nombre: string;
  categoria: string;
  superficie: string | null;
  fechaInicio: string;
  fechaFin: string;
  cierreInscripcion: string;
  estado: EstadoTorneo;
  /** Sus cuadros, con cuánto lugar queda en cada uno. */
  categorias: CategoriaPublica[];
}

/** Un cuadro visto desde la calle. */
export interface CategoriaPublica {
  id: number;
  /** El nivel del jugador. Es lo que el formulario manda al inscribirse. */
  categoriaJuegoId: number;
  categoria: string;
  /** Cuánto vale ganarlo: "Club 250". Del cuadro y no del torneo desde T70. */
  valor: string;
  /** Cuánto cuesta inscribirse en **esta** categoría. 0 = gratis. */
  montoClp: number;
  cupo: number;
  cuposLibres: number;
  armado: boolean;
}

/** Un partido publicado: nombres y marcador, sin teléfonos. */
export interface PartidoPublico {
  ronda: number;
  ronda_nombre: string;
  posicion: number;
  jugadorA: string | null;
  jugadorB: string | null;
  ganador: string | null;
  marcador: string | null;
  walkover: boolean;
  /** Cuándo y dónde, si el club ya lo programó (T134). Instantes ISO y nombre de cancha. */
  inicio: string | null;
  fin: string | null;
  cancha: string | null;
}

/** Un inscrito de la lista pública (T134). `pago` es nulo en una categoría gratis. */
export interface InscritoPublico {
  nombre: string;
  pago: 'PAGADO' | 'PENDIENTE' | null;
}

export interface CuadroPublico {
  id: number;
  torneoId: number;
  nombre: string;
  categoria: string;
  estado: EstadoTorneo;
  /** En el orden en que se inscribieron (T134). */
  inscritos: InscritoPublico[];
  partidos: PartidoPublico[];
}

export interface TorneoNuevo {
  nombre: string;
  superficie: string | null;
  fechaInicio: string;
  fechaFin: string;
  cierreInscripcion: string;
}

/**
 * Los torneos del club.
 *
 * **El jugador se pide por su socio o por su nombre, nunca por los dos.** Con el socio,
 * el servidor reutiliza el jugador que ya tenga: el mismo socio en dos torneos es un
 * solo jugador, o el ranking sumaría sus puntos en dos filas distintas.
 */

/** Cuándo se sacó la foto respecto del torneo (T69). */
export type Momento = 'ANTES' | 'DURANTE' | 'DESPUES';

/**
 * Una foto del torneo, **con las dos direcciones ya armadas por el servidor**.
 *
 * Dónde está el archivo en el disco no viaja: la galería pide `miniatura` y solo al
 * abrir la foto pide `imagen`.
 */
export interface Foto {
  id: number;
  partidoId: number | null;
  momento: Momento;
  descripcion: string | null;
  miniatura: string;
  imagen: string;
}

@Service()
export class Torneos {
  private readonly http = inject(HttpClient);

  /** El calendario del año, sin cuenta. */
  calendario(anio?: number): Promise<TorneoPublico[]> {
    return firstValueFrom(
      this.http.get<TorneoPublico[]>('/api/torneos/publicos', {
        params: anio ? { anio } : {},
      }),
    );
  }

  /**
   * Inscribirse a un torneo **sin cuenta**.
   *
   * El servidor decide todo lo que importa —si la inscripción sigue abierta, si el
   * cuadro ya se armó, si queda cupo— y devuelve en qué quedó: dentro del cuadro o en
   * la lista de espera. La pantalla no lo adivina.
   *
   * **Con el comprobante adjunto viaja como multipart y en un solo envío.** El
   * servidor rechaza la inscripción que elige transferir y llega sin imagen, así que
   * mandarlos por separado dejaría a la persona a medio inscribir.
   */
  inscribirseEnTorneo(
    torneoId: number,
    datos: {
      nombre: string;
      apellido: string;
      telefono: string;
      procedencia: string;
      categoriaJuegoId: number;
      /** Vacío cuando la categoría es gratis: ahí no hay nada que elegir. */
      medioPago: '' | 'WEBPAY' | 'TRANSFERENCIA';
      restricciones: {
        diaSemana: number;
        horaDesde: string;
        horaHasta: string;
      }[];
    },
    comprobante?: File,
  ): Promise<{
    id: number;
    estado: EstadoInscripcionTorneo;
    estadoPago: 'EXENTA' | 'PENDIENTE' | 'PAGADA' | 'RECHAZADA';
    /** Su llave: con ella vuelve a pagar o a subir el comprobante. */
    token: string;
    montoClp: number;
    categoria: string;
    jugador: string;
  }> {
    return firstValueFrom(
      this.http.post<{
        id: number;
        estado: EstadoInscripcionTorneo;
        estadoPago: 'EXENTA' | 'PENDIENTE' | 'PAGADA' | 'RECHAZADA';
        token: string;
        montoClp: number;
        categoria: string;
        jugador: string;
      }>(
        `/api/torneos/${torneoId}/inscripcion`,
        comprobante ? conArchivo(datos, comprobante) : datos,
      ),
    );
  }

  /**
   * El cuadro público de **una categoría**, con los resultados que ya se cargaron.
   *
   * El id es el del cuadro, no el del torneo: un torneo corre varios y "el cuadro del
   * torneo" dejó de significar algo. Los ids salen del calendario.
   */
  cuadroPublico(cuadroId: number): Promise<CuadroPublico> {
    return firstValueFrom(
      this.http.get<CuadroPublico>(`/api/torneos/cuadros/${cuadroId}`),
    );
  }

  jugadores(soloActivos = false): Promise<Jugador[]> {
    return firstValueFrom(
      this.http.get<Jugador[]>('/api/admin/jugadores', {
        params: soloActivos ? { activos: '1' } : {},
      }),
    );
  }

  crearJugador(
    datos: { socioId: number } | { nombre: string; apellido: string; telefono?: string },
  ): Promise<Jugador> {
    return firstValueFrom(
      this.http.post<Jugador>('/api/admin/jugadores', datos),
    );
  }

  /** Editar, desactivar, o enlazar a una ficha de socio. */
  editarJugador(
    id: number,
    cambio: Partial<{
      nombre: string;
      apellido: string;
      telefono: string;
      socioId: number;
      activo: boolean;
    }>,
  ): Promise<Jugador> {
    return firstValueFrom(
      this.http.patch<Jugador>(`/api/admin/jugadores/${id}`, cambio),
    );
  }

  categorias(soloActivas = false): Promise<CategoriaTorneo[]> {
    return firstValueFrom(
      this.http.get<CategoriaTorneo[]>('/api/admin/categorias-torneo', {
        params: soloActivas ? { activas: '1' } : {},
      }),
    );
  }

  crearCategoria(datos: {
    nombre: string;
    puntosCampeon: number;
  }): Promise<CategoriaTorneo> {
    return firstValueFrom(
      this.http.post<CategoriaTorneo>('/api/admin/categorias-torneo', datos),
    );
  }

  editarCategoria(
    id: number,
    cambio: Partial<{ nombre: string; puntosCampeon: number; activa: boolean }>,
  ): Promise<CategoriaTorneo> {
    return firstValueFrom(
      this.http.patch<CategoriaTorneo>(
        `/api/admin/categorias-torneo/${id}`,
        cambio,
      ),
    );
  }

  /** Las categorías con que juega el club, para armarle cuadros a un torneo. */
  categoriasDeJuego(soloActivas = false): Promise<CategoriaJuego[]> {
    return firstValueFrom(
      this.http.get<CategoriaJuego[]>('/api/admin/categorias-juego', {
        params: soloActivas ? { activas: '1' } : {},
      }),
    );
  }

  /** Qué categorías corre este torneo. */
  cuadrosDelTorneo(torneoId: number): Promise<CuadroDelTorneo[]> {
    return firstValueFrom(
      this.http.get<CuadroDelTorneo[]>(
        `/api/admin/torneos/${torneoId}/categorias`,
      ),
    );
  }

  agregarCuadro(
    torneoId: number,
    datos: {
      categoriaJuegoId: number;
      categoriaId: number;
      cupo: number;
      montoInscripcionClp?: number;
    },
  ): Promise<CuadroDelTorneo> {
    return firstValueFrom(
      this.http.post<CuadroDelTorneo>(
        `/api/admin/torneos/${torneoId}/categorias`,
        datos,
      ),
    );
  }

  editarCuadro(
    torneoId: number,
    id: number,
    cambio: Partial<{
      cupo: number;
      montoInscripcionClp: number;
      categoriaId: number;
    }>,
  ): Promise<CuadroDelTorneo> {
    return firstValueFrom(
      this.http.patch<CuadroDelTorneo>(
        `/api/admin/torneos/${torneoId}/categorias/${id}`,
        cambio,
      ),
    );
  }

  /** Solo si no hay nadie inscrito: el servidor responde 409 si lo hay. */
  quitarCuadro(torneoId: number, id: number): Promise<{ id: number }> {
    return firstValueFrom(
      this.http.delete<{ id: number }>(
        `/api/admin/torneos/${torneoId}/categorias/${id}`,
      ),
    );
  }

  /** Quién juega **este cuadro**: dentro, esperando y retirados. */
  inscripciones(cuadroId: number): Promise<ListaDelCuadro> {
    return firstValueFrom(
      this.http.get<ListaDelCuadro>(
        `/api/admin/cuadros/${cuadroId}/inscripciones`,
      ),
    );
  }

  /** Pasado el cupo el servidor deja al jugador en espera, no lo rechaza. */
  inscribir(
    cuadroId: number,
    quien: { jugadorId: number } | { socioId: number },
  ): Promise<{ id: number; estado: EstadoInscripcionTorneo }> {
    return firstValueFrom(
      this.http.post<{ id: number; estado: EstadoInscripcionTorneo }>(
        `/api/admin/cuadros/${cuadroId}/inscripciones`,
        quien,
      ),
    );
  }

  retirar(cuadroId: number, id: number): Promise<{ id: number }> {
    return firstValueFrom(
      this.http.post<{ id: number }>(
        `/api/admin/cuadros/${cuadroId}/inscripciones/${id}/retiro`,
        {},
      ),
    );
  }

  /** Manual a propósito: el club llama antes de meter a alguien en el cuadro. */
  promover(cuadroId: number, id: number): Promise<{ id: number }> {
    return firstValueFrom(
      this.http.post<{ id: number }>(
        `/api/admin/cuadros/${cuadroId}/inscripciones/${id}/promocion`,
        {},
      ),
    );
  }

  /** La siembra la pone el admin, no el ranking. `null` la quita. */
  sembrar(
    cuadroId: number,
    id: number,
    siembra: number | null,
  ): Promise<{ id: number }> {
    return firstValueFrom(
      this.http.patch<{ id: number }>(
        `/api/admin/cuadros/${cuadroId}/inscripciones/${id}/siembra`,
        { siembra },
      ),
    );
  }

  cuadro(cuadroId: number): Promise<Cuadro> {
    return firstValueFrom(
      this.http.get<Cuadro>(`/api/admin/cuadros/${cuadroId}`),
    );
  }

  /** Armar cierra la inscripción y sortea a los no sembrados. */
  armarCuadro(cuadroId: number): Promise<Cuadro> {
    return firstValueFrom(
      this.http.post<Cuadro>(`/api/admin/cuadros/${cuadroId}/armar`, {}),
    );
  }

  /** Solo mientras no haya resultados: con partidos jugados el servidor se niega. */
  deshacerCuadro(cuadroId: number): Promise<{ torneoCategoriaId: number }> {
    return firstValueFrom(
      this.http.post<{ torneoCategoriaId: number }>(
        `/api/admin/cuadros/${cuadroId}/deshacer`,
        {},
      ),
    );
  }

  /** Cuántos partidos se deshacen si se corrige este resultado. No escribe nada. */
  consecuencias(
    torneoId: number,
    partidoId: number,
  ): Promise<{ deshace: number }> {
    return firstValueFrom(
      this.http.get<{ deshace: number }>(
        `/api/admin/torneos/${torneoId}/partidos/${partidoId}/consecuencias`,
      ),
    );
  }

  /** Cargar el resultado avanza al ganador al partido y al lado que le tocan. */
  cargarResultado(
    torneoId: number,
    partidoId: number,
    resultado: { ganadorId: number; marcador?: string; walkover?: boolean },
  ): Promise<{ id: number; deshechos: number }> {
    return firstValueFrom(
      this.http.post<{ id: number; deshechos: number }>(
        `/api/admin/torneos/${torneoId}/partidos/${partidoId}/resultado`,
        resultado,
      ),
    );
  }

  // ── El pago de la inscripción (T66) ───────────────────────────────────────

  /**
   * Empieza el pago con Webpay y devuelve a dónde mandar a la persona.
   *
   * Se pide con **la llave de la inscripción**, no con su número: los ids son
   * correlativos y con ellos cualquiera abriría una transacción a nombre de otro.
   */
  /**
   * Empieza el cobro y devuelve **a dónde ir y con qué llave**.
   *
   * El `tokenPasarela` no es un detalle: Webpay abre su formulario solo si esa URL se
   * visita por `POST` llevándolo. Ver `core/pagos/ir-a-pagar.ts`.
   */
  pagarInscripcion(
    token: string,
  ): Promise<{
    montoClp: number;
    urlRedireccion: string;
    tokenPasarela: string;
  }> {
    return firstValueFrom(
      this.http.post<{
        montoClp: number;
        urlRedireccion: string;
        tokenPasarela: string;
      }>(`/api/torneos/inscripciones/${token}/pago`, {}),
    );
  }

  /**
   * Suelta el cupo de una inscripción propia que se quedó sin pagar.
   *
   * La llama la pantalla cuando esta pestaña vuelve de la pasarela **sin haber
   * pagado** —apretando "atrás", que no avisa a nadie más—. Responde `soltada: false`
   * si no había nada que soltar: la persona pagó, o el servidor ya la soltó al volver.
   */
  soltarInscripcion(token: string): Promise<{ soltada: boolean }> {
    return firstValueFrom(
      this.http.post<{ soltada: boolean }>(
        `/api/torneos/inscripciones/${token}/soltar`,
        {},
      ),
    );
  }

  /** Sube el comprobante de la transferencia. Uno por inscripción. */
  subirComprobante(token: string, imagen: File): Promise<{ id: number }> {
    const cuerpo = new FormData();
    cuerpo.append('comprobante', imagen);

    return firstValueFrom(
      this.http.post<{ id: number }>(
        `/api/torneos/inscripciones/${token}/comprobante`,
        cuerpo,
      ),
    );
  }

  /**
   * Da el pago por bueno, con **cómo se pagó** si el club lo dice.
   *
   * El medio es opcional: aprobar el comprobante de una transferencia que la persona
   * ya declaró no tiene por qué repetirlo, y mandar uno por omisión sobreescribiría el
   * dato con algo que nadie eligió.
   */
  aprobarPago(id: number, medioPago?: string): Promise<{ id: number }> {
    return firstValueFrom(
      this.http.post<{ id: number }>(
        `/api/admin/inscripciones/${id}/aprobar`,
        medioPago ? { medioPago } : {},
      ),
    );
  }

  /** El comprobante que el club adjunta por el jugador. Uno por inscripción. */
  subirComprobanteDelClub(id: number, imagen: File): Promise<{ id: number }> {
    const cuerpo = new FormData();
    cuerpo.append('comprobante', imagen);

    return firstValueFrom(
      this.http.post<{ id: number }>(
        `/api/admin/inscripciones/${id}/comprobante`,
        cuerpo,
      ),
    );
  }

  /** Rechazar **libera el cupo**: la inscripción sale del cuadro. */
  rechazarPago(id: number, motivo: string): Promise<{ id: number }> {
    return firstValueFrom(
      this.http.post<{ id: number }>(
        `/api/admin/inscripciones/${id}/rechazar`,
        { motivo },
      ),
    );
  }

  // ── La programación de partidos (T67) ─────────────────────────────────────

  programarPartido(
    torneoId: number,
    partidoId: number,
    datos: {
      canchaId: number;
      fecha: string;
      horaDesde: string;
      horaHasta: string;
    },
  ): Promise<{ id: number }> {
    return firstValueFrom(
      this.http.post<{ id: number }>(
        `/api/admin/torneos/${torneoId}/partidos/${partidoId}/programacion`,
        datos,
      ),
    );
  }

  /** Le quita la hora y **libera la cancha**. */
  desprogramarPartido(
    torneoId: number,
    partidoId: number,
  ): Promise<{ id: number }> {
    return firstValueFrom(
      this.http.delete<{ id: number }>(
        `/api/admin/torneos/${torneoId}/partidos/${partidoId}/programacion`,
      ),
    );
  }

  // ── Las transmisiones (T68) ───────────────────────────────────────────────

  transmisiones(torneoId: number): Promise<Transmision[]> {
    return firstValueFrom(
      this.http.get<Transmision[]>(`/api/admin/torneos/${torneoId}/transmisiones`),
    );
  }

  /** Las mismas, sin cuenta: es lo que mira quien no es del club. */
  transmisionesPublicas(torneoId: number): Promise<Transmision[]> {
    return firstValueFrom(
      this.http.get<Transmision[]>(`/api/torneos/${torneoId}/transmisiones`),
    );
  }

  /**
   * La que cubre a este partido, o nada.
   *
   * **Se transmite una cancha, no un partido**: la respuesta es el live de esa cancha
   * en esa jornada, y puede estar mostrando el partido anterior si se alargó.
   */
  transmisionDelPartido(partidoId: number): Promise<Transmision | null> {
    return firstValueFrom(
      this.http.get<{ transmision: Transmision | null }>(
        `/api/torneos/partidos/${partidoId}/transmision`,
      ),
    ).then((r) => r.transmision);
  }

  anunciarTransmision(
    torneoId: number,
    datos: {
      canchaId: number;
      enlace: string;
      fecha: string;
      horaDesde: string;
      horaHasta: string;
      titulo?: string;
    },
  ): Promise<Transmision> {
    return firstValueFrom(
      this.http.post<Transmision>(
        `/api/admin/torneos/${torneoId}/transmisiones`,
        datos,
      ),
    );
  }

  quitarTransmision(torneoId: number, id: number): Promise<{ id: number }> {
    return firstValueFrom(
      this.http.delete<{ id: number }>(
        `/api/admin/torneos/${torneoId}/transmisiones/${id}`,
      ),
    );
  }

  // ── Las fotos del torneo (T69) ──────────────────────────────────────────────

  fotos(torneoId: number): Promise<Foto[]> {
    return firstValueFrom(
      this.http.get<Foto[]>(`/api/torneos/${torneoId}/fotos`),
    );
  }

  /**
   * Sube una foto. **Va como `FormData` y no como JSON**: es un archivo, y meterlo en
   * un JSON obligaría a codificarlo en base64, un tercio más de bytes por nada.
   *
   * Sin `Content-Type` a mano: el navegador tiene que ponerlo él para agregar el
   * `boundary`, y escribirlo rompe la subida sin decir por qué.
   */
  subirFoto(
    torneoId: number,
    archivo: File,
    datos: { momento: Momento; partidoId?: number; descripcion?: string },
  ): Promise<Foto> {
    const cuerpo = new FormData();

    cuerpo.append('momento', datos.momento);
    if (datos.partidoId) cuerpo.append('partidoId', String(datos.partidoId));
    if (datos.descripcion) cuerpo.append('descripcion', datos.descripcion);
    cuerpo.append('foto', archivo);

    return firstValueFrom(
      this.http.post<Foto>(`/api/admin/torneos/${torneoId}/fotos`, cuerpo),
    );
  }

  quitarFoto(torneoId: number, id: number): Promise<{ id: number }> {
    return firstValueFrom(
      this.http.delete<{ id: number }>(
        `/api/admin/torneos/${torneoId}/fotos/${id}`,
      ),
    );
  }

  torneos(): Promise<Torneo[]> {
    return firstValueFrom(this.http.get<Torneo[]>('/api/admin/torneos'));
  }

  crearTorneo(datos: TorneoNuevo): Promise<Torneo> {
    return firstValueFrom(this.http.post<Torneo>('/api/admin/torneos', datos));
  }

  /**
   * Cancela un torneo, o deshace la cancelación.
   *
   * Endpoint propio y no un `editarTorneo({ estado })`: cancelar esconde el torneo del
   * calendario público y cierra sus inscripciones, así que no viaja por la misma
   * puerta que cambiarle el nombre.
   */
  cancelarTorneo(id: number): Promise<{ id: number; estado: EstadoTorneo }> {
    return firstValueFrom(
      this.http.post<{ id: number; estado: EstadoTorneo }>(
        `/api/admin/torneos/${id}/cancelacion`,
        {},
      ),
    );
  }

  reactivarTorneo(id: number): Promise<{ id: number; estado: EstadoTorneo }> {
    return firstValueFrom(
      this.http.delete<{ id: number; estado: EstadoTorneo }>(
        `/api/admin/torneos/${id}/cancelacion`,
      ),
    );
  }

  editarTorneo(id: number, cambio: Partial<TorneoNuevo>): Promise<Torneo> {
    return firstValueFrom(
      this.http.patch<Torneo>(`/api/admin/torneos/${id}`, cambio),
    );
  }
}

/**
 * El formulario de inscripción con su comprobante, como `FormData`.
 *
 * **En multipart todo campo es texto**, así que las franjas horarias viajan como JSON
 * y el servidor las lee de vuelta. Es la costura que permite un solo envío en vez de
 * inscribir primero y adjuntar después, que era el paso que se podía saltar.
 */
function conArchivo(
  datos: Record<string, unknown>,
  comprobante: File,
): FormData {
  const cuerpo = new FormData();

  for (const [campo, valor] of Object.entries(datos)) {
    cuerpo.append(
      campo,
      typeof valor === 'object' ? JSON.stringify(valor) : String(valor),
    );
  }

  cuerpo.append('comprobante', comprobante);

  return cuerpo;
}
