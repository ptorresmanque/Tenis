import { HttpClient } from '@angular/common/http';
import { inject, Service, signal } from '@angular/core';
import { Router } from '@angular/router';
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
  apellido: string;
  email: string;
  /** Nulo para quien entró con Google: Google no entrega el teléfono. */
  telefono: string | null;
  esAdmin: boolean;
  /** Ve la agenda del día y anota observaciones (T215). */
  esGestor: boolean;
  socioId: number | null;
  socioActivo: boolean;
  socioAlDia: boolean;
  /** Nulo también si la ficha está inactiva: un profesor de baja no entra a Clases. */
  profesorId: number | null;
  /**
   * Los días de gracia que le quedan al socio con la cuota vencida, contando hoy (T381). Nulo
   * si está al día, si la gracia ya pasó o si no es un socio activo. Opcional porque solo lo
   * manda `GET /api/yo`: en el `UsuarioActual` de la API no está (SPEC-cuotas.md § Días de
   * gracia).
   */
  diasDeGraciaRestantes?: number | null;
}

/**
 * Estado de sesión del navegador. No guarda tokens: la sesión vive en una cookie
 * `httpOnly` que este código no puede leer, y por eso un XSS tampoco.
 */
@Service()
export class Auth {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly estado = signal<UsuarioActual | null>(null);

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

    // Los guards solo corren al navegar: sin esto, quien sale desde el panel de
    // administración se queda parado en una pantalla de admin ya sin sesión.
    await this.router.navigateByUrl('/');
  }
}
