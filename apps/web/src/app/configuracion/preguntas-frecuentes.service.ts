import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Espejo de `PreguntaFrecuente` en la API (T144), como la ve el panel. */
export interface PreguntaFrecuente {
  id: number;
  pregunta: string;
  respuesta: string;
  /** Menor va más arriba. */
  orden: number;
}

/** Las preguntas frecuentes del club, para el panel (T145). */
@Service()
export class PreguntasFrecuentes {
  private readonly http = inject(HttpClient);

  listar(): Promise<PreguntaFrecuente[]> {
    return firstValueFrom(
      this.http.get<PreguntaFrecuente[]>('/api/admin/preguntas-frecuentes'),
    );
  }

  /** Sin orden: el servidor la deja al final. */
  crear(pregunta: string, respuesta: string): Promise<PreguntaFrecuente> {
    return firstValueFrom(
      this.http.post<PreguntaFrecuente>('/api/admin/preguntas-frecuentes', {
        pregunta,
        respuesta,
      }),
    );
  }

  /** Solo lo que cambia. */
  editar(
    id: number,
    cambio: Partial<Omit<PreguntaFrecuente, 'id'>>,
  ): Promise<PreguntaFrecuente> {
    return firstValueFrom(
      this.http.patch<PreguntaFrecuente>(`/api/admin/preguntas-frecuentes/${id}`, cambio),
    );
  }

  borrar(id: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/admin/preguntas-frecuentes/${id}`));
  }
}
