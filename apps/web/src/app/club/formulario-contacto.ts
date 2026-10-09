import { Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { mensajeDelServidor } from '../core/errores';
import { Aviso } from '../ui/aviso';
import { Campo, CampoControl } from '../ui/campo';
import { Contacto, TipoSolicitud } from './contacto.service';
import { TelefonoDirective } from '../ui/telefono';

const TIPOS: { valor: TipoSolicitud; etiqueta: string }[] = [
  { valor: 'SOCIO', etiqueta: 'Quiero asociarme' },
  { valor: 'CLASES', etiqueta: 'Pregunto por clases' },
  { valor: 'EMPRESA', etiqueta: 'Arrendar para una empresa o evento' },
  { valor: 'OTRO', etiqueta: 'Otra cosa' },
];

function enBlanco(tipo: TipoSolicitud = 'SOCIO') {
  return {
    tipo,
    nombre: '',
    email: '',
    telefono: '',
    mensaje: '',
  };
}

/**
 * El formulario del sitio: por acá entra quien todavía no es del club.
 *
 * Es la única pantalla que cierra la problemática 2.5 del perfil —"no existe un lugar
 * al cual dirigir a un interesado en asociarse"—, y por eso **no pide cuenta**: exigir
 * registro para preguntar cómo asociarse es la barrera que esto viene a sacar.
 *
 * El selector de tipo va primero y no al final: es lo que decide a qué manos llega la
 * consulta, y preguntarlo después de que la persona escribió todo lo demás invita a
 * dejarlo en el valor por defecto.
 */
@Component({
  selector: 'app-formulario-contacto',
  imports: [FormsModule, Aviso, Campo, CampoControl, TelefonoDirective],
  template: `
    <section aria-labelledby="titulo-contacto">
      <h2 id="titulo-contacto" class="titular text-5xl sm:text-6xl">Escríbenos</h2>
      <p class="mt-1 max-w-prose text-muted-foreground">
        Cuéntanos qué necesitas y te contestamos. No hace falta tener cuenta.
      </p>

      @if (enviado()) {
        <app-aviso variante="exito" titulo="Recibimos tu mensaje" class="mt-4 block">
          Te vamos a contestar al contacto que dejaste. Si es urgente, llámanos al
          club.
        </app-aviso>
      } @else {
        <form class="mt-4 grid max-w-xl gap-4" (ngSubmit)="enviar()">
          <app-campo etiqueta="¿De qué se trata?">
            <select appCampoControl name="tipo" class="campo" [(ngModel)]="datos.tipo">
              @for (opcion of TIPOS; track opcion.valor) {
                <option [value]="opcion.valor">{{ opcion.etiqueta }}</option>
              }
            </select>
          </app-campo>

          <app-campo etiqueta="Tu nombre">
            <input appCampoControl name="nombre" class="campo" [(ngModel)]="datos.nombre" />
          </app-campo>

          <div class="grid gap-4 sm:grid-cols-2">
            <app-campo etiqueta="Correo">
              <input
                appCampoControl
                name="email"
                type="email"
                class="campo"
                [(ngModel)]="datos.email"
              />
            </app-campo>

            <app-campo etiqueta="Teléfono">
              <span class="campo-con-prefijo">
                <span class="prefijo" aria-hidden="true">+56</span>
                <input
                  appTelefono
                  appCampoControl
                  name="telefono"
                  class="campo"
                  [(ngModel)]="datos.telefono"
                />
              </span>
            </app-campo>
          </div>

          <!-- Uno de los dos, no los dos: pedir ambos obligatorios pierde a quien no
               quiere dar el teléfono, y el club solo necesita una forma de contestar. -->
          <p class="-mt-2 text-sm text-muted-foreground">
            Con uno de los dos alcanza.
          </p>

          <app-campo etiqueta="Tu mensaje" ayuda="Opcional.">
            <textarea
              appCampoControl
              name="mensaje"
              rows="3"
              class="campo"
              [(ngModel)]="datos.mensaje"
            ></textarea>
          </app-campo>

          @if (error(); as falla) {
            <app-aviso variante="error">{{ falla }}</app-aviso>
          }

          <div>
            <button type="submit" class="boton boton-primario" [disabled]="enviando()">
              Enviar
            </button>
          </div>
        </form>
      }
    </section>
  `,
})
export class FormularioContacto {
  private readonly api = inject(Contacto);

  protected readonly TIPOS = TIPOS;

  /**
   * Con qué consulta llega la persona.
   *
   * La página de clases lo pone en `CLASES`: quien llegó ahí ya dijo qué busca, y
   * hacerle elegir de nuevo en una lista donde "quiero asociarme" está primero es
   * una invitación a mandar la consulta al buzón equivocado.
   */
  readonly tipoInicial = input<TipoSolicitud>('SOCIO');

  protected readonly datos = enBlanco();

  constructor() {
    // En un `effect` y no leyendo el input al construir el objeto: los inputs llegan
    // después de que la clase se construye, así que ahí `tipoInicial()` todavía vale
    // su valor por defecto y la página de clases mandaba la consulta como "socio".
    effect(() => {
      this.datos.tipo = this.tipoInicial();
    });
  }

  protected readonly enviando = signal(false);
  protected readonly enviado = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async enviar(): Promise<void> {
    this.error.set(null);
    this.enviando.set(true);

    try {
      // Una copia y no el objeto del formulario: abajo se vacía para que no quede
      // escrito en pantalla, y mandarlo por referencia significa que quien lo reciba
      // —hoy el cliente HTTP, mañana cualquier cosa que lo lea tarde— se encuentre
      // con los campos ya en blanco.
      await this.api.enviar({ ...this.datos });
      this.enviado.set(true);
      Object.assign(this.datos, enBlanco(this.tipoInicial()));
    } catch (falla) {
      // El del servidor: "Deja un correo o un teléfono" dice qué corregir, y el 429
      // dice cuánto esperar. Las dos frases están escritas para leerse.
      this.error.set(
        mensajeDelServidor(falla, 'No se pudo enviar. Reintenta en un momento.'),
      );
    } finally {
      this.enviando.set(false);
    }
  }
}
