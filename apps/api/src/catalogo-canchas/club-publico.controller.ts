import { Controller, Get } from '@nestjs/common';

import { DatosDelClub } from '../comun/club';
import { PrismaService } from '../prisma/prisma.service';
import { RedesDelClub } from './redes';

/**
 * Los datos de contacto del club, para cualquiera.
 *
 * Existe porque el pie de página, la página "El club" y la confirmación los tenían
 * escritos a mano —o, peor, no los tenían y quedaban en blanco—. Son públicos por
 * definición: es la dirección a la que la gente va a jugar.
 *
 * **Solo el contacto, la ubicación y las redes (T140).** La misma fila guarda las
 * reglas de reserva y los cupos, que son de la administración: devolver la
 * configuración entera acá le contaría al mundo cuántos invitados tiene cada socio
 * por mes.
 */
@Controller('club')
export class ClubPublicoController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async datos(): Promise<DatosDelClub & RedesDelClub> {
    const club = await this.prisma.configuracionClub.findFirstOrThrow({
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
      },
    });

    return club;
  }
}
