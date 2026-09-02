import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Espejo de `CategoriaJuego` en la API: el nivel del **jugador**, no el del torneo. */
export interface CategoriaDeJuego {
  id: number;
  nombre: string;
  orden: number;
  activa: boolean;
}

/** Las categorías con que juega el club: 5ª, 4ª, 3ª, 2ª, 1ª, Honor. */
@Service()
export class CategoriasDeJuego {
  private readonly http = inject(HttpClient);

  listar(): Promise<CategoriaDeJuego[]> {
    return firstValueFrom(
      this.http.get<CategoriaDeJuego[]>('/api/admin/categorias-juego'),
    );
  }

  crear(nombre: string, orden: number): Promise<CategoriaDeJuego> {
    return firstValueFrom(
      this.http.post<CategoriaDeJuego>('/api/admin/categorias-juego', {
        nombre,
        orden,
      }),
    );
  }

  editar(
    id: number,
    cambio: Partial<Omit<CategoriaDeJuego, 'id'>>,
  ): Promise<CategoriaDeJuego> {
    return firstValueFrom(
      this.http.patch<CategoriaDeJuego>(
        `/api/admin/categorias-juego/${id}`,
        cambio,
      ),
    );
  }
}
