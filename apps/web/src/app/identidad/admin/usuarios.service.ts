import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Una fila de la lista de usuarios (T223), como la arma `GET /api/admin/usuarios`. */
export interface UsuarioDeLaLista {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  telefono: string | null;
  /** Instante ISO de cuando creó la cuenta. */
  creadoEn: string;
  esAdmin: boolean;
  esGestor: boolean;
  socio: { id: number; numeroSocio: string; estado: string } | null;
  profesor: { id: number; nombreVisible: string; activo: boolean } | null;
}

export interface ListadoDeUsuarios {
  usuarios: UsuarioDeLaLista[];
  total: number;
  pagina: number;
  porPagina: number;
}

/** Los tipos que se encienden con una casilla. Socio y profesor son fichas (T224). */
export type CambioDeTipos = Partial<Pick<UsuarioDeLaLista, 'esAdmin' | 'esGestor'>>;

@Service()
export class Usuarios {
  private readonly http = inject(HttpClient);

  /** La búsqueda la hace el servidor: cada palabra en el nombre, el apellido o el correo. */
  listar(q: string, pagina: number): Promise<ListadoDeUsuarios> {
    return firstValueFrom(
      this.http.get<ListadoDeUsuarios>('/api/admin/usuarios', {
        params: { q, pagina },
      }),
    );
  }

  cambiar(id: number, cambio: CambioDeTipos): Promise<UsuarioDeLaLista> {
    return firstValueFrom(this.http.patch<UsuarioDeLaLista>(`/api/admin/usuarios/${id}`, cambio));
  }
}
