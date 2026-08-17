import { Injectable } from '@nestjs/common';

/** Lo que Google cuenta de una persona. Todo lo demás de su perfil no se usa. */
export interface PerfilGoogle {
  /** El `sub` del id_token: estable, único y el único identificador confiable. */
  googleId: string;
  email: string;
  /**
   * Si Google verificó el correo. La condición de la que depende toda la
   * vinculación de cuentas; ver SPEC-identidad.md § Vinculación de cuentas.
   */
  emailVerificado: boolean;
  nombre: string;
  apellido: string;
}

/**
 * Puerto hacia Google. Existe para que los tests de vinculación —incluido el del
 * correo no verificado, que es el que no puede faltar— corran sin red y sin
 * credenciales de un proyecto de Google Cloud.
 */
@Injectable()
export abstract class ProveedorGoogle {
  /** Si el servidor tiene credenciales para hablar con Google. */
  abstract configurado(): boolean;

  /** URL a la que se manda a la persona para que autorice. */
  abstract urlDeAutorizacion(state: string, desafioPkce: string): string;

  /** Canjea el código por el perfil. null si Google no lo reconoce. */
  abstract perfil(
    codigo: string,
    verificadorPkce: string,
  ): Promise<PerfilGoogle | null>;
}
