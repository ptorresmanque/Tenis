import { Component, computed, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';

import { proveerCampos } from '../../ui/campos';
import { diaConAnioEnPalabras, fechaEnElClub } from '../../catalogo-canchas/reloj-del-club';
import { Profesores } from '../../clases/profesores.service';
import { Auth } from '../../core/auth/auth';
import { mensajeDelServidor } from '../../core/errores';
import { TelefonoPipe } from '../../core/telefono';
import { Aviso } from '../../ui/aviso';
import { Esqueleto } from '../../ui/esqueleto';
import { Insignia } from '../../ui/insignia';
import { AltaDeSocio, Socios } from './socios.service';
import { UsuarioDeLaLista, Usuarios } from './usuarios.service';

/**
 * Todas las cuentas del club y sus tipos (T223, `SPEC-identidad.md` § Tipos de usuario).
 *
 * Reemplaza a Administradores, que solo daba el admin. Admin y gestor son casillas que
 * guardan al tiro; las dos reglas del admin —nadie se lo quita a sí mismo, y el club no
 * se queda sin admins— viven en el servidor, y esta pantalla anticipa la primera
 * desactivando la casilla propia. Si el servidor igual rechaza algo, se lee su mensaje y
 * la casilla vuelve a como estaba.
 *
 * **Socio y profesor son fichas** y se dan desde la fila con los endpoints de sus
 * módulos (T224): la invitación de Socios, que con un correo que ya tiene cuenta crea la
 * ficha en el acto, y la cuenta de la ficha de `clases`.
 */
@Component({
  selector: 'app-usuarios',
  imports: [
    MatFormFieldModule,
    MatInput,
    MatButton,
    FormsModule,
    RouterLink,
    Aviso,
    Esqueleto,
    Insignia,
    TelefonoPipe,
  ],
  providers: [proveerCampos()],
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
      <mat-form-field class="min-w-64 flex-1">
        <mat-label>Buscar por nombre o correo</mat-label>
        <input
          matInput
          name="busqueda"
          type="search"
          [(ngModel)]="textoBuscado"
        />
      </mat-form-field>
      <button matButton="outlined" type="submit">Buscar</button>
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

              <div class="flex basis-full flex-wrap gap-2">
                @if (!usuario.socio) {
                  <button
                    matButton="outlined"
                    type="button"
                    class="chico"
                    [disabled]="trabajando()"
                    (click)="abrir(usuario, 'socio')"
                  >
                    Hacer socio
                    <span class="sr-only">a {{ usuario.nombre }} {{ usuario.apellido }}</span>
                  </button>
                }
                @if (usuario.profesor; as profesor) {
                  <button
                    matButton
                    type="button"
                    class="chico"
                    [disabled]="trabajando()"
                    [attr.aria-busy]="enCurso() === 'quitar-' + usuario.id"
                    (click)="quitarProfesor(usuario, profesor.id)"
                  >
                    Quitar profesor
                    <span class="sr-only">a {{ usuario.nombre }} {{ usuario.apellido }}</span>
                  </button>
                } @else {
                  <button
                    matButton="outlined"
                    type="button"
                    class="chico"
                    [disabled]="trabajando()"
                    (click)="abrir(usuario, 'profesor')"
                  >
                    Hacer profesor
                    <span class="sr-only">a {{ usuario.nombre }} {{ usuario.apellido }}</span>
                  </button>
                }
              </div>

              @if (abierta(); as abierta) {
                @if (abierta.id === usuario.id && abierta.accion === 'socio') {
                  <form
                    class="flex basis-full flex-wrap items-end gap-3"
                    (ngSubmit)="hacerSocio(usuario)"
                  >
                    <mat-form-field class="min-w-48">
                      <mat-label>Número de socio (opcional)</mat-label>
                      <input
                        matInput
                        name="numero-socio"
                        [(ngModel)]="numeroSocio"
                      />
                    </mat-form-field>
                    <!-- Hacer socio y hacer profesor se excluyen: se abre uno a la vez.
                         mat-guidelines-ignore: multiples-filled -->
                    <button
                      matButton="filled"
                      type="submit"
                      class="chico"
                      [disabled]="trabajando()"
                      [attr.aria-busy]="enCurso() === 'socio-' + usuario.id"
                    >
                      Confirmar
                    </button>
                    <button matButton type="button" class="chico" (click)="cerrar()">
                      Cancelar
                    </button>
                    <p class="basis-full text-sm text-muted-foreground">
                      Sin número se le da el siguiente, y queda al día hasta fin de mes. El resto de
                      la ficha se cambia en Socios.
                    </p>
                  </form>
                }
                @if (abierta.id === usuario.id && abierta.accion === 'profesor') {
                  <form
                    class="grid basis-full gap-3 sm:grid-cols-2"
                    (ngSubmit)="hacerProfesor(usuario)"
                  >
                    <mat-form-field class="sm:col-span-2">
                      <mat-label>Ficha de profesor</mat-label>
                      <select matNativeControl name="ficha" [(ngModel)]="ficha">
                        <option value="" disabled>Elige una ficha</option>
                        @for (sinCuenta of fichasSinCuenta(); track sinCuenta.id) {
                          <option [value]="sinCuenta.id">
                            {{ sinCuenta.nombreVisible }} · {{ sinCuenta.especialidad }}
                          </option>
                        }
                        <option value="nueva">Crear una ficha nueva</option>
                      </select>
                    </mat-form-field>
                    @if (ficha === 'nueva') {
                      <mat-form-field>
                        <mat-label>Nombre con que se anuncia</mat-label>
                        <input
                          matInput
                          name="nombre-visible"
                          [(ngModel)]="fichaNueva.nombreVisible"
                        />
                      </mat-form-field>
                      <mat-form-field>
                        <mat-label>Teléfono</mat-label>
                        <input
                          matInput
                          name="telefono"
                          type="tel"
                          [(ngModel)]="fichaNueva.telefono"
                        />
                      </mat-form-field>
                      <mat-form-field class="sm:col-span-2">
                        <mat-label>Especialidad</mat-label>
                        <input
                          matInput
                          name="especialidad"
                          [(ngModel)]="fichaNueva.especialidad"
                        />
                      </mat-form-field>
                    }
                    <div class="flex flex-wrap gap-2 sm:col-span-2">
                      <button
                        matButton="filled"
                        type="submit"
                        class="chico"
                        [disabled]="trabajando()"
                        [attr.aria-busy]="enCurso() === 'profesor-' + usuario.id"
                      >
                        Confirmar
                      </button>
                      <button
                        matButton
                        type="button"
                        class="chico"
                        (click)="cerrar()"
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                }
              }
            </li>
          }
        </ul>

        @if (paginas() > 1) {
          <nav aria-label="Páginas de usuarios" class="mt-3 flex flex-wrap items-center gap-3">
            <button
              matButton="outlined"
              type="button"
              class="chico"
              [disabled]="pagina() === 1"
              (click)="irA(pagina() - 1)"
            >
              Anterior
            </button>
            <span class="text-sm">Página {{ pagina() }} de {{ paginas() }}</span>
            <button
              matButton="outlined"
              type="button"
              class="chico"
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
  private readonly socios = inject(Socios);
  private readonly profesores = inject(Profesores);

  protected readonly yo = inject(Auth).usuario;

  protected textoBuscado = '';
  private readonly busqueda = signal('');
  protected readonly pagina = signal(1);

  protected readonly trabajando = signal(false);
  /** Qué acción está viajando, para que gire su botón y no todos (T154). */
  protected readonly enCurso = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  protected readonly listado = resource({
    params: () => ({ q: this.busqueda(), pagina: this.pagina() }),
    loader: ({ params }) => this.api.listar(params.q, params.pagina),
  });

  /** Qué fila tiene abierto su formulario, y cuál. Una a la vez. */
  protected readonly abierta = signal<{ id: number; accion: 'socio' | 'profesor' } | null>(null);
  protected numeroSocio = '';
  /** El id de una ficha sin cuenta, `'nueva'` o vacío. */
  protected ficha = '';
  protected fichaNueva = { nombreVisible: '', telefono: '', especialidad: '' };

  /** Las fichas que no tienen cuenta: las únicas que se pueden vincular. Solo al abrir. */
  private readonly todasLasFichas = resource({
    params: () => (this.abierta()?.accion === 'profesor' ? true : undefined),
    loader: () => this.profesores.listar(),
  });
  protected readonly fichasSinCuenta = computed(() =>
    (this.todasLasFichas.hasValue() ? this.todasLasFichas.value() : []).filter(
      (ficha) => ficha.usuarioId === null,
    ),
  );

  protected readonly paginas = computed(() => {
    const listado = this.listado.hasValue() ? this.listado.value() : null;
    return listado ? Math.max(1, Math.ceil(listado.total / listado.porPagina)) : 1;
  });

  protected abrir(usuario: UsuarioDeLaLista, accion: 'socio' | 'profesor'): void {
    this.numeroSocio = '';
    this.ficha = '';
    this.fichaNueva = {
      nombreVisible: `${usuario.nombre} ${usuario.apellido}`,
      telefono: usuario.telefono ?? '',
      especialidad: '',
    };
    this.abierta.set({ id: usuario.id, accion });
  }

  protected cerrar(): void {
    this.abierta.set(null);
  }

  /** La invitación de Socios: con un correo que ya tiene cuenta, la ficha nace al tiro. */
  protected async hacerSocio(usuario: UsuarioDeLaLista): Promise<void> {
    const datos: AltaDeSocio = { email: usuario.email };
    if (this.numeroSocio.trim()) datos.numeroSocio = this.numeroSocio.trim();

    await this.hacer(
      `socio-${usuario.id}`,
      () => this.socios.invitar(datos),
      `${usuario.nombre} ${usuario.apellido} ya tiene ficha de socio.`,
    );
  }

  protected async hacerProfesor(usuario: UsuarioDeLaLista): Promise<void> {
    if (this.ficha === '') {
      this.error.set('Elige una ficha o crea una nueva.');
      return;
    }

    await this.hacer(
      `profesor-${usuario.id}`,
      () =>
        this.ficha === 'nueva'
          ? this.profesores.crear({ ...this.fichaNueva, tarifaHoraClp: null }, usuario.id)
          : this.profesores.vincular(Number(this.ficha), usuario.id),
      `${usuario.nombre} ${usuario.apellido} ya entra a Clases.`,
    );
  }

  /** Desvincula: la ficha y sus clases quedan, y la persona deja de entrar a Clases. */
  protected async quitarProfesor(usuario: UsuarioDeLaLista, fichaId: number): Promise<void> {
    const nombre = `${usuario.nombre} ${usuario.apellido}`;
    if (
      !window.confirm(
        `¿Quitarle Clases a ${nombre}? La ficha y sus clases quedan; solo deja de entrar.`,
      )
    ) {
      return;
    }

    await this.hacer(
      `quitar-${usuario.id}`,
      () => this.profesores.desvincular(fichaId),
      `${nombre} ya no entra a Clases.`,
    );
  }

  private async hacer(clave: string, accion: () => Promise<unknown>, exito: string): Promise<void> {
    this.error.set(null);
    this.aviso.set(null);
    this.trabajando.set(true);
    this.enCurso.set(clave);

    try {
      await accion();
      this.aviso.set(exito);
      this.abierta.set(null);
      this.listado.reload();
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla, 'No se pudo guardar el cambio.'));
    } finally {
      this.trabajando.set(false);
      this.enCurso.set(null);
    }
  }

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
