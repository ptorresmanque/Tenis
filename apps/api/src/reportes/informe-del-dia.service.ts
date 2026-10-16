import { Injectable } from '@nestjs/common';

import { Clases } from '../clases/clases.service';
import { ZONA_DEL_CLUB } from '../comun/tiempo';
import {
  EstadoClase,
  EstadoReserva,
  TipoClase,
} from '../generated/prisma/client';
import { AgendaService } from '../reservas/agenda.service';

const HORA = new Intl.DateTimeFormat('es-CL', {
  timeZone: ZONA_DEL_CLUB,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const TIPO_DE_CLASE: Record<TipoClase, string> = {
  TENIS: 'Clase de tenis',
  PREPARACION_FISICA: 'Clase de preparación física',
};

const ESTADO_DE_CLASE: Record<EstadoClase, string> = {
  PROGRAMADA: 'Programada',
  REALIZADA: 'Realizada',
  CANCELADA: 'Cancelada',
};

const ESTADO_DE_RESERVA: Record<EstadoReserva, string> = {
  PENDIENTE_PAGO: 'Esperando el pago',
  CONFIRMADA: 'Confirmada',
  CANCELADA: 'Cancelada',
  EXPIRADA: 'Expirada',
};

/** Una línea del informe: una reserva o una clase, dicha como la lee el club. */
export interface FilaDelInforme {
  /** "HH:mm" en el reloj del club. */
  inicio: string;
  fin: string;
  /** La cancha, o "Gimnasio". */
  lugar: string;
  tipo: string;
  /** A nombre de quién está la reserva, o el profesor de la clase. */
  quien: string;
  telefono: string | null;
  socioOVisitante: string | null;
  folio: string | null;
  estado: string;
  acompanantes: string;
  observaciones: string;
}

/**
 * El informe del día (T273): las reservas y las clases de una fecha, en orden de reloj,
 * con lo mismo que muestra la agenda (D5). Lo baja la agenda como CSV y lo manda el correo
 * diario (T275).
 *
 * Vive en `reportes` y no en `reservas`: junta reservas y clases, y `clases` ya depende de
 * `reservas`. Ponerlo ahí haría que cada uno dependiera del otro.
 */
@Injectable()
export class InformeDelDia {
  constructor(
    private readonly agenda: AgendaService,
    private readonly clases: Clases,
  ) {}

  /** @param fecha Fecha civil del club, "AAAA-MM-DD". */
  async delDia(fecha: string): Promise<FilaDelInforme[]> {
    const [reservas, clases] = await Promise.all([
      this.agenda.delDia(fecha),
      this.clases.delDia(fecha),
    ]);

    const filas = [
      ...clases.map((clase) => ({
        orden: clase.inicio.getTime(),
        fila: {
          inicio: HORA.format(clase.inicio),
          fin: HORA.format(clase.fin),
          lugar: clase.lugar,
          tipo: TIPO_DE_CLASE[clase.tipo],
          quien: clase.profesor,
          telefono: null,
          socioOVisitante: null,
          folio: null,
          estado: ESTADO_DE_CLASE[clase.estado],
          acompanantes: '',
          observaciones: '',
        },
      })),
      ...reservas.map((reserva) => ({
        orden: reserva.inicio.getTime(),
        fila: {
          inicio: HORA.format(reserva.inicio),
          fin: HORA.format(reserva.fin),
          lugar: reserva.cancha,
          tipo: 'Reserva',
          quien: reserva.nombre,
          telefono: reserva.telefono,
          socioOVisitante: reserva.esSocio ? 'Socio' : 'Visitante',
          folio: reserva.folio,
          estado: ESTADO_DE_RESERVA[reserva.estado],
          acompanantes: reserva.acompanantes.join(', '),
          // Con su autor: en el mesón, quién anotó algo importa tanto como lo anotado.
          observaciones: reserva.observaciones
            .map(({ texto, autorNombre }) => `${texto} (${autorNombre})`)
            .join(' | '),
        },
      })),
    ];

    // Estable: a la misma hora, la clase va antes que las reservas, como en la agenda.
    return filas
      .sort((una, otra) => una.orden - otra.orden)
      .map(({ fila }) => fila);
  }
}
