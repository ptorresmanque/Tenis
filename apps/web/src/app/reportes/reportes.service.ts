import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Los cinco cortes del reporte de ingreso. No hay un sexto: para otros está el CSV. */
export type CorteDeIngreso = 'cancha' | 'condicion' | 'franja' | 'usuario' | 'concepto';

/** Cómo se lee cada corte en pantalla. */
export const CORTES_DE_INGRESO: Record<CorteDeIngreso, string> = {
  condicion: 'Techada o abierta',
  cancha: 'Cancha',
  franja: 'Pico o valle',
  usuario: 'Socio o no socio',
  concepto: 'Concepto',
};

export interface FilaDeIngreso {
  etiqueta: string;
  montoClp: number;
}

export interface ReporteDeIngreso {
  desde: string;
  hasta: string;
  corte: CorteDeIngreso;
  totalClp: number;
  filas: FilaDeIngreso[];
  /** Lo emitido del período que sigue sin cobrarse. */
  cuotasImpagasClp: number;
  calculadoEn: string;
}

/**
 * Los reportes del club.
 *
 * **Solo lectura.** El módulo no escribe nada en ninguna parte: consulta lo que los
 * otros ya guardaron y agrega.
 */
@Service()
export class Reportes {
  private readonly http = inject(HttpClient);

  ingreso(desde: string, hasta: string, corte: CorteDeIngreso): Promise<ReporteDeIngreso> {
    return firstValueFrom(
      this.http.get<ReporteDeIngreso>('/api/admin/reportes/ingreso', {
        params: { desde, hasta, corte },
      }),
    );
  }
}
