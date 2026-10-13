import { httpResource } from '@angular/common/http';
import { computed, Service } from '@angular/core';

/** Una foto de un lugar del club (T185), con las dos direcciones de la API. */
export interface FotoDelLugar {
  id: number;
  /** El texto alternativo que escribió el admin, o nulo. */
  descripcion: string | null;
  miniatura: string;
  imagen: string;
}

/**
 * La tienda, la cafetería o el gimnasio del club (T184, T237), como información: el sitio no
 * vende nada. Sin descripción, el lugar no se muestra.
 */
export interface LugarDelClub {
  descripcion: string;
  /** Texto libre: "Lunes a sábado de 9:00 a 20:00". */
  horario: string;
  /** `56` y los 9 dígitos, o vacío. */
  whatsapp: string;
  /** Hasta seis, en el orden en que se subieron: la primera es la de la portada (T185). */
  fotos: FotoDelLugar[];
}

/** Un plan del gimnasio con sus dos precios, en pesos (T235). */
export interface TarifaDelGimnasio {
  nombre: string;
  precioSocioClp: number;
  precioNoSocioClp: number;
}

/** El gimnasio (T237): un lugar más, con sus tarifas en el orden que dejó el club. */
export interface GimnasioDelClub extends LugarDelClub {
  tarifas: TarifaDelGimnasio[];
}

/** Espejo de `ClubPublico` en la API. Lo que es público. */
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
  tienda: LugarDelClub;
  cafeteria: LugarDelClub;
  gimnasio: GimnasioDelClub;
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
          // Vacías: sin descripción no se muestran, que es lo correcto mientras no se sabe.
          tienda: { descripcion: '', horario: '', whatsapp: '', fotos: [] },
          cafeteria: { descripcion: '', horario: '', whatsapp: '', fotos: [] },
          gimnasio: { descripcion: '', horario: '', whatsapp: '', fotos: [], tarifas: [] },
        },
  );

  /** A dónde escribir. Vacío si el club todavía no cargó un correo. */
  readonly email = computed(() => this.datos().email);

  /**
   * Vuelve a preguntar. Lo llama el panel después de guardar los datos o los textos del
   * club: el recurso se pide una vez por visita, y sin esto quien guardaba una red y
   * volvía al sitio sin recargar la página seguía viendo la ficha de antes.
   */
  recargar(): void {
    this.recurso.reload();
  }
}
