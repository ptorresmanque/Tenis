import { httpResource } from '@angular/common/http';
import { computed, Service } from '@angular/core';

/** Espejo de `DatosDelClub` en la API. Los cuatro que son públicos. */
export interface DatosDelClub {
  nombre: string;
  direccion: string;
  telefono: string;
  email: string;
}

/**
 * Los datos de contacto del club, para el sitio público.
 *
 * **Un solo recurso compartido, no uno por pantalla.** Lo consultan el pie de
 * página —que está en todas—, la página del club, la confirmación y la pantalla de
 * portería; con un `httpResource` por componente serían cuatro peticiones para el
 * mismo dato que casi nunca cambia.
 *
 * Los campos vacíos son el caso normal mientras el club no los llene, así que quien
 * los muestra pregunta antes: media ficha de contacto en blanco se ve peor que una
 * ficha sin esa línea.
 */
@Service()
export class Club {
  private readonly recurso = httpResource<DatosDelClub>(() => '/api/club');

  readonly datos = computed(
    () =>
      this.recurso.value() ?? {
        // Mientras la primera consulta viaja: el nombre del club es lo único que
        // se puede afirmar sin haberlo preguntado, y sale igual del logotipo.
        nombre: 'FEDAL Tennis Center',
        direccion: '',
        telefono: '',
        email: '',
      },
  );

  /** A dónde escribir. Vacío si el club todavía no cargó un correo. */
  readonly email = computed(() => this.datos().email);
}
