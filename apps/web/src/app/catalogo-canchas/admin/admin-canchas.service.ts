import { HttpClient } from '@angular/common/http';
import { inject, Injectable, resource, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { FotoDelLugar, TarifaDelGimnasio } from '../../club/club.service';
import { Cancha } from '../disponibilidad';
import { hoyEnElClub } from '../reloj-del-club';

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
  /** Lo que vale ser socio, en pesos. Las cuotas ya emitidas congelaron el suyo. */
  cuotaMensualClp: number;
  cuotaIncorporacionClp: number;
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
  /** Las redes (T140): el enlace ya validado, o vacío si el club no la tiene. */
  instagram: string;
  facebook: string;
  tiktok: string;
  youtube: string;
  /** El número, en la forma del teléfono. */
  whatsapp: string;
}

/**
 * Lo que manda el formulario de datos del club. La ubicación va como el texto que el
 * admin pegó —enlace de Google Maps o coordenadas— y la convierte el servidor (T100).
 */
export type DatosDelClubAGuardar = Omit<DatosDelClub, 'latitud' | 'longitud'> & {
  ubicacion: string;
};

/**
 * Los textos de la página "El club" (T142). Viven en la misma fila, pero los edita otra
 * sección: escribir el titular no es cargar datos de contacto.
 */
export interface TextosDeElClub {
  elClubTitulo: string;
  elClubBajada: string;
  elClubCanchas: string;
}

/** Los lugares del club, con sus textos y sus fotos (T185, T235). */
export type Lugar = 'TIENDA' | 'CAFETERIA' | 'GIMNASIO';

/** Los textos de cada lugar (T184, T235), como los guarda la fila: tres columnas cada uno. */
export interface LugaresDelClub {
  tiendaDescripcion: string;
  tiendaHorario: string;
  tiendaWhatsapp: string;
  cafeteriaDescripcion: string;
  cafeteriaHorario: string;
  cafeteriaWhatsapp: string;
  gimnasioDescripcion: string;
  gimnasioHorario: string;
  gimnasioWhatsapp: string;
}


/**
 * El tope de canchas con luz (T208): cuántas pueden estar ocupadas a la vez desde una hora,
 * porque la instalación eléctrica del club no aguanta más. Nulo es sin tope.
 */
export interface TopeDeLuz {
  topeCanchasConLuz: number | null;
  /** Reloj del club, "HH:MM", en punto o y media. */
  topeCanchasConLuzDesde: string;
}

/** Un intervalo ya tomado con más canchas con luz que el tope, y qué las ocupa. */
export interface ExcesoDeLuz {
  desde: string;
  hasta: string;
  ocupaciones: { cancha: string; detalle: string }[];
}

/** Qué duraciones toma el socio en horario prime (T213). En el código, pico. */
export type DuracionesSocioPico = 'UNA_HORA' | 'HORA_Y_MEDIA' | 'AMBAS';

/** Lo que el servidor devuelve de `GET /api/admin/configuracion`: todo lo de la fila. */
export type ConfiguracionDelClub = ReglasDelClub &
  DatosDelClub &
  TextosDeElClub &
  LugaresDelClub &
  TopeDeLuz & {
    duracionesSocioPico: DuracionesSocioPico;
    /** Cuántos alumnos caben en una clase grupal del gimnasio (T235). */
    gimnasioCupoGrupal: number;
    /** Si sale el informe de reservas por correo, y a qué hora entera del club (T274). */
    informeDiarioActivo: boolean;
    informeDiarioHora: number;
  };

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

  /** Las horas ya tomadas que superan el tope de canchas con luz (T208). */
  excesosDeLuz(): Promise<ExcesoDeLuz[]> {
    return firstValueFrom(
      this.http.get<ExcesoDeLuz[]>('/api/admin/tope-de-luz/excesos'),
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

  /** Los textos de "El club" (T142), con el mismo PATCH que los datos del club. */
  fijarTextosDeElClub(textos: TextosDeElClub): Promise<ConfiguracionDelClub> {
    return firstValueFrom(
      this.http.patch<ConfiguracionDelClub>('/api/admin/configuracion', textos),
    );
  }

  /** Las fotos de la tienda y la cafetería (T185), cada lugar en el orden en que se subieron. */
  fotosDelClub(): Promise<Record<Lugar, FotoDelLugar[]>> {
    return firstValueFrom(
      this.http.get<Record<Lugar, FotoDelLugar[]>>('/api/admin/club/fotos'),
    );
  }

  subirFotoDelClub(lugar: Lugar, archivo: File, descripcion: string): Promise<FotoDelLugar> {
    const cuerpo = new FormData();

    // Los campos antes del archivo: es el orden en que un formulario los manda.
    cuerpo.append('lugar', lugar);
    if (descripcion) cuerpo.append('descripcion', descripcion);
    cuerpo.append('foto', archivo);

    return firstValueFrom(this.http.post<FotoDelLugar>('/api/admin/club/fotos', cuerpo));
  }

  quitarFotoDelClub(id: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/admin/club/fotos/${id}`));
  }

  /** Los textos de un lugar (T184, T236), con el mismo PATCH que los datos del club. */
  fijarLugar(
    datos: Partial<LugaresDelClub> & { gimnasioCupoGrupal?: number | null },
  ): Promise<ConfiguracionDelClub> {
    return firstValueFrom(
      this.http.patch<ConfiguracionDelClub>('/api/admin/configuracion', datos),
    );
  }

  /** Las tarifas del gimnasio, en su orden (T236). */
  tarifasDelGimnasio(): Promise<TarifaDelGimnasio[]> {
    return firstValueFrom(
      this.http.get<TarifaDelGimnasio[]>('/api/admin/club/gimnasio/tarifas'),
    );
  }

  /**
   * Guarda la lista completa: la que estaba se reemplaza entera (T235). Un monto en blanco
   * va nulo, y el servidor responde cuál falta.
   */
  guardarTarifasDelGimnasio(
    tarifas: {
      nombre: string;
      precioSocioClp: number | null;
      precioNoSocioClp: number | null;
    }[],
  ): Promise<TarifaDelGimnasio[]> {
    return firstValueFrom(
      this.http.put<TarifaDelGimnasio[]>('/api/admin/club/gimnasio/tarifas', { tarifas }),
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
   * El panel crea todo bloqueo por acá, también sobre una hora libre: el cierre es el que
   * cuenta el tope de canchas con luz para los de clase y torneo (T206).
   */
  cerrar(bloqueo: BloqueoNuevo): Promise<ResultadoCierre> {
    return firstValueFrom(
      this.http.post<ResultadoCierre>('/api/admin/cierres', bloqueo),
    );
  }

  borrarBloqueo(id: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/admin/bloqueos/${id}`));
  }
}

/**
 * Las horas abiertas de hoy que salen en $0, para la alarma de la pantalla de Canchas (T288).
 *
 * La alarma va arriba de las tres pestañas, y lo que la cambia se guarda dentro de ellas: una
 * cancha nueva, su horario, una tarifa del club. Por eso la provee la pantalla madre
 * (`providers`), y cada pestaña la relee con `recargar()` al guardar.
 */
@Injectable()
export class HorasSinTarifa {
  private readonly api = inject(AdminCanchas);

  readonly advertencias = resource({
    loader: () => this.api.advertencias(hoyEnElClub()),
    defaultValue: [],
  });

  recargar(): void {
    this.advertencias.reload();
  }
}
