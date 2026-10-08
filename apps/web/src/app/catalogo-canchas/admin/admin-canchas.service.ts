import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Cancha } from '../disponibilidad';

export interface Horario {
  id: number;
  diaSemana: number;
  horaApertura: string;
  horaCierre: string;
}

export interface Franja {
  id: number;
  canchaId: number | null;
  /** En la general: nulo = toda cancha, true = solo techadas, false = solo abiertas (T98). */
  techada: boolean | null;
  diaSemana: number | null;
  horaDesde: string;
  horaHasta: string;
  esPico: boolean;
  /** El precio de 1 hora. */
  montoClp: number;
  /** El de 1 hora y media. Nulo: esa duración no se le vende a quien no es socio (T79). */
  montoClp90: number | null;
}

/**
 * Dónde rige un horario o una tarifa: una cancha, o el club entero.
 *
 * `id: null` es el club —las filas con `cancha_id` nulo—, y existe para que los
 * editores de horario y tarifas sirvan para los dos casos. Sin esto habría dos
 * copias de cada editor y la del club envejecería primero.
 */
export interface AmbitoDeReglas {
  id: number | null;
  nombre: string;
  horarios: Horario[];
  franjas: Franja[];
}

/** El horario y las tarifas generales del club. */
export interface ReglasGenerales {
  horarios: Horario[];
  franjas: Franja[];
}

/** La cancha como la ve el panel: con lo suyo colgando, y también si está activa. */
export interface CanchaAdmin extends Cancha, AmbitoDeReglas {
  id: number;
  activa: boolean;
  orden: number;
  /**
   * Solo desde una cancha con cámara se transmite un partido (T68).
   *
   * Vive acá y no en `Cancha`: la grilla pública no dibuja nada con esto, y el
   * endpoint abierto no tiene por qué contar dónde hay cámaras instaladas.
   */
  tieneCamara: boolean;
}

export type MotivoBloqueo = 'MANTENCION' | 'TORNEO' | 'CLASE' | 'OTRO';

export interface Bloqueo {
  id: number;
  canchaId: number;
  /** Instantes en UTC, como los devuelve la API. */
  inicio: string;
  fin: string;
  motivo: MotivoBloqueo;
  descripcion: string | null;
}

/**
 * El rango va en hora del club y no en instantes: la conversión la hace el
 * servidor, que es donde está probada contra los dos domingos que Chile cambia
 * la hora.
 */
export interface BloqueoNuevo {
  canchaId: number;
  fechaDesde: string;
  horaDesde: string;
  fechaHasta: string;
  horaHasta: string;
  motivo: MotivoBloqueo;
  descripcion: string | null;
}

/** Espejo de `ReservaAfectada` en la API: una hora que el cierre se lleva. */
export interface HoraAfectada {
  id: number;
  folio: string;
  inicio: string;
  fin: string;
  nombre: string;
  email: string;
  esSocio: boolean;
  pagada: boolean;
  /** Se está pagando en la pasarela ahora mismo: el servidor no deja cerrar sobre ella. */
  pagoEnCurso: boolean;
}

export interface ResultadoCierre {
  bloqueoId: number;
  canceladas: HoraAfectada[];
}

export interface Advertencia {
  canchaId: number;
  nombre: string;
  sinTarifa: string[];
}

/**
 * Las reglas del club, la fila única de `ConfiguracionClub`.
 *
 * Espejo de `CambiosDeConfiguracion` en la API. El servidor devuelve además `id` y
 * `actualizadoEn`, que al panel no le sirven para nada.
 */
export interface ReglasDelClub {
  cupoDiarioSocioReservas: number;
  cupoPicoSemanalReservas: number;
  invitadosPorMes: number;
  horasMinModificacion: number;
  horasReembolsoTotal: number;
  diasSancionNoUso: number;
}

/**
 * Los datos de contacto, que viven en la misma fila que las reglas.
 *
 * Tipo aparte y no siete números junto a cuatro textos: el editor de reglas trata
 * sus campos como numéricos —hasta el `''` de un campo recién borrado—, y meter
 * textos en ese `Record` obligaba a castear en cada uno.
 */
export interface DatosDelClub {
  nombre: string;
  direccion: string;
  telefono: string;
  email: string;
  /** Dónde está el club, para el mapa (T100). Nulas mientras no se cargue. */
  latitud: number | null;
  longitud: number | null;
}

/**
 * Lo que manda el formulario de datos del club. La ubicación va como el texto que el
 * admin pegó —enlace de Google Maps o coordenadas— y la convierte el servidor (T100).
 */
export type DatosDelClubAGuardar = Omit<DatosDelClub, 'latitud' | 'longitud'> & {
  ubicacion: string;
};

/** Lo que el servidor devuelve de `GET /api/admin/configuracion`: las dos cosas. */
export type ConfiguracionDelClub = ReglasDelClub & DatosDelClub;

export interface CanchaNueva {
  nombre: string;
  superficie: Cancha['superficie'];
  techada: boolean;
  /** Solo desde una cancha con cámara se transmite un partido (T68). */
  tieneCamara: boolean;
  iluminacion: boolean;
}

