import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Espejo de `Administrador` en la API. */
export interface Administrador {
  id: number;
  nombre: string;
  email: string;
  esAdmin: boolean;
}

/** Quién tiene abierto el panel del club. */
@Service()
export class Administradores {
  private readonly http = inject(HttpClient);

  listar(): Promise<Administrador[]> {
    return firstValueFrom(
      this.http.get<Administrador[]>('/api/admin/administradores'),
    );
  }

  /** Da el rol buscando por correo: el id de usuario no se ve en ninguna pantalla. */
  nombrar(email: string): Promise<Administrador> {
    return firstValueFrom(
      this.http.patch<Administrador>('/api/admin/administradores/por-correo', {
        email,
        esAdmin: true,
      }),
    );
  }

  quitar(id: number): Promise<Administrador> {
    return firstValueFrom(
      this.http.patch<Administrador>(`/api/admin/administradores/${id}`, {
        esAdmin: false,
      }),
    );
  }
}
