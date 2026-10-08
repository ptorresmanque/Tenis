import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { HoraAfectada } from '../catalogo-canchas/admin/admin-canchas.service';

export type NivelClase =
  | 'INICIACION'
  | 'INTERMEDIO'
  | 'COMPETITIVO'
  | 'NINOS';

/** Cómo se lee cada nivel en pantalla. */
export const NIVELES: Record<NivelClase, string> = {
  INICIACION: 'Iniciación',
  INTERMEDIO: 'Intermedio',
  COMPETITIVO: 'Competitivo',
  NINOS: 'Niños',
};

/** Espejo de una fila de `GET /api/admin/clases`. */
export interface ClaseDelDia {
  id: number;
  cancha: string;
  profesor: string;
  inicio: string;
  fin: string;
  nivel: NivelClase;
  estado: 'PROGRAMADA' | 'REALIZADA' | 'CANCELADA';
  cupoMaximo: number;
  notas: string | null;
}

/** Lo que el formulario manda para agendar. Horas del club, como las escribe el admin. */
export interface ClaseNueva {
  canchaId: number;
  profesorId: number;
  fecha: string;
  horaDesde: string;
  horaHasta: string;
  cupoMaximo: number;
  nivel: NivelClase;
  notas?: string;
}

export type EstadoInscripcion = 'INSCRITA' | 'CANCELADA' | 'ASISTIO' | 'FALTO';

/** Quién viene a la clase, como lo lee el club. */
export interface Inscrito {
  id: number;
  /** El socio, para sacarlo de la serie (T116); nulo si es un alumno de afuera. */
  socioId: number | null;
  nombre: string;
  telefono: string;
  esSocio: boolean;
  numeroSocio: string | null;
  estado: EstadoInscripcion;
  inscritaEn: string;
}

/** La clase con su lista: lo que el profesor lleva a la cancha. */
export interface FichaDeClase {
  id: number;
  cancha: string;
  profesor: string;
  inicio: string;
  fin: string;
  nivel: NivelClase;
  estado: 'PROGRAMADA' | 'REALIZADA' | 'CANCELADA';
  cupoMaximo: number;
  cupoTomado: number;
  notas: string | null;
  /** La serie que la agendó (T113), o nulo si es una clase suelta. */
  serieId: number | null;
  inscritos: Inscrito[];
}

/** Un socio del club o un alumno de afuera, nunca los dos. */
export type QuienSeInscribe =
  | { socioId: number }
  | { nombre: string; telefono: string };

/** Un profesor, como lo anuncia el club. Sin tarifa ni teléfono: eso es interno. */
export interface ProfesorPublico {
  nombreVisible: string;
  especialidad: string;
}

/** Una clase de la semana, como la ve quien todavía no es del club. */
export interface ClasePublica {
  id: number;
  cancha: string;
  profesor: string;
  inicio: string;
  fin: string;
  nivel: NivelClase;
  cuposLibres: number;
}

export interface ResultadoAgendar {
  id: number;
  bloqueoId: number;
  canceladas: HoraAfectada[];
}

/**
 * Una serie de clases, como la escribe el admin (T113): la ficha de una clase, los días
 * de la semana —0 es domingo— y el rango de fechas. Dura como máximo 6 meses.
 */
export interface SerieNueva {
  canchaId: number;
  profesorId: number;
  diasSemana: number[];
  horaDesde: string;
  horaHasta: string;
  desde: string;
  hasta: string;
  cupoMaximo: number;
  nivel: NivelClase;
  notas?: string;
}

/** Una fecha que la serie generaría, con lo que tiene encima (T113). */
export interface FechaDeLaSerie {
  fecha: string;
  inicio: string;
  fin: string;
  /** La cancha cerrada a esa hora, o fuera del horario. Esa fecha solo se puede saltar. */
  choque: string | null;
  /** Las reservas que la clase cancelaría. */
  afectadas: HoraAfectada[];
}

/** Qué hacer con una fecha que tiene algo encima, o con una libre que se quiere saltar. */
export type DecisionDeFecha = 'cancelar' | 'saltar';

/** Lo que deja una serie agendada (T114). */
export interface SerieAgendada {
  id: number;
  clases: { id: number; fecha: string }[];
  saltadas: string[];
  canceladas: HoraAfectada[];
}

/**
 * Las clases del club.
 *
 * **Agendar cierra la cancha**, y por eso tiene simulación: antes de confirmar, el
 * admin ve a quién le va a quitar la hora. Es el mismo flujo de dos pasos que el
 * cierre por mantención, porque es la misma operación con otro nombre.
 */
@Service()
export class Clases {
  private readonly http = inject(HttpClient);

  /**
   * Lo que se ve de las clases sin cuenta.
   *
   * Va en este mismo servicio y no en uno público aparte: es el mismo módulo y la
   * misma pregunta, y lo que se publica lo decide el servidor, que arma sus propias
   * formas. Un servicio de más acá no impediría nada allá.
   */
  publicas(desde?: string): Promise<{
    profesores: ProfesorPublico[];
    clases: ClasePublica[];
  }> {
    return firstValueFrom(
      this.http.get<{ profesores: ProfesorPublico[]; clases: ClasePublica[] }>(
        '/api/clases/publicas',
        { params: desde ? { desde } : {} },
      ),
    );
  }