@Service()
export class AdminCanchas {
  private readonly http = inject(HttpClient);

  canchas(): Promise<CanchaAdmin[]> {
    return firstValueFrom(this.http.get<CanchaAdmin[]>('/api/admin/canchas'));
  }

  configuracion(): Promise<ConfiguracionDelClub> {
    return firstValueFrom(
      this.http.get<ConfiguracionDelClub>('/api/admin/configuracion'),
    );
  }

  fijarConfiguracion(
    cambios: Partial<ConfiguracionDelClub>,
  ): Promise<ConfiguracionDelClub> {
    return firstValueFrom(
      this.http.patch<ConfiguracionDelClub>('/api/admin/configuracion', cambios),
    );
  }

  /**
   * Los datos de contacto y la ubicación, que van a la misma fila que las reglas.
   *
   * Método aparte y no un `fijarConfiguracion` con todo mezclado: son dos
   * pantallas distintas y quien lea una llamada quiere saber cuál está guardando.
   */
  fijarDatosDelClub(datos: DatosDelClubAGuardar): Promise<ConfiguracionDelClub> {
    return firstValueFrom(
      this.http.patch<ConfiguracionDelClub>('/api/admin/configuracion', datos),
    );
  }

  advertencias(fecha: string): Promise<Advertencia[]> {
    return firstValueFrom(
      this.http.get<Advertencia[]>('/api/admin/advertencias', {
        params: { fecha },
      }),
    );
  }

  crear(cancha: CanchaNueva): Promise<CanchaAdmin> {
    return firstValueFrom(
      this.http.post<CanchaAdmin>('/api/admin/canchas', cancha),
    );
  }

  /** Solo lo que cambia: lo que no viaja, no se toca. */
  editar(id: number, cambios: Partial<CanchaAdmin>): Promise<CanchaAdmin> {
    return firstValueFrom(
      this.http.patch<CanchaAdmin>(`/api/admin/canchas/${id}`, cambios),
    );
  }

  /**
   * Borra la cancha. El servidor responde 409 si tiene historial: la regla vive
   * allá, así que el panel no la repite y solo muestra lo que le contestan.
   */
  eliminar(id: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/admin/canchas/${id}`));
  }

  /** El horario y las tarifas que rigen donde la cancha no dice otra cosa. */
  general(): Promise<ReglasGenerales> {
    return firstValueFrom(this.http.get<ReglasGenerales>('/api/admin/general'));
  }

  /** `canchaId` nulo fija el horario general del club. */
  fijarHorarios(
    canchaId: number | null,
    horarios: Omit<Horario, 'id'>[],
  ): Promise<Horario[]> {
    return firstValueFrom(
      this.http.put<Horario[]>(
        canchaId === null
          ? '/api/admin/general/horarios'
          : `/api/admin/canchas/${canchaId}/horarios`,
        horarios,
      ),
    );
  }

  crearFranja(franja: {
    canchaId: number | null;
    techada: boolean | null;
    diaSemana: number | null;
    horaDesde: string;
    horaHasta: string;
    esPico: boolean;
    montoClp: number;
    montoClp90: number | null;
    vigenteDesde: string;
  }): Promise<Franja> {
    return firstValueFrom(this.http.post<Franja>('/api/admin/franjas', franja));
  }

  borrarFranja(id: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/admin/franjas/${id}`));
  }

  bloqueos(canchaId: number): Promise<Bloqueo[]> {
    return firstValueFrom(
      this.http.get<Bloqueo[]>('/api/admin/bloqueos', {
        params: { cancha: canchaId },
      }),
    );
  }

  /**
   * A quién dejaría sin su hora este cierre, sin escribir nada.
   *
   * Va antes de `cerrar` siempre: cancelar la hora de un socio no tiene deshacer, y
   * el admin tiene que poder ver la lista antes de apretar.
   */
  simularCierre(bloqueo: BloqueoNuevo): Promise<{ afectadas: HoraAfectada[] }> {
    return firstValueFrom(
      this.http.post<{ afectadas: HoraAfectada[] }>(
        '/api/admin/cierres/simulacion',
        bloqueo,
      ),
    );
  }

  /**
   * Cierra la cancha con lo que haya debajo: cancela, devuelve y avisa.
   *
   * Ruta distinta de `crearBloqueo` porque son dos operaciones distintas, y la
   * diferencia importa: aquella crea un bloqueo y nada más.
   */
  cerrar(bloqueo: BloqueoNuevo): Promise<ResultadoCierre> {
    return firstValueFrom(
      this.http.post<ResultadoCierre>('/api/admin/cierres', bloqueo),
    );
  }

  crearBloqueo(bloqueo: BloqueoNuevo): Promise<Bloqueo> {
    return firstValueFrom(
      this.http.post<Bloqueo>('/api/admin/bloqueos', bloqueo),
    );
  }

  borrarBloqueo(id: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/admin/bloqueos/${id}`));
  }
}
