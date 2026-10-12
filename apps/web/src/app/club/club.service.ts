import { httpResource } from '@angular/common/http';
import { computed, Service } from '@angular/core';

/** Espejo de `DatosDelClub` en la API. Lo que es público. */
export interface DatosDelClub {
  nombre: string;
  direccion: string;
  telefono: string;
  email: string;
  /** Dónde está el club, para el mapa (T100). Nulas mientras no se cargue. */
  latitud: number | null;
  longitud: number | null;
  /** Las redes (T140): el enlace del perfil, o vacío si el club no la tiene. */
  instagram: string;
  facebook: string;
  tiktok: string;
  youtube: string;
  /** El número de WhatsApp, `56` y los 9 dígitos. */
  whatsapp: string;
  /** Los textos de "El club" (T142). La bajada y el de las canchas pueden venir vacíos. */
  elClubTitulo: string;
  elClubBajada: string;
  elClubCanchas: string;
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

  readonly datos = computed(() =>
    // `hasValue()` y no `value() ?? …`: `value()` lanza si la consulta falló, y esto
    // lo lee el pie de todas las pantallas.
    this.recurso.hasValue()
      ? this.recurso.value()
      : {
          // Mientras la primera consulta viaja, o si falló: el nombre del club es lo
          // único que se puede afirmar sin haberlo preguntado, y sale igual del
          // logotipo.
          nombre: 'FEDAL Tennis Center',
          direccion: '',
          telefono: '',
          email: '',
          latitud: null,
          longitud: null,
          instagram: '',
          facebook: '',
          tiktok: '',
          youtube: '',
          whatsapp: '',
          // Los textos de "El club", los mismos que la migración puso por omisión (T142):
          // mientras la consulta viaja, la página muestra lo de siempre y no salta.
          elClubTitulo: 'FEDAL Tennis Center',
          elClubBajada:
            'Un club de barrio con canchas de torneo. Desde 2008, abierto a socios y a ' +
            'quien quiera venir a jugar una hora.',
          elClubCanchas:
            'Todas de superficie dura y velocidad media, como el Australian Open. Las dos ' +
            'centrales se llaman Basilea y Manacor, y el club no da más explicaciones.',
        },
  );

  /** A dónde escribir. Vacío si el club todavía no cargó un correo. */
  readonly email = computed(() => this.datos().email);
}
