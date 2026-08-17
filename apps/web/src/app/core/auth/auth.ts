import { HttpClient } from '@angular/common/http';
import { computed, inject, Service, signal } from '@angular/core';
import { catchError, firstValueFrom, of } from 'rxjs';

/**
 * Espejo de `UsuarioActual` en apps/api/src/identidad/usuario-actual.ts.
 *
 * `socioActivo` y `socioAlDia` llegan separados a propósito: un socio suspendido
 * no es lo mismo que uno con la cuota vencida y no se les dice lo mismo.
 */
export interface UsuarioActual {
  id: number;
  nombre: string;
  email: string;
  esAdmin: boolean;
  socioId: number | null;
  socioActivo: boolean;
  socioAlDia: boolean;
  profesorId: number | null;
}

/**
 * Estado de sesión del navegador. No guarda tokens: la sesión vive en una cookie
 * `httpOnly` que este código no puede leer, y por eso un XSS tampoco.
 */
@Service()
export class Auth {
  private readonly http = inject(HttpClient);

  private readonly estado = signal<UsuarioActual | null>(null);

  /** null si no hay sesión o si todavía no se resolvió la primera consulta. */
  readonly usuario = this.estado.asReadonly();
  readonly esAdmin = computed(() => this.estado()?.esAdmin === true);

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
      this.http.get<UsuarioActual>('/api/yo').pipe(catchError(() => of(null))),
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
