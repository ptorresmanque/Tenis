import { Controller, Get, Param, ParseIntPipe, Res } from '@nestjs/common';
import type { Response } from 'express';

import { DatosDelClub } from '../comun/club';
import { carpetaDeSubidas } from '../comun/imagenes';
import { PrismaService } from '../prisma/prisma.service';
import { LugarDelClub, TarifaDelGimnasio, TextosDeElClub } from './admin.dto';
import { FotoDelLugar, FotosDelClub } from './fotos-del-club.service';
import { RedesDelClub } from './redes';

/** Un lugar como lo publica `GET /api/club`: sus textos y sus fotos (T185). */
type LugarPublico = LugarDelClub & { fotos: FotoDelLugar[] };

/** Lo que publica `GET /api/club`. */
export type ClubPublico = DatosDelClub &
  RedesDelClub &
  TextosDeElClub & {
    tienda: LugarPublico;
    cafeteria: LugarPublico;
    /** Con sus tarifas (T235), y sin el cupo grupal, que es de la administración. */
    gimnasio: LugarPublico & { tarifas: TarifaDelGimnasio[] };
  };

/**
 * Los datos de contacto del club, para cualquiera.
 *
 * Existe porque el pie de página, la página "El club" y la confirmación los tenían
 * escritos a mano —o, peor, no los tenían y quedaban en blanco—. Son públicos por
 * definición: es la dirección a la que la gente va a jugar.
 *
 * **Solo el contacto, la ubicación, las redes (T140), los textos de "El club" (T142), la
 * tienda y la cafetería (T184) y el gimnasio con sus tarifas (T235).** La misma fila guarda las reglas de reserva y los
 * cupos, que son de la administración: devolver la configuración entera acá le contaría
 * al mundo cuántos invitados tiene cada socio por mes.
 */
@Controller('club')
export class ClubPublicoController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fotos: FotosDelClub,
  ) {}

  @Get()
  async datos(): Promise<ClubPublico> {
    const {
      tiendaDescripcion,
      tiendaHorario,
      tiendaWhatsapp,
      cafeteriaDescripcion,
      cafeteriaHorario,
      cafeteriaWhatsapp,
      gimnasioDescripcion,
      gimnasioHorario,
      gimnasioWhatsapp,
      ...club
    } = await this.prisma.configuracionClub.findFirstOrThrow({
      select: {
        nombre: true,
        direccion: true,
        telefono: true,
        email: true,
        latitud: true,
        longitud: true,
        instagram: true,
        facebook: true,
        tiktok: true,
        youtube: true,
        whatsapp: true,
        elClubTitulo: true,
        elClubBajada: true,
        elClubCanchas: true,
        tiendaDescripcion: true,
        tiendaHorario: true,
        tiendaWhatsapp: true,
        cafeteriaDescripcion: true,
        cafeteriaHorario: true,
        cafeteriaWhatsapp: true,
        gimnasioDescripcion: true,
        gimnasioHorario: true,
        gimnasioWhatsapp: true,
      },
    });
    const fotos = await this.fotos.porLugar();
    const tarifas = await this.prisma.tarifaGimnasio.findMany({
      orderBy: { orden: 'asc' },
      select: { nombre: true, precioSocioClp: true, precioNoSocioClp: true },
    });

    // Un objeto por lugar y no nueve columnas sueltas: el sitio los dibuja con el mismo
    // componente, y así le pasa uno entero.
    return {
      ...club,
      tienda: {
        descripcion: tiendaDescripcion,
        horario: tiendaHorario,
        whatsapp: tiendaWhatsapp,
        fotos: fotos.TIENDA,
      },
      cafeteria: {
        descripcion: cafeteriaDescripcion,
        horario: cafeteriaHorario,
        whatsapp: cafeteriaWhatsapp,
        fotos: fotos.CAFETERIA,
      },
      gimnasio: {
        descripcion: gimnasioDescripcion,
        horario: gimnasioHorario,
        whatsapp: gimnasioWhatsapp,
        fotos: fotos.GIMNASIO,
        tarifas,
      },
    };
  }

  /** La miniatura de una foto de un lugar del club (T185), sin sesión. */
  @Get('fotos/:id/miniatura')
  async miniatura(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    await this.enviar(id, 'miniatura', res);
  }

  /** La versión grande, pedida recién al abrir la foto. */
  @Get('fotos/:id/imagen')
  async imagen(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    await this.enviar(id, 'web', res);
  }

  /**
   * Como las fotos de los torneos: la raíz fijada y la ruta sacada de la base, y un año
   * de caché porque el nombre lo genera el servidor y nunca cambia de contenido.
   */
  private async enviar(
    id: number,
    cual: 'web' | 'miniatura',
    res: Response,
  ): Promise<void> {
    const ruta = await this.fotos.ruta(id, cual);

    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(ruta, { root: carpetaDeSubidas() });
  }
}
