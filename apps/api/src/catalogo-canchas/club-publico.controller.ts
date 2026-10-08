import { Controller, Get } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/** Lo que el sitio público necesita saber del club para no inventarlo. */
export interface DatosDelClub {
  nombre: string;
  direccion: string;
  telefono: string;
  email: string;
  /** Para el mapa de "El club" (T100). Nulas mientras el admin no la cargue. */
  latitud: number | null;
  longitud: number | null;
}

/**
 * Los datos de contacto del club, para cualquiera.
 *
 * Existe porque el pie de página, la página "El club" y la confirmación los tenían
 * escritos a mano —o, peor, no los tenían y quedaban en blanco—. Son públicos por
 * definición: es la dirección a la que la gente va a jugar.
 *
 * **Solo estos cuatro campos.** La misma fila guarda las reglas de reserva y los
 * cupos, que son de la administración: devolver la configuración entera acá le
 * contaría al mundo cuántos invitados tiene cada socio por mes.
 */
@Controller('club')
export class ClubPublicoController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async datos(): Promise<DatosDelClub> {
    const club = await this.prisma.configuracionClub.findFirstOrThrow({
      select: {
        nombre: true,
        direccion: true,
        telefono: true,
        email: true,
        latitud: true,
        longitud: true,
      },
    });

    return club;
  }
}
