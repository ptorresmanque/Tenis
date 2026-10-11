import { Component, computed, input, model, output } from '@angular/core';

import { CampoFecha } from '../../ui/campo-fecha';
import { Insignia } from '../../ui/insignia';
import { Selector } from '../../ui/selector';
import { Cancha, DuracionMin } from '../disponibilidad';
import { diaEnPalabras, proximosDias } from '../reloj-del-club';

const FILTROS = [
  { valor: 'todas', etiqueta: 'Todas' },
  { valor: 'techadas', etiqueta: 'Techadas' },
  { valor: 'iluminacion', etiqueta: 'Con iluminación' },
  { valor: 'aire-libre', etiqueta: 'Al aire libre' },
];

/**
 * Si la cancha pasa el filtro elegido. Junto a `FILTROS`: las opciones y lo que significa
 * cada una se leen en el mismo lugar.
 *
 * "Al aire libre" es lo contrario de techada y no un atributo propio: si fuera un tercer
 * campo del modelo, tarde o temprano existiría una cancha marcada como techada y al aire
 * libre a la vez.
 */
export function pasaElFiltro(cancha: Cancha, filtro: string): boolean {
  switch (filtro) {
    case 'techadas':
      return cancha.techada;
    case 'iluminacion':
      return cancha.iluminacion;
    case 'aire-libre':
      return !cancha.techada;
    default:
      return true;
  }
}

/**
 * Qué se mira en la grilla: el día, la duración y el filtro de canchas, con la leyenda.
 *
 * La duración no es un `model` porque vive en la URL (T83b): la grilla la cambia ahí, y
 * esto solo avisa la elegida.
 */
@Component({
  selector: 'app-controles-del-dia',
  imports: [CampoFecha, Insignia, Selector],
  host: { class: 'contents' },
  template: `
    <div class="mt-4 flex flex-wrap items-end gap-4">
      <!-- La semana a un toque. El calendario sigue estando al lado para ir más
           lejos: siete chips cubren lo que la gente reserva de verdad, y el resto
           no justifica un calendario propio pudiendo usar el del sistema.

           A ancho completo: compartiendo fila con el campo de fecha, los siete
           chips no llegaban a encogerse. -->
      <app-selector
        class="w-full"
        etiqueta="Día"
        estilo="chips"
        [opciones]="chipsDeDia()"
        [valor]="fecha()"
        (valorChange)="fecha.set($event)"
      />

      <div>
        <label for="fecha" class="block text-sm font-medium">Otro día</label>
        <!-- El cursor y el borde que responde: sin eso, el campo se lee como una
             etiqueta con una fecha escrita y nadie prueba a abrirlo. -->
        <app-campo-fecha
          class="mt-1"
          inputId="fecha"
          claseCampo="w-36 cursor-pointer py-2 transition-colors hover:border-primary"
          [valor]="fecha()"
          (valorChange)="cambiarFecha($event)"
        />
      </div>
    </div>

    <p class="mt-3 text-muted-foreground">{{ diaEnPalabras(fecha()) }}</p>

    <!-- También al mover (T87): parte en la de la reserva, que trae el enlace de "mis
         reservas", y cambiarla es alargarla o acortarla. -->
    <app-selector
      class="mt-4 block"
      etiqueta="Duración"
      [opciones]="DURACIONES"
      [valor]="'' + duracion()"
      (valorChange)="cambiarDuracion.emit($event)"
    />

    <!-- Los filtros salen de lo que la cancha ya declara —techada e
         iluminación—, así que filtran en el navegador sobre lo que ya llegó:
         una consulta más al servidor no traería nada nuevo. -->
    <app-selector
      class="mt-4 block"
      etiqueta="Filtrar canchas"
      [opciones]="FILTROS"
      [valor]="filtro()"
      (valorChange)="filtro.set($event)"
    />

    <!-- La leyenda no es decoración: la celda libre, la que no tiene y la hora pico se
         distinguen por color, y esto es lo que dice qué significa cada uno. Cada celda
         sin libres dice además por qué (T103). -->
    <ul class="mt-4 flex flex-wrap gap-2">
      <li><app-insignia variante="libre">Libre</app-insignia></li>
      <li><app-insignia variante="neutro" icono="lock">Sin libres</app-insignia></li>
      <li><app-insignia variante="aviso" icono="trending_up">Hora pico</app-insignia></li>
    </ul>
  `,
})
export class ControlesDelDia {
  readonly fecha = model.required<string>();
  readonly duracion = input.required<DuracionMin>();
  readonly filtro = model.required<string>();

  /** "60" o "90", como los valores del selector. */
  readonly cambiarDuracion = output<string>();

  protected readonly DURACIONES = [
    { valor: '60', etiqueta: '1 hora' },
    { valor: '90', etiqueta: '1 hora y media' },
  ];

  protected readonly FILTROS = FILTROS;

  /** Los siete chips de la tira de días, empezando por hoy. */
  protected readonly chipsDeDia = computed(() =>
    proximosDias(7).map((dia) => ({
      valor: dia.fecha,
      etiqueta: dia.etiqueta,
      sub: dia.numero,
    })),
  );

  protected cambiarFecha(valor: string): void {
    // El input vacío —se puede borrar con el teclado— no dispara una consulta
    // que la API va a rechazar.
    if (valor) {
      this.fecha.set(valor);
    }
  }

  protected readonly diaEnPalabras = diaEnPalabras;
}
