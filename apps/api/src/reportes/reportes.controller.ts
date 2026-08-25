import { BadRequestException, Controller, Get, Query } from '@nestjs/common';

import { esFechaDelClub } from '../comun/tiempo';
import { SoloAdmin } from '../identidad/guards';
import { Corte, esCorte } from './ingreso';
import { IngresoDelClub } from './ingreso.service';
import { CorteDeOcupacion, esCorteDeOcupacion } from './ocupacion';
import { OcupacionDeCancha } from './ocupacion.service';

/**
 * Los reportes del club.
 *
 * **Solo el admin, y lo comprueba el servidor.** Es material sensible: el ingreso del
 * club y, más adelante, la deuda de personas con nombre. La directiva lo ve a través de
 * un admin y no con una cuenta de "directivo" que habría que inventar y mantener.
 */
@Controller('admin/reportes')
@SoloAdmin()
export class ReportesController {
  constructor(
    private readonly ingreso: IngresoDelClub,
    private readonly ocupacion: OcupacionDeCancha,
  ) {}

  /**
   * El ingreso del período, cortado por una de las cinco dimensiones.
   *
   * El rango es obligatorio y se valida: un reporte de plata sobre un rango que el
   * servidor adivinó es peor que un error.
   */
  @Get('ingreso')
  porPeriodo(
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('corte') corte?: string,
  ) {
    return this.ingreso.reporte(
      this.exigirFecha(desde, 'desde'),
      this.exigirFecha(hasta, 'hasta'),
      this.exigirCorte(corte),
    );
  }

  /**
   * Cuánta cancha se usó y cuánta se desperdició.
   *
   * Sin corte, por condición: la comparación techada contra abierta en los meses de
   * lluvia es el número que el club está esperando.
   */
  @Get('ocupacion')
  cuantaCancha(
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('corte') corte?: string,
  ) {
    return this.ocupacion.reporte(
      this.exigirFecha(desde, 'desde'),
      this.exigirFecha(hasta, 'hasta'),
      this.exigirCorteDeOcupacion(corte),
    );
  }

  private exigirFecha(valor: string | undefined, campo: string): string {
    if (typeof valor !== 'string' || !esFechaDelClub(valor)) {
      throw new BadRequestException(
        `Falta "${campo}" o no es una fecha AAAA-MM-DD que exista.`,
      );
    }

    return valor;
  }

  /** Sin corte, el que contesta la pregunta que motivó el módulo. */
  private exigirCorte(valor: string | undefined): Corte {
    if (valor === undefined) return 'condicion';

    if (!esCorte(valor)) {
      throw new BadRequestException(
        'El corte tiene que ser cancha, condicion, franja, usuario o concepto.',
      );
    }

    return valor;
  }

  /**
   * El corte de la ocupación. **Son tres y no cinco**: una hora libre no tiene usuario
   * ni concepto, así que ofrecer esos cortes obligaría a inventar una fila vacía.
   */
  private exigirCorteDeOcupacion(valor: string | undefined): CorteDeOcupacion {
    if (valor === undefined) return 'condicion';

    if (!esCorteDeOcupacion(valor)) {
      throw new BadRequestException(
        'El corte de ocupación tiene que ser cancha, condicion o franja.',
      );
    }

    return valor;
  }
}
