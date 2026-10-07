import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Redirect,
  Res,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';

import { carpetaDeSubidas, MAXIMO_BYTES } from '../comun/imagenes';
import { hoyEnElClub } from '../comun/tiempo';
import { api, web } from '../comun/urls';
import { IntentosFallidos, VENTANA_MS } from '../identidad/intentos';
import { ComprobantesDeInscripcion } from './comprobantes.service';
import { FotosDelTorneo } from './fotos.service';
import { leerInscripcionPublica } from './inscripcion-publica.dto';
import { PagoDeInscripcion } from './pago-de-inscripcion.service';
import { Transmisiones } from './transmisiones.service';
import { InscripcionesAbandonadas } from './inscripciones-abandonadas.service';
import { InscripcionesATorneo } from './inscripciones.service';
import { TorneosPublicos } from './torneos-publicos.service';

/**
 * Los torneos, sin cuenta.
 *
 * **Sin guard a propósito**: el calendario es de las pocas cosas que un tercero mira
 * antes de asociarse, y el cuadro es el mismo mural del club en el teléfono de quien
 * está en la cancha de al lado. Lo que se publica lo decide `TorneosPublicos`, que
 * arma sus propias formas para que un campo del panel no salga a la calle sin que
 * nadie lo decida.
 */
@Controller('torneos')
export class TorneosPublicosController {
  constructor(
    private readonly torneos: TorneosPublicos,
    private readonly inscripciones: InscripcionesATorneo,
    private readonly abandonadas: InscripcionesAbandonadas,
    private readonly comprobantes: ComprobantesDeInscripcion,
    private readonly pagoDeInscripcion: PagoDeInscripcion,
    private readonly transmisiones: Transmisiones,
    private readonly fotos: FotosDelTorneo,
    /**
     * El mismo contador que frena el login y el formulario de contacto (T38).
     *
     * **No se construyó nada: se reusó.** Acá se anota **cada envío** y no cada fallo,
     * como en `contacto`: en un formulario público no hay envío fallido —todos
     * "funcionan"— y lo que hay que acotar es el volumen.
     *
     * `SPEC-torneos.md` § El riesgo que abre el formulario público explica por qué
     * hace falta: la defensa principal es el cobro (T66), pero **no cubre el camino
     * del comprobante ni un torneo gratis**, y esto queda abierto a cualquiera.
     */
    private readonly envios: IntentosFallidos,
  ) {}

  /** El calendario del año. Sin `anio`, el que está corriendo. */
  @Get('publicos')
  calendario(@Query('anio') anio?: string) {
    const pedido = Number(anio);
    const valido = Number.isInteger(pedido) && pedido > 2000 && pedido < 2100;

    // Un año inventado no es un error que valga la pena mostrarle a un visitante: se
    // cae al actual, que es lo que buscaba.
    return this.torneos.calendario(
      valido ? pedido : hoyEnElClub().getUTCFullYear(),
    );
  }

  /**
   * El cuadro de **una categoría**, con sus resultados; o su lista de inscritos si
   * todavía no se armó.
   *
   * **El `id` es el de la categoría del torneo y no el del torneo** (T62). Un torneo
   * corre 4ª, 3ª y Honor a la vez, así que "el cuadro del torneo" dejó de significar
   * algo; el calendario trae los ids de sus cuadros para poder pedirlos.
   */
  @Get('cuadros/:id')
  cuadro(@Param('id', ParseIntPipe) id: number) {
    return this.torneos.cuadro(id);
  }

  /** Las transmisiones del torneo, para verlas sin salir del sitio. */
  @Get(':id/transmisiones')
  transmisionesDelTorneo(@Param('id', ParseIntPipe) id: number) {
    return this.transmisiones.listar(id);
  }

  /**
   * La transmisión que cubre a este partido, o nada.
   *
   * **Se transmite una cancha, no un partido**, así que esto responde "el live de la
   * Cancha 1 de esa jornada". El live va corrido: si el partido anterior se alargó, lo
   * que sale en pantalla es ese otro, y la pantalla lo dice en vez de prometer un
   * partido que no está.
   */
  @Get('partidos/:id/transmision')
  async transmisionDelPartido(@Param('id', ParseIntPipe) id: number) {
    // **Envuelto y no un `null` pelado**: sobre HTTP, `null` se serializa como cuerpo
    // vacío y el cliente no distingue "no tiene transmisión" de "la respuesta llegó
    // rota". Un objeto con el campo adentro dice las dos cosas.
    return { transmision: await this.transmisiones.delPartido(id) };
  }

