import {
  applyDecorators,
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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

/** Los tipos del panel que no son admin. El admin pasa siempre (SPEC-identidad.md). */
export type TipoDelPanel = 'gestor' | 'profesor';

const TIPOS = 'tiposDelPanel';

/**
 * Deja pasar al admin y a quien tenga alguno de los tipos de la lista.
 *
 * **La lista del método reemplaza a la de la clase** (`getAllAndOverride`): con
 * `@AdminO('profesor')` en el controlador y `@AdminO('gestor', 'profesor')` en un
 * método, Nest corre el guard dos veces, y si cada turno leyera su propia lista el
 * gestor rebotaría en el de la clase. Así los dos turnos leen la misma.
 */
@Injectable()
export class GuardDeTipos implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const yo = usuarioDe(contexto);
    const tipos =
      this.reflector.getAllAndOverride<TipoDelPanel[]>(TIPOS, [
        contexto.getHandler(),
        contexto.getClass(),
      ]) ?? [];

    const pasa =
      yo.esAdmin ||
      (tipos.includes('gestor') && yo.esGestor) ||
      (tipos.includes('profesor') && yo.profesorId !== null);

    if (!pasa) {
      throw new ForbiddenException('Tu cuenta no tiene acceso a esto.');
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

/** `@AdminO('gestor')`, `@AdminO('profesor')` o `@AdminO('gestor', 'profesor')`. */
export const AdminO = (...tipos: TipoDelPanel[]) =>
  applyDecorators(
    SetMetadata(TIPOS, tipos),
    UseGuards(GuardDeSesion, GuardDeTipos),
  );

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
