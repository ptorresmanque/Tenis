import { Component, computed, inject } from '@angular/core';

import { Auth } from '../../core/auth/auth';
import { puedeVer } from '../../core/auth/tipos-del-panel';
import { PestanasDeLaPantalla } from '../../ui/pestanas-de-la-pantalla';

/**
 * La agenda del día y la ocupación de cancha, en una pantalla con pestañas (T285,
 * SPEC-panel.md D5). Cada pestaña es su ruta, así el enlace a la ocupación se comparte y la
 * ruta vieja `/administracion/ocupacion` redirige acá.
 *
 * **La ocupación es del admin.** El gestor recibe solo la pestaña de la agenda, y con una
 * pestaña no hay barra: no le diría nada, y la pestaña que falta se notaría como un hueco (A3).
 */
@Component({
  selector: 'app-panel-de-la-agenda',
  imports: [PestanasDeLaPantalla],
  template: `
    <header class="cabecera-panel">
      <div>
        <h1 class="titular text-4xl">Agenda del día</h1>
      </div>
    </header>

    <app-pestanas-de-la-pantalla etiqueta="Vistas de la agenda" [pestanas]="pestanas()" />
  `,
})
export class PanelDeLaAgenda {
  private readonly usuario = inject(Auth).usuario;

  /** La ocupación, solo si la puede ver: la misma regla del guard y del menú. */
  protected readonly pestanas = computed(() => [
    { ruta: '/administracion/reservas', etiqueta: 'Agenda' },
    ...(puedeVer('/administracion/reservas/ocupacion', this.usuario())
      ? [{ ruta: '/administracion/reservas/ocupacion', etiqueta: 'Ocupación' }]
      : []),
  ]);
}
