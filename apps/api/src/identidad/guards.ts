import {
  applyDecorators,
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { hoyEnElClub } from '../comun/tiempo';
import { tokenDeSesion } from './sesion/cookie';
import { SesionService } from './sesion/sesion.service';
import { usuarioActualDe, UsuarioActual } from './usuario-actual';

interface RequestConUsuario extends Request {
  usuarioActual?: UsuarioActual;
}

/** Resuelve la sesión y deja el contrato en la request para los guards que siguen. */
@Injectable()
export class GuardDeSesion implements CanActivate {
  constructor(private readonly sesiones: SesionService) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const req = contexto.switchToHttp().getRequest<RequestConUsuario>();
    const token = tokenDeSesion(req);
    const usuario = token ? await this.sesiones.usuarioDe(token) : null;

    if (!usuario) {
      throw new UnauthorizedException('No hay sesión abierta.');
    }

    req.usuarioActual = usuarioActualDe(usuario, hoyEnElClub());
    return true;
  }
}

/**
 * Resuelve la sesión si la hay, y deja pasar igual.
 *
 * Es el mismo trabajo que `GuardDeSesion` menos el portazo: sirve para el único
 * endpoint que pregunta *quién soy* y acepta "nadie" como respuesta. Todo lo
 * demás sigue con `@Autenticado()`, que es el que cierra la puerta.
 */
@Injectable()
export class GuardDeSesionOpcional implements CanActivate {
  constructor(private readonly sesiones: SesionService) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const req = contexto.switchToHttp().getRequest<RequestConUsuario>();
    const token = tokenDeSesion(req);
    const usuario = token ? await this.sesiones.usuarioDe(token) : null;

    if (usuario) {
      req.usuarioActual = usuarioActualDe(usuario, hoyEnElClub());
    }

    return true;
  }
}

/** Lee lo que dejó `GuardDeSesion`; sin él no hay nada que mirar. */
function usuarioDe(contexto: ExecutionContext): UsuarioActual {
  const usuario = contexto
    .switchToHttp()
    .getRequest<RequestConUsuario>().usuarioActual;

  if (!usuario) {
    throw new UnauthorizedException('No hay sesión abierta.');
  }

  return usuario;
}

@Injectable()
export class GuardDeAdmin implements CanActivate {
  canActivate(contexto: ExecutionContext): boolean {
    if (!usuarioDe(contexto).esAdmin) {
      throw new ForbiddenException('Esto es solo para administración.');
    }

    return true;
  }
}

@Injectable()
export class GuardDeSocio implements CanActivate {
  canActivate(contexto: ExecutionContext): boolean {
    // Basta con tener ficha de socio. Si además está suspendido o moroso lo
    // decide `reservas`, que es quien tiene que dar los mensajes distintos.
    if (usuarioDe(contexto).socioId === null) {
      throw new ForbiddenException('Esto es solo para socios del club.');
    }

    return true;
  }
}

/** Hay que haber entrado. Nada más. */
export const Autenticado = () => UseGuards(GuardDeSesion);

/** Se resuelve la sesión, pero no hace falta tenerla. */
export const SesionOpcional = () => UseGuards(GuardDeSesionOpcional);

export const SoloAdmin = () =>
  applyDecorators(UseGuards(GuardDeSesion, GuardDeAdmin));

export const SoloSocio = () =>
  applyDecorators(UseGuards(GuardDeSesion, GuardDeSocio));

/** El `UsuarioActual` de la request, para los handlers que lo necesitan. */
/**
 * Quién está mirando, o `null` si no hay nadie.
 *
 * Va con `@SesionOpcional()`. Sin el guard devuelve `null` siempre, que es
 * correcto pero inútil: quien lo use sin el guard está preguntando en una
 * request donde nadie resolvió la sesión.
 */
export const QuizasYo = createParamDecorator(
  (_datos: unknown, contexto: ExecutionContext): UsuarioActual | null =>
    contexto.switchToHttp().getRequest<RequestConUsuario>().usuarioActual ??
    null,
);

export const Yo = createParamDecorator(
  (_datos: unknown, contexto: ExecutionContext): UsuarioActual =>
    usuarioDe(contexto),
);
