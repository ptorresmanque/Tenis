import { Component, computed, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { diaConAnioEnPalabras, fechaEnElClub } from '../../catalogo-canchas/reloj-del-club';
import { Auth } from '../../core/auth/auth';
import { mensajeDelServidor } from '../../core/errores';
import { TelefonoPipe } from '../../core/telefono';
import { Aviso } from '../../ui/aviso';
import { Campo, CampoControl } from '../../ui/campo';
import { Esqueleto } from '../../ui/esqueleto';
import { Insignia } from '../../ui/insignia';
import { UsuarioDeLaLista, Usuarios } from './usuarios.service';

/**
 * Todas las cuentas del club y sus tipos (T223, `SPEC-identidad.md` § Tipos de usuario).
 *
 * Reemplaza a Administradores, que solo daba el admin. Admin y gestor son casillas que
 * guardan al tiro; las dos reglas del admin —nadie se lo quita a sí mismo, y el club no
 * se queda sin admins— viven en el servidor, y esta pantalla anticipa la primera
 * desactivando la casilla propia. Si el servidor igual rechaza algo, se lee su mensaje y
 * la casilla vuelve a como estaba.
 */
@Component({
  selector: 'app-usuarios',
  imports: [FormsModule, RouterLink, Aviso, Campo, CampoControl, Esqueleto, Insignia, TelefonoPipe],
  template: `
    <header class="cabecera-panel">
      <div>
        <h1 class="titular text-4xl">Usuarios</h1>
        <p class="mt-1 text-muted-foreground">
          Todas las cuentas del club. Admin ve todo el panel; gestor, solo la agenda del día y sus
          observaciones.
        </p>
      </div>
    </header>

    <form role="search" class="mt-4 flex flex-wrap items-end gap-3" (ngSubmit)="buscar()">
      <app-campo etiqueta="Buscar por nombre o correo" class="min-w-64 flex-1">
        <input
          appCampoControl
          name="busqueda"
          type="search"
          class="campo"
          [(ngModel)]="textoBuscado"
        />
      </app-campo>
      <button type="submit" class="boton boton-secundario">Buscar</button>
    </form>

    @if (error(); as falla) {
      <app-aviso variante="error" class="mt-3 block">{{ falla }}</app-aviso>
    } @else if (aviso(); as texto) {
      <app-aviso variante="exito" class="mt-3 block">{{ texto }}</app-aviso>
    }

    @if (listado.error()) {
      <p class="mt-4 text-destructive">No se pudo cargar la lista. Reintenta en un momento.</p>
    } @else if (listado.hasValue()) {
      <p class="mt-4 text-sm text-muted-foreground">
        {{ listado.value().total }} {{ listado.value().total === 1 ? 'usuario' : 'usuarios' }}
      </p>

      @if (listado.value().usuarios.length === 0) {
        <p class="mt-3">No hay usuarios con esa búsqueda.</p>
      } @else {
        <ul class="mt-2 divide-y divide-border rounded-xl border border-border bg-card">
          @for (usuario of listado.value().usuarios; track usuario.id) {
            <li class="flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
              <div class="min-w-0 flex-1 basis-60">
                <p class="font-medium">
                  {{ usuario.nombre }} {{ usuario.apellido }}
                  @if (usuario.id === yo()?.id) {
                    <app-insignia variante="neutro" icono="person">Eres tú</app-insignia>
                  }
                </p>
                <p class="text-sm break-all text-muted-foreground">
                  {{ usuario.email }}
                  @if (usuario.telefono) {
                    · {{ usuario.telefono | telefono }}
                  }
                </p>
                <p class="text-xs text-muted-foreground">Desde el {{ desde(usuario.creadoEn) }}</p>
              </div>

              <div class="flex flex-wrap gap-2">
                @if (usuario.socio; as socio) {
                  <a routerLink="/administracion/socios">
                    <app-insignia variante="info" icono="group">
                      Socio N° {{ socio.numeroSocio }}
                    </app-insignia>
                  </a>
                }
                @if (usuario.profesor; as profesor) {
                  <app-insignia variante="neutro" icono="school">
                    Profesor{{ profesor.activo ? '' : ' (inactivo)' }}
                  </app-insignia>
                }
              </div>

              <div class="flex gap-4">
                <label class="inline-flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    class="size-5"
                    [attr.name]="'admin-' + usuario.id"
                    [checked]="usuario.esAdmin"
                    [disabled]="usuario.id === yo()?.id || trabajando()"
                    (change)="cambiar(usuario, 'esAdmin', $event)"
                  />
                  Admin
                  <span class="sr-only">: {{ usuario.nombre }} {{ usuario.apellido }}</span>
                </label>
                <label class="inline-flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    class="size-5"
                    [attr.name]="'gestor-' + usuario.id"
                    [checked]="usuario.esGestor"
                    [disabled]="trabajando()"
                    (change)="cambiar(usuario, 'esGestor', $event)"
                  />
                  Gestor
                  <span class="sr-only">: {{ usuario.nombre }} {{ usuario.apellido }}</span>
                </label>
              </div>
            </li>
          }
        </ul>

        @if (paginas() > 1) {
          <nav aria-label="Páginas de usuarios" class="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              class="boton boton-secundario boton-chico"
              [disabled]="pagina() === 1"
              (click)="irA(pagina() - 1)"
            >
              Anterior
            </button>
            <span class="text-sm">Página {{ pagina() }} de {{ paginas() }}</span>
            <button
              type="button"
              class="boton boton-secundario boton-chico"
              [disabled]="pagina() === paginas()"
              (click)="irA(pagina() + 1)"
            >
              Siguiente
            </button>
          </nav>
        }
      }
    } @else {
      <app-esqueleto class="mt-4 block" [filas]="5" etiqueta="Cargando los usuarios…" />
    }
  `,
})
export class UsuariosPanel {
  private readonly api = inject(Usuarios);

  protected readonly yo = inject(Auth).usuario;

  protected textoBuscado = '';
  private readonly busqueda = signal('');
  protected readonly pagina = signal(1);

  protected readonly trabajando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  protected readonly listado = resource({
    params: () => ({ q: this.busqueda(), pagina: this.pagina() }),
    loader: ({ params }) => this.api.listar(params.q, params.pagina),
  });

  protected readonly paginas = computed(() => {
    const listado = this.listado.hasValue() ? this.listado.value() : null;
    return listado ? Math.max(1, Math.ceil(listado.total / listado.porPagina)) : 1;
  });

  protected desde(instante: string): string {
    return diaConAnioEnPalabras(fechaEnElClub(instante));
  }

  protected buscar(): void {
    this.busqueda.set(this.textoBuscado.trim());
    this.pagina.set(1);
  }

  protected irA(pagina: number): void {
    this.pagina.set(pagina);
  }

  protected async cambiar(
    usuario: UsuarioDeLaLista,
    tipo: 'esAdmin' | 'esGestor',
    evento: Event,
  ): Promise<void> {
    const casilla = evento.target as HTMLInputElement;
    const nombre = `${usuario.nombre} ${usuario.apellido}`;
    const etiqueta = tipo === 'esAdmin' ? 'admin' : 'gestor';

    this.error.set(null);
    this.aviso.set(null);
    this.trabajando.set(true);

    try {
      await this.api.cambiar(usuario.id, { [tipo]: casilla.checked });
      this.aviso.set(
        casilla.checked ? `${nombre} ahora es ${etiqueta}.` : `${nombre} ya no es ${etiqueta}.`,
      );
    } catch (falla) {
      // La lista vuelve igual que antes y el `[checked]` no cambia de valor, así que no
      // repinta: la casilla que el clic marcó se devuelve a mano.
      casilla.checked = !casilla.checked;
      this.error.set(mensajeDelServidor(falla, 'No se pudo guardar el cambio.'));
    } finally {
      this.trabajando.set(false);
      // `reload` y no un parámetro nuevo: conserva la lista mientras recarga, sin que
      // desaparezca y vuelva en cada casilla.
      this.listado.reload();
    }
  }
}
