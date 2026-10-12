import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { MAXIMO_BYTES } from '../comun/imagenes';
import { SoloAdmin } from '../identidad/guards';
import { leerFotoDelLugar } from './fotos-del-club.dto';
import { FotosDelClub } from './fotos-del-club.service';

/**
 * Las fotos de la tienda y la cafetería, para el panel (T185). Las públicas las sirve
 * `ClubPublicoController`, junto con el resto de lo que el sitio muestra del club.
 *
 * `@SoloAdmin()` en la clase entera: alcanza con que a una ruta se le olvide para que
 * cualquiera pueda subir fotos a la portada del club.
 */
@Controller('admin/club/fotos')
@SoloAdmin()
export class FotosDelClubAdminController {
  constructor(private readonly fotos: FotosDelClub) {}

  @Get()
  listar() {
    return this.fotos.porLugar();
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('foto', { limits: { fileSize: MAXIMO_BYTES } }),
  )
  subir(@Body() cuerpo: unknown, @UploadedFile() archivo?: { buffer: Buffer }) {
    // El lugar y el texto se leen antes de mirar el archivo: un lugar que no existe
    // es un 400 por sí solo, venga o no la foto.
    const pedida = leerFotoDelLugar(cuerpo);

    if (!archivo) throw new BadRequestException('Adjunta la foto.');

    return this.fotos.subir(pedida, archivo.buffer);
  }

  @Delete(':id')
  @HttpCode(204)
  quitar(@Param('id', ParseIntPipe) id: number) {
    return this.fotos.quitar(id);
  }
}