  delDia(fecha: string): Promise<ClaseDelDia[]> {
    return firstValueFrom(
      this.http.get<ClaseDelDia[]>('/api/admin/clases', { params: { fecha } }),
    );
  }

  /** A quién le quitaría la hora. No escribe nada. */
  simular(clase: ClaseNueva): Promise<{ afectadas: HoraAfectada[] }> {
    return firstValueFrom(
      this.http.post<{ afectadas: HoraAfectada[] }>(
        '/api/admin/clases/simulacion',
        clase,
      ),
    );
  }

  agendar(clase: ClaseNueva): Promise<ResultadoAgendar> {
    return firstValueFrom(
      this.http.post<ResultadoAgendar>('/api/admin/clases', clase),
    );
  }

  /** Lo que la serie generaría, fecha por fecha. No escribe nada (T113). */
  simularSerie(serie: SerieNueva): Promise<{ fechas: FechaDeLaSerie[] }> {
    return firstValueFrom(
      this.http.post<{ fechas: FechaDeLaSerie[] }>(
        '/api/admin/clases/series/simulacion',
        serie,
      ),
    );
  }

  /**
   * Agenda la serie con la decisión de cada fecha que la necesita (T114). El servidor
   * vuelve a simular: si apareció una reserva en una fecha sin decisión, la rechaza entera.
   */
  agendarSerie(
    serie: SerieNueva,
    decisiones: Record<string, DecisionDeFecha>,
  ): Promise<SerieAgendada> {
    return firstValueFrom(
      this.http.post<SerieAgendada>('/api/admin/clases/series', {
        ...serie,
        decisiones,
      }),
    );
  }

  /** Mover conserva el id de la clase y, cuando existan, sus inscritos. */
  mover(
    id: number,
    adonde: { fecha: string; horaDesde: string; horaHasta: string; canchaId?: number },
  ): Promise<ResultadoAgendar> {
    return firstValueFrom(
      this.http.patch<ResultadoAgendar>(`/api/admin/clases/${id}`, adonde),
    );
  }

  /** La ficha con su lista de inscritos. */
  ficha(id: number): Promise<FichaDeClase> {
    return firstValueFrom(this.http.get<FichaDeClase>(`/api/admin/clases/${id}`));
  }

  /** El cupo lo decide el servidor: la pantalla solo lo anticipa. */
  inscribir(claseId: number, quien: QuienSeInscribe): Promise<{ id: number }> {
    return firstValueFrom(
      this.http.post<{ id: number }>(
        `/api/admin/clases/${claseId}/inscripciones`,
        quien,
      ),
    );
  }

  /**
   * Inscribe en cada clase que viene de la serie (T116). Si una está llena, el servidor no
   * inscribe en ninguna y dice cuál.
   */
  inscribirEnLaSerie(
    serieId: number,
    quien: QuienSeInscribe,
  ): Promise<{ inscritas: number; yaEstaba: number }> {
    return firstValueFrom(
      this.http.post<{ inscritas: number; yaEstaba: number }>(
        `/api/admin/clases/series/${serieId}/inscripciones`,
        quien,
      ),
    );
  }

  /** Lo saca de la serie: cancela las clases que vienen, no las que ya pasaron (T116). */
  salirDeLaSerie(serieId: number, quien: QuienSeInscribe): Promise<{ canceladas: number }> {
    return firstValueFrom(
      this.http.post<{ canceladas: number }>(
        `/api/admin/clases/series/${serieId}/inscripciones/cancelacion`,
        quien,
      ),
    );
  }

  /** Baja a alguien de la clase. La fila queda marcada; libera el cupo, no la historia. */
  bajar(claseId: number, id: number): Promise<{ id: number }> {
    return firstValueFrom(
      this.http.post<{ id: number }>(
        `/api/admin/clases/${claseId}/inscripciones/${id}/cancelacion`,
        {},
      ),
    );
  }

  /**
   * Cierra la clase.
   *
   * `asistieron` en `null` es cerrarla **sin pasar lista**: nadie cambia de estado.
   * Una lista vacía es decir que no vino nadie. La diferencia es deliberada.
   */
  realizar(id: number, asistieron: number[] | null): Promise<{ id: number }> {
    return firstValueFrom(
      this.http.post<{ id: number }>(
        `/api/admin/clases/${id}/realizacion`,
        asistieron === null ? {} : { asistieron },
      ),
    );
  }

  /** El motivo es obligatorio: los inscritos van a preguntar por qué no hubo clase. */
  cancelar(id: number, motivo: string): Promise<{ id: number }> {
    return firstValueFrom(
      this.http.post<{ id: number }>(`/api/admin/clases/${id}/cancelacion`, {
        motivo,
      }),
    );
  }
}
