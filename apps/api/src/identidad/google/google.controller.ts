import { createHash } from 'node:crypto';

import { Controller, Get, Logger, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { atributosDeCookie, ponerCookieDeSesion } from '../sesion/cookie';
import { nuevoToken } from '../token';
import { GoogleService, MotivoDeRechazo } from './google.service';
import { ProveedorGoogle } from './google.port';

/** Cookie temporal que ata la vuelta de Google al navegador que empezó el flujo. */
const COOKIE_FLUJO = 'google_oauth';
const VIDA_DEL_FLUJO_MS = 10 * 60 * 1000;

// Los mismos atributos que la cookie de sesión, incluido `sameSite: 'lax'`: con
// `strict` el navegador no mandaría esta cookie justo en la vuelta desde Google.
const atributosDelFlujo = atributosDeCookie;

function paginaDeIngreso(motivo?: MotivoDeRechazo): string {
  const web = process.env.WEB_ORIGIN ?? 'http://localhost:4200';

  return motivo ? `${web}/entrar?error=${motivo}` : `${web}/`;
}

function leerFlujo(
  req: Request,
): { state: string; verificador: string } | null {
  const bruto = (req.headers.cookie ?? '')
    .split(';')
    .map((parte) => parte.trim())
    .find((parte) => parte.startsWith(`${COOKIE_FLUJO}=`));

  const [state, verificador] = (
    bruto?.slice(COOKIE_FLUJO.length + 1) ?? ''
  ).split('.');

  return state && verificador ? { state, verificador } : null;
}

@Controller('auth/google')
export class GoogleController {
  private readonly log = new Logger('Google');

  constructor(
    private readonly proveedor: ProveedorGoogle,
    private readonly servicio: GoogleService,
  ) {}

  @Get()
  empezar(@Res() res: Response): void {
    // El club puede no tener proyecto en Google Cloud. Sin esto, el botón
    // responde un 500 crudo y nadie entiende que falta una credencial.
    if (!this.proveedor.configurado()) {
      res.redirect(paginaDeIngreso('sin_configurar'));
      return;
    }

    const state = nuevoToken();
    const verificador = nuevoToken();

    // A Google viaja el desafío, no el verificador: quien intercepte el código de
    // autorización no puede canjearlo sin el secreto que quedó en esta cookie.
    const desafio = createHash('sha256')
      .update(verificador)
      .digest('base64url');

    res.cookie(COOKIE_FLUJO, `${state}.${verificador}`, {
      ...atributosDelFlujo(),
      maxAge: VIDA_DEL_FLUJO_MS,
    });

    res.redirect(this.proveedor.urlDeAutorizacion(state, desafio));
  }

  @Get('callback')
  async volver(
    @Query('code') codigo: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') errorDeGoogle: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const flujo = leerFlujo(req);
    res.clearCookie(COOKIE_FLUJO, atributosDelFlujo());

    if (errorDeGoogle) {
      // `access_denied` es alguien que se arrepintió en la pantalla de Google:
      // no es una falla y no merece un mensaje de error.
      this.log.log(`Google devolvió sin autorizar: ${errorDeGoogle}`);
      res.redirect(
        paginaDeIngreso(
          errorDeGoogle === 'access_denied' ? 'cancelado' : 'sin_perfil',
        ),
      );
      return;
    }

    // El state ata esta vuelta al navegador que empezó: sin la comparación,
    // cualquiera puede hacer que otro termine con la sesión de una cuenta ajena.
    if (!codigo || !flujo || flujo.state !== state) {
      // Cuál de las tres cosas faltó, sin volcar ninguna: son credenciales de un
      // solo uso, pero saber si el problema es la cookie o el código es la
      // diferencia entre diagnosticar en un minuto o a ciegas.
      const causa = !codigo
        ? 'Google no devolvió código'
        : !flujo
          ? 'no volvió la cookie del flujo — revisar Secure sobre http'
          : 'el state no coincide con el del inicio';

      this.log.warn(`Vuelta de Google descartada: ${causa}.`);
      res.redirect(paginaDeIngreso('sin_perfil'));
      return;
    }

    const perfil = await this.proveedor.perfil(codigo, flujo.verificador);
    if (!perfil) {
      res.redirect(paginaDeIngreso('sin_perfil'));
      return;
    }

    const resultado = await this.servicio.entrar(perfil);
    if ('rechazo' in resultado) {
      res.redirect(paginaDeIngreso(resultado.rechazo));
      return;
    }

    ponerCookieDeSesion(res, resultado.tokenSesion);
    res.redirect(paginaDeIngreso());
  }
}
