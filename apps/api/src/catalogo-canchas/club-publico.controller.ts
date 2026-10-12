import { Controller, Get, Param, ParseIntPipe, Res } from '@nestjs/common';
import type { Response } from 'express';

import { DatosDelClub } from '../comun/club';
import { carpetaDeSubidas } from '../comun/imagenes';
import { PrismaService } from '../prisma/prisma.service';
import { LugarDelClub, TextosDeElClub } from './admin.dto';
import { FotoDelLugar, FotosDelClub } from './fotos-del-club.service';
import { RedesDelClub } from './redes';

/** Un lugar como lo publica `GET /api/club`: sus textos y sus fotos (T185). */
type LugarPublico = LugarDelClub & { fotos: FotoDelLugar[] };

/** Lo que publica `GET /api/club`. */
export type ClubPublico = DatosDelClub &
  RedesDelClub &
  TextosDeElClub & { tienda: LugarPublico; cafeteria: LugarPublico };

/**
 * Los datos de contacto del club, para cualquiera.
 *
 * Existe porque el pie de página, la página "El club" y la confirmación los tenían
 * escritos a mano —o, peor, no los tenían y quedaban en blanco—. Son públicos por
 * definición: es la dirección a la que la gente va a jugar.
 *
 * **Solo el contacto, la ubicación, las redes (T140), los textos de "El club" (T142) y
 * la tienda y la cafetería (T184).** La misma fila guarda las reglas de reserva y los
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
      },
    });
    const fotos = await this.fotos.porLugar();

    // Un objeto por lugar y no seis columnas sueltas: el sitio dibuja los dos con el
    // mismo componente, y así le pasa uno entero.
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
    };
  }

  /** La miniatura de una foto de la tienda o la cafetería (T185), sin sesión. */
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
