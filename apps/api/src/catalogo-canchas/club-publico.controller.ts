import { Controller, Get } from '@nestjs/common';

import { DatosDelClub } from '../comun/club';
import { PrismaService } from '../prisma/prisma.service';
import { LugarDelClub, TextosDeElClub } from './admin.dto';
import { RedesDelClub } from './redes';

/** Lo que publica `GET /api/club`. */
export type ClubPublico = DatosDelClub &
  RedesDelClub &
  TextosDeElClub & { tienda: LugarDelClub; cafeteria: LugarDelClub };

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
  constructor(private readonly prisma: PrismaService) {}

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

    // Un objeto por lugar y no seis columnas sueltas: el sitio dibuja los dos con el
    // mismo componente, y así le pasa uno entero.
    return {
      ...club,
      tienda: {
        descripcion: tiendaDescripcion,
        horario: tiendaHorario,
        whatsapp: tiendaWhatsapp,
      },
      cafeteria: {
        descripcion: cafeteriaDescripcion,
        horario: cafeteriaHorario,
        whatsapp: cafeteriaWhatsapp,
      },
    };
  }
}
