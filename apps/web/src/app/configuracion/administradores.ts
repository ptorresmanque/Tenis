import { Component, computed, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Esqueleto } from '../ui/esqueleto';

import { Auth } from '../core/auth/auth';
import { mensajeDelServidor } from '../core/errores';
import { Aviso } from '../ui/aviso';
import { Campo, CampoControl } from '../ui/campo';
import { Insignia } from '../ui/insignia';
import { Administradores as ApiAdministradores } from './administradores.service';

/**
 * Quién puede entrar al panel.
 *
 * Hasta ahora el rol se cambiaba escribiendo en la base. Las dos reglas que lo
 * hacen seguro viven en el servidor —nadie se quita el rol a sí mismo, y el club no
 * se queda sin administradores—; esta pantalla las **anticipa**, escondiendo el
 * botón que el servidor rechazaría, y muestra su mensaje cuando igual se intenta.
 * El guardia real es el de allá: este es cortesía.
 */
@Component({
  selector: 'app-administradores',
  imports: [Esqueleto, FormsModule, Aviso, Campo, CampoControl, Insignia],
  template: `
    <section aria-labelledby="nombrar">
      <h2 id="nombrar" class="font-display text-xl font-semibold">
        Dar acceso al panel
      </h2>
      <p class="mt-1 max-w-prose text-sm text-muted-foreground">
        La persona necesita tener cuenta en el club. Con el panel abierto ve los
        teléfonos de quienes reservan y puede cambiar las reglas.
      </p>

      <form class="mt-3 flex flex-wrap items-end gap-3" (ngSubmit)="nombrar()">
        <app-campo etiqueta="Correo" class="min-w-64 flex-1">
          <input
            appCampoControl
            name="correo"
            type="email"
            class="campo"
            [(ngModel)]="correo"
          />
        </app-campo>

        <button type="submit" class="boton boton-primario" [disabled]="enviando()">
          Dar acceso
        </button>
      </form>

      @if (error(); as falla) {
        <app-aviso variante="error" class="mt-3 block">{{ falla }}</app-aviso>
      } @else if (aviso(); as texto) {
        <app-aviso variante="exito" class="mt-3 block">{{ texto }}</app-aviso>
      }
    </section>

    <section class="mt-8" aria-labelledby="con-acceso">
      <div class="flex flex-wrap items-center gap-3">
        <h2 id="con-acceso" class="font-display text-xl font-semibold">
          Con acceso hoy
        </h2>
        <app-insignia variante="info" icono="shield_person">
          {{ administradores.value()?.length ?? 0 }}
        </app-insignia>
      </div>

      @if (administradores.isLoading()) {
        <app-esqueleto class="mt-3 block" [filas]="3" etiqueta="Cargando los administradores…" />
      } @else {
        <div class="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
          <table class="tabla">
            <caption class="sr-only">
              Personas con acceso al panel de administración
            </caption>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Correo</th>
                <th scope="col">Acceso</th>
              </tr>
            </thead>
            <tbody>
              @for (persona of administradores.value() ?? []; track persona.id) {
                <tr>
                  <td class="font-medium">{{ persona.nombre }}</td>
                  <td class="text-sm text-muted-foreground">{{ persona.email }}</td>
                  <td>
                    @if (persona.id === yo()?.id) {
                      <!-- Sin botón para uno mismo: es el clic con el que alguien
                           se deja afuera del panel y después necesita la base de
                           datos para volver. El servidor también lo rechaza. -->
                      <app-insignia variante="neutro" icono="person">
                        Eres tú
                      </app-insignia>
                    } @else {
                      <button
                        type="button"
                        class="boton boton-secundario boton-chico border-destructive
                               text-destructive"
                        [disabled]="enviando()"
                        (click)="quitar(persona.id, persona.nombre)"
                      >
                        Quitar acceso
                        <span class="sr-only">a {{ persona.nombre }}</span>
                      </button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
})
export class AdministradoresPanel {
  private readonly api = inject(ApiAdministradores);

  protected readonly yo = inject(Auth).usuario;

  protected correo = '';
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  private readonly version = signal(0);

  protected readonly administradores = resource({
    params: () => ({ version: this.version() }),
    loader: () => this.api.listar(),
  });

  protected readonly cuantos = computed(
    () => this.administradores.value()?.length ?? 0,
  );

  protected async nombrar(): Promise<void> {
    const email = this.correo.trim().toLowerCase();

    this.error.set(null);
    this.aviso.set(null);

    if (!email) {
      this.error.set('Escribe el correo de la persona.');
      return;
    }

    this.enviando.set(true);

    try {
      const persona = await this.api.nombrar(email);
      this.aviso.set(`${persona.nombre} ya puede entrar al panel.`);
      this.correo = '';
      this.recargar();
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla, 'No se pudo dar el acceso.'));
    } finally {
      this.enviando.set(false);
    }
  }

  protected async quitar(id: number, nombre: string): Promise<void> {
    this.error.set(null);
    this.aviso.set(null);
    this.enviando.set(true);

    try {
      await this.api.quitar(id);
      this.aviso.set(`${nombre} ya no tiene acceso al panel.`);
      this.recargar();
    } catch (falla) {
      // El mensaje del servidor tal cual: es el que explica que era la última
      // persona con acceso, y esa frase ya está escrita para leerse.
      this.error.set(mensajeDelServidor(falla, 'No se pudo quitar el acceso.'));
    } finally {
      this.enviando.set(false);
    }
  }

  private recargar(): void {
    this.version.update((veces) => veces + 1);
  }
}