  /**
   * Inscribirse solo, sin cuenta.
   *
   * **Revierte "inscribirse sigue siendo cosa del admin".** Sin sesión a propósito: el
   * torneo lo juegan externos de otros clubes que no tienen ni van a tener cuenta acá,
   * y pedirles registro para anotarse es la barrera que el club quiso sacar.
   *
   * Todo lo que decide si la inscripción entra —el estado del torneo, la fecha de
   * cierre, si el cuadro ya se armó, cuánto cupo queda— **se lee de la base**, nunca
   * del cuerpo.
   */
  @Post(':torneoId/inscripcion')
  // **La imagen del comprobante viaja en este mismo envío** cuando el jugador elige
  // transferir: sin ella el servidor rechaza la inscripción y no queda fila. El
  // interceptor deja pasar intacto el cuerpo JSON del que paga con Webpay o del que se
  // inscribe a un torneo gratis — `multer` no toca lo que no es multipart.
  @UseInterceptors(
    FileInterceptor('comprobante', { limits: { fileSize: MAXIMO_BYTES } }),
  )
  async inscribirse(
    @Param('torneoId', ParseIntPipe) torneoId: number,
    @Body() cuerpo: unknown,
    @Req() req: Request,
    @UploadedFile() archivo?: { buffer: Buffer },
  ) {
    const llave = this.llaveDelFreno(req);

    if (this.envios.bloqueado(llave)) {
      throw new HttpException(
        `Tienes varias inscripciones sin pagar. Termina una, o espera ` +
          `${VENTANA_MS / 60_000} minutos, o llámanos al club.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    try {
      const hecha = await this.inscripciones.inscribirDesdeLaCalle(
        torneoId,
        leerInscripcionPublica(cuerpo),
        archivo?.buffer,
      );

      // **Se cuenta el cupo retenido, no el envío.** Es lo que dice el propio
      // `IntentosFallidos` —"cuenta fallos, no peticiones"— y acá pesa más que en el
      // login: el club entero sale a internet por una sola IP, así que contar envíos
      // deja sin inscribirse a la quinta persona que se anota desde el mesón. La cuota
      // se devuelve cuando ese cupo se suelta o se paga, en `soltar` y en el retorno.
      this.envios.anotarFallo(llave);

      return hecha;
    } catch (falla) {
      // **La rechazada no retuvo nada, salvo que trajera imagen.** Quien se equivoca
      // escribiendo su teléfono corrige y manda de nuevo, y castigarlo por eso lo deja
      // fuera del torneo por un error de tipeo. Una imagen, en cambio, pasó por `sharp`
      // aunque la inscripción no entrara, y ese trabajo sí hay que acotarlo.
      if (archivo) this.envios.anotarFallo(llave);

      throw falla;
    }
  }

  /**
   * Pagar la inscripción con Webpay.
   *
   * **Sin sesión, como la inscripción**: quien se anotó desde la calle no tiene cuenta.
   * El monto sale de la categoría del torneo y jamás del cuerpo — `SPEC-pagos.md`
   * § Monto autoritativo.
   */
  @Post('inscripciones/:token/pago')
  pagar(@Param('token') token: string) {
    return this.pagoDeInscripcion.iniciar(
      token,
      `${api()}/torneos/inscripciones/retorno`,
    );
  }

  /**
   * Soltar el cupo de la propia inscripción sin pagar.
   *
   * **La llama la pantalla cuando la persona vuelve de la pasarela sin haber pagado**
   * —apretando "atrás" en el navegador, que no le avisa a nadie más—. Sin sesión y por
   * el token, como todo lo demás de este camino: quien se inscribió desde la calle no
   * tiene cuenta, y su llave es lo único que prueba que la inscripción es suya.
   *
   * Solo suelta una `WEBPAY` que sigue `PENDIENTE`: la transferencia con su comprobante
   * la resuelve el club, y una pagada no se toca.
   */
  @Post('inscripciones/:token/soltar')
  async soltar(@Param('token') token: string, @Req() req: Request) {
    const suelta = await this.abandonadas.soltarPorToken(token);

    // Ese cupo dejó de estar retenido, así que la cuota vuelve. Sin esto, el camino
    // que este endpoint existe para habilitar —vuelves atrás y te inscribes de nuevo—
    // chocaba contra el freno a la quinta vuelta.
    if (suelta.soltada) this.envios.devolver(this.llaveDelFreno(req));

    return suelta;
  }

  /**
   * La vuelta desde Webpay.
   *
   * **Sin guardia, como el retorno de la reserva y el de la cuota**: quien vuelve es el
   * navegador de la persona traído por la pasarela, y la cookie puede no viajar en esa
   * redirección. Lo que hace de credencial es el `token_ws`, que solo conoce quien pagó.
   *
   * Redirige en vez de responder JSON: del otro lado hay alguien mirando su pantalla.
   *
   * **Faltaba, y era plata.** La revisión de T66 encontró que `iniciar` apuntaba acá y
   * esta ruta no existía: la persona pagaba, volvía a un 404 y su inscripción se quedaba
   * pendiente hasta que la transacción expiraba sola.
   */
  @Get('inscripciones/retorno')
  @Redirect()
  async retornoDelPago(
    @Req() req: Request,
    @Query('token_ws') tokenWs?: string,
    @Query('TBK_ORDEN_COMPRA') ordenAnulada?: string,
  ) {
    // Pagó, anuló o se lo rechazaron: en los tres casos ese cupo dejó de estar
    // retenido —o lo está de una forma que ya no depende de esta persona— así que su
    // cuota vuelve. Quien acaba de pagar es el último a quien hay que frenar.
    this.envios.devolver(this.llaveDelFreno(req));

    if (!tokenWs) {
      // **Apretó "anular" en Webpay: su cupo se suelta ahora mismo.** Es la única
      // forma de abandono que la pasarela avisa, y avisa con `TBK_ORDEN_COMPRA` —el
      // mismo camino que la reserva del no-socio—; hacerle esperar los quince minutos
      // del barrido sería dejar el lugar tomado por alguien que ya dijo que no.
      await this.abandonadas.anularDesdeRetorno(ordenAnulada ?? '');

      return { url: `${web()}/torneos?pago=anulado` };
    }

    const resultado = await this.pagoDeInscripcion.confirmar(tokenWs);

    return {
      url: `${web()}/torneos?pago=${
        resultado.estado === 'AUTORIZADA' ? 'listo' : 'rechazado'
      }`,
    };
  }

  /**
   * Subir el comprobante de una transferencia.
   *
   * **Uno por inscripción**: el segundo reemplaza al primero. La imagen se reencodifica
   * y se le quitan los metadatos antes de tocar el disco — ver `comun/imagenes.ts`.
   */
  @Post('inscripciones/:token/comprobante')
  @UseInterceptors(
    FileInterceptor('comprobante', { limits: { fileSize: MAXIMO_BYTES } }),
  )
  subirComprobante(
    @Param('token') token: string,
    @Req() req: Request,
    @UploadedFile() archivo?: { buffer: Buffer },
  ) {
    // **El mismo freno que el formulario de inscripción**, y por lo mismo: acá no hay
    // pasarela que cobre, así que el cobro —que es la defensa del formulario público—
    // no cubre este camino. Y cada subida decodifica hasta 15 MB con `sharp`: sin
    // freno es CPU regalada a quien quiera pedirla.
    const llave = `comprobante|${req.ip ?? 'sin-ip'}`;

    this.envios.contarPedido(
      llave,
      `Recibimos varios comprobantes tuyos. Espera ${VENTANA_MS / 60_000} ` +
        'minutos, o llámanos al club.',
    );

    if (!archivo) {
      throw new BadRequestException('Adjunta la imagen del comprobante.');
    }

    return this.comprobantes.subir(token, archivo.buffer);
  }

  // ── Las fotos del torneo ────────────────────────────────────────────────────

  /**
   * La llave del freno de inscripciones: una por IP.
   *
   * En un solo lugar porque **la arman tres endpoints**: el que retiene el cupo y los
   * dos que lo devuelven. Escrita a mano en cada uno, la primera vez que alguien
   * cambie el prefijo el freno deja de devolver la cuota y nadie se entera hasta que
   * un jugador se queda afuera.
   */
  private llaveDelFreno(req: Request): string {
    return `inscripcion|${req.ip ?? 'sin-ip'}`;
  }

  /** La galería de un torneo. Devuelve direcciones, nunca rutas del disco. */
  @Get(':id/fotos')
  fotosDelTorneo(@Param('id', ParseIntPipe) id: number) {
    return this.fotos.delTorneo(id);
  }

  /** Las de un partido: la previa de los dos jugadores, casi siempre. */
  @Get('partidos/:id/fotos')
  fotosDelPartido(@Param('id', ParseIntPipe) id: number) {
    return this.fotos.delPartido(id);
  }

  /**
   * La miniatura, que es lo que carga la galería.
   *
   * **Sin guard, al revés que el comprobante.** Dos carpetas con dos reglas: el
   * comprobante lleva el número de cuenta de alguien, y esto es una foto que el club
   * sacó justamente para que se vea.
   */
  @Get('fotos/:id/miniatura')
  async miniatura(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    await this.enviarFoto(id, 'miniatura', res);
  }

  /** La versión grande, pedida recién al abrir la foto. */
  @Get('fotos/:id/imagen')
  async imagen(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    await this.enviarFoto(id, 'web', res);
  }

  private async enviarFoto(
    id: number,
    cual: 'web' | 'miniatura',
    res: Response,
  ): Promise<void> {
    const ruta = await this.fotos.rutaDeLaFoto(id, cual);

    // Raíz fijada, como el comprobante: la ruta sale de la base y no del cliente, y
    // acotarla es lo que impide que un valor mal escrito lea fuera de la carpeta.
    //
    // Un año de caché: el nombre del archivo lo genera el servidor con un UUID, así que
    // una dirección nunca cambia de contenido. Sin esto, la galería vuelve a pedir
    // sesenta miniaturas cada vez que alguien la abre desde el club.
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(ruta, { root: carpetaDeSubidas() });
  }
}
