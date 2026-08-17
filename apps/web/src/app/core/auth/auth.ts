import { HttpClient } from '@angular/common/http';
import { inject, Service, signal } from '@angular/core';
import { catchError, firstValueFrom, of } from 'rxjs';

/**
 * Lo que la SPA sabe de quien está mirando. Espejo de `GET /api/auth/sesion`;
 * T8 lo reemplaza por el contrato `UsuarioActual` completo.
 */
export interface UsuarioSesion {
  id: number;
  nombre: string;
  email: string;
}

/**
 * Estado de sesión del navegador. No guarda tokens: la sesión vive en una cookie
 * `httpOnly` que este código no puede leer, y por eso un XSS tampoco.
 */
@Service()
export class Auth {
  private readonly http = inject(HttpClient);

  private readonly estado = signal<UsuarioSesion | null>(null);

  /** null si no hay sesión o si todavía no se resolvió la primera consulta. */
  readonly usuario = this.estado.asReadonly();

  constructor() {
    void this.refrescar();
  }

  /**
   * Pregunta al servidor quién está mirando.
   *
   * No tener sesión es un 401 y es el caso normal de cualquier visitante, así que
   * se traduce a `null` en vez de dejarlo propagar: como error de aplicación
   * ensucia la consola en cada carga y tapa los errores que sí importan.
   */
  async refrescar(): Promise<void> {
    const usuario = await firstValueFrom(
      this.http
        .get<UsuarioSesion>('/api/auth/sesion')
        .pipe(catchError(() => of(null))),
    );

    this.estado.set(usuario);
  }

  async entrar(email: string, contrasena: string): Promise<void> {
    await firstValueFrom(
      this.http.post('/api/auth/login', { email, contrasena }),
    );

    // Se relee del servidor en vez de creerle al formulario: la fuente de verdad
    // es la cookie, y así el estado es el mismo que tras recargar la página.
    await this.refrescar();
  }

  async salir(): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/logout', {}));
    await this.refrescar();
  }
}
