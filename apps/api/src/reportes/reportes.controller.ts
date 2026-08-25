import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { esFechaDelClub } from '../comun/tiempo';
import { SoloAdmin } from '../identidad/guards';
import {
  ingresoACsv,
  noUsoACsv,
  ocupacionACsv,
  padronACsv,
} from './csv-de-reportes';
import { Corte, esCorte } from './ingreso';
import { IngresoDelClub } from './ingreso.service';
import { CorteDeNoUso, esCorteDeNoUso, HorasNoUsadas } from './no-uso.service';
import { CorteDeOcupacion, esCorteDeOcupacion } from './ocupacion';
import { OcupacionDeCancha } from './ocupacion.service';
import { PadronDelClub } from './padron.service';

/**
 * Los reportes del club.
 *
 * **Solo el admin, y lo comprueba el servidor.** Es material sensible: el ingreso del
 * club y la deuda de personas con nombre. La directiva lo ve a través de un admin y no
 * con una cuenta de "directivo" que habría que inventar y mantener.
 *
 * **Cada reporte tiene su gemelo en CSV, y el CSV sale del mismo objeto que el JSON.**
 * Con dos caminos separados, el día que uno cambie el club se lleva a su planilla
 * números distintos de los que vio en pantalla y no hay forma de que lo note.
 */
@Controller('admin/reportes')
@SoloAdmin()
export class ReportesController {
  constructor(
    private readonly ingreso: IngresoDelClub,
    private readonly ocupacion: OcupacionDeCancha,
    private readonly noUso: HorasNoUsadas,
    private readonly padron: PadronDelClub,
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

  @Get('ingreso.csv')
  async ingresoCsv(
    @Res({ passthrough: true }) res: Response,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('corte') corte?: string,
  ) {
    const reporte = await this.ingreso.reporte(
      this.exigirFecha(desde, 'desde'),
      this.exigirFecha(hasta, 'hasta'),
      this.exigirCorte(corte),
    );

    return this.comoDescarga(
      res,
      `ingreso-${reporte.desde}-a-${reporte.hasta}`,
      ingresoACsv(reporte),
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

  @Get('ocupacion.csv')
  async ocupacionCsv(
    @Res({ passthrough: true }) res: Response,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('corte') corte?: string,
  ) {
    const reporte = await this.ocupacion.reporte(
      this.exigirFecha(desde, 'desde'),
      this.exigirFecha(hasta, 'hasta'),
      this.exigirCorteDeOcupacion(corte),
    );

    return this.comoDescarga(
      res,
      `ocupacion-${reporte.desde}-a-${reporte.hasta}`,
      ocupacionACsv(reporte),
    );
  }

  /** Las horas que alguien reservó y no usó: el indicador del OE4. */
  @Get('no-uso')
  horasPerdidas(
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('corte') corte?: string,
  ) {
    return this.noUso.reporte(
      this.exigirFecha(desde, 'desde'),
      this.exigirFecha(hasta, 'hasta'),
      this.exigirCorteDeNoUso(corte),
    );
  }

  @Get('no-uso.csv')
  async noUsoCsv(
    @Res({ passthrough: true }) res: Response,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('corte') corte?: string,
  ) {
    const reporte = await this.noUso.reporte(
      this.exigirFecha(desde, 'desde'),
      this.exigirFecha(hasta, 'hasta'),
      this.exigirCorteDeNoUso(corte),
    );

    return this.comoDescarga(
      res,
      `no-uso-${reporte.desde}-a-${reporte.hasta}`,
      noUsoACsv(reporte),
    );
  }

  /** El padrón y la morosidad mes a mes. */
  @Get('padron')
  socios(@Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    return this.padron.reporte(
      this.exigirFecha(desde, 'desde'),
      this.exigirFecha(hasta, 'hasta'),
    );
  }

  @Get('padron.csv')
  async padronCsv(
    @Res({ passthrough: true }) res: Response,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    const reporte = await this.padron.reporte(
      this.exigirFecha(desde, 'desde'),
      this.exigirFecha(hasta, 'hasta'),
    );

    return this.comoDescarga(
      res,
      `padron-${reporte.desde}-a-${reporte.hasta}`,
      padronACsv(reporte),
    );
  }

  /**
   * Manda el CSV como descarga con nombre.
   *
   * El nombre lleva el rango: al tercer reporte descargado, tres archivos llamados
   * "ingreso.csv" en la carpeta de descargas no se distinguen entre sí.
   */
  private comoDescarga(res: Response, nombre: string, csv: string): string {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${nombre}.csv"`,
    );

    return csv;
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

  /** Sin corte, por mes: el OE4 compara períodos. */
  private exigirCorteDeNoUso(valor: string | undefined): CorteDeNoUso {
    if (valor === undefined) return 'mes';

    if (!esCorteDeNoUso(valor)) {
      throw new BadRequestException(
        'El corte de no uso tiene que ser mes, cancha o franja.',
      );
    }

    return valor;
  }
}
