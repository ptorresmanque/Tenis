import { httpResource } from '@angular/common/http';
import { computed, inject, Injectable } from '@angular/core';

import { Auth } from './auth/auth';

/** Lo que espera al admin (`GET /api/admin/pendientes`, T287). */
export interface ConteoDePendientes {
  horasPorRevisar: number;
  consultasSinAtender: number;
}

/**
 * Cuánto espera al admin, para los badges del panel (SPEC-panel.md A10): el de «Por revisar» en
 * Horas no usadas y, desde T301, los del menú. Uno solo para todo el panel, así resolver una
 * hora en su pantalla baja el número en todas partes con un `recargar()`.
 *
 * Se pide al crearse el servicio, la primera vez que algo lo inyecta, y **solo con el admin**:
 * el menú, que también ven el gestor y el profesor, lo inyecta para todos, y a ellos la API les
 * respondería 403 (T301).
 */
@Injectable({ providedIn: 'root' })
export class Pendientes {
  private readonly auth = inject(Auth);
  private readonly recurso = httpResource<ConteoDePendientes>(() =>
    this.auth.usuario()?.esAdmin ? '/api/admin/pendientes' : undefined,
  );

  /** El conteo, o `undefined` mientras llega o si no se pudo pedir. */
  readonly conteo = computed(() => (this.recurso.hasValue() ? this.recurso.value() : undefined));

  recargar(): void {
    this.recurso.reload();
  }
}
