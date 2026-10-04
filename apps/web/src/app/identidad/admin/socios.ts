import {
  Component,
  computed,
  effect,
  inject,
  resource,
  signal,
  untracked,
} from '@angular/core';

import { Esqueleto } from '../../ui/esqueleto';
import { FormsModule } from '@angular/forms';

import { hoyEnElClub } from '../../catalogo-canchas/reloj-del-club';
import { mensajeDelServidor } from '../../core/errores';
import { Aviso } from '../../ui/aviso';
import { Campo, CampoControl } from '../../ui/campo';
import { EstadoVacio } from '../../ui/estado-vacio';
import { Insignia } from '../../ui/insignia';
import { Paginacion } from '../../ui/paginacion';
import { Selector } from '../../ui/selector';
import { FichaSocio } from './ficha-socio';
import {
  AltaDeSocio,
  EstadoSocio,
  SocioDelClub,
  Socios,
} from './socios.service';

const ESTADOS: Record<EstadoSocio, string> = {
  ACTIVO: 'Activo',
  SUSPENDIDO: 'Suspendido',
  RETIRADO: 'Retirado',
};

interface Formulario {
  email: string;
  numeroSocio: string;
  alDiaHasta: string;
}

const EN_BLANCO: Formulario = { email: '', numeroSocio: '', alDiaHasta: '' };

/**
 * Los socios del club, desde la administración.
 *
 * El alta pide **solo el correo**: el club asigna el número correlativo y deja al
 * socio al día hasta fin de mes. Pedir los tres datos convertiría el caso normal
 * —"lo aceptamos, mándale la invitación"— en un formulario que hay que estudiar.
 */
@Component({
  selector: 'app-socios',
  imports: [Esqueleto, 
    FormsModule,
    Aviso,
    Campo,
    CampoControl,
    EstadoVacio,
    Insignia,
    Paginacion,
    Selector,
    FichaSocio,
  ],
  template: `
    <!-- La cabecera del panel (TV7.1), sin acción: dar de alta es su sección. -->
    <header class="cabecera-panel">
      <h1 class="titular text-4xl">Socios del club</h1>
    </header>

    <section class="mt-6" aria-labelledby="titulo-alta">
      <h2 id="titulo-alta" class="rotulo-seccion">
        Dar de alta un socio
      </h2>
      <p class="mt-2 text-sm text-muted-foreground">
        Alcanza con el correo. Cuando esa persona cree su cuenta —con contraseña o
        con Google— le aparece la ficha de socio sola.
      </p>

      <form class="mt-3 flex flex-wrap items-end gap-3" (ngSubmit)="invitar()">
        <app-campo etiqueta="Correo" class="w-64">
          <input
            appCampoControl
            id="email-socio"
            name="email-socio"
            type="email"
            class="campo"
            [(ngModel)]="formulario.email"
          />
        </app-campo>

        <!-- Sin texto de ayuda: el marcador "automático" ya lo dice, y una línea
             de más acá desalinea la fila entera del formulario. -->
        <app-campo etiqueta="Número" class="w-32">
          <input
            appCampoControl
            id="numero-socio"
            name="numero-socio"
            class="campo"
            placeholder="automático"
            [(ngModel)]="formulario.numeroSocio"
          />
        </app-campo>

        <app-campo etiqueta="Al día hasta">
          <input
            appCampoControl
            id="al-dia-hasta"
            name="al-dia-hasta"
            type="date"
            class="campo cursor-pointer transition-colors hover:border-primary"
            [(ngModel)]="formulario.alDiaHasta"
          />
        </app-campo>

        <button type="submit" [disabled]="guardando()" class="boton boton-primario">
          Invitar
        </button>
      </form>

      @if (error(); as falla) {
        <app-aviso variante="error" class="mt-3 block">{{ falla }}</app-aviso>
      } @else if (aviso(); as texto) {
        <app-aviso variante="exito" class="mt-3 block">{{ texto }}</app-aviso>
      }
    </section>

    <section class="mt-8" aria-labelledby="titulo-pendientes">
      <h2 id="titulo-pendientes" class="rotulo-seccion">
        Invitaciones pendientes
      </h2>

      @if (listado.hasValue()) {
        @let datos = listado.value();
        @if (datos.invitaciones.length === 0) {
          <p class="mt-2 text-sm text-muted-foreground">
            No hay invitaciones pendientes: todos los correos invitados ya tienen
            su cuenta.
          </p>
        } @else {
          <ul class="mt-3 space-y-2">
            @for (invitacion of datos.invitaciones; track invitacion.id) {
              <li
                class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border
                       border-border bg-card p-3 text-sm shadow-sm"
              >
                <span class="icono text-muted-foreground" aria-hidden="true">mail</span>
                <span class="font-medium">{{ invitacion.email }}</span>
                <span class="text-muted-foreground">
                  socio {{ invitacion.numeroSocio }}
                </span>
                <button
                  type="button"
                  class="boton boton-secundario boton-chico ms-auto border-destructive
                         text-destructive"
                  (click)="revocar(invitacion.id, invitacion.email)"
                >
                  Revocar
                  <span class="sr-only">la invitación de {{ invitacion.email }}</span>
                </button>
              </li>
            }
          </ul>
        }
      }
    </section>

    <section class="mt-8" aria-labelledby="titulo-socios">
      <div class="flex flex-wrap items-center gap-3">
        <h2 id="titulo-socios" class="rotulo-seccion">Socios</h2>
        <app-insignia variante="info" icono="group">
          {{ listado.hasValue() ? listado.value().socios.length : 0 }}
        </app-insignia>
      </div>

      <div class="mt-3 flex flex-wrap items-end gap-3">
        <app-campo etiqueta="Buscar" class="min-w-64 flex-1">
          <input
            appCampoControl
            type="search"
            name="buscar"
            class="campo"
            placeholder="Nombre, correo o número"
            [ngModel]="busqueda()"
            (ngModelChange)="busqueda.set($event)"
          />
        </app-campo>

        <app-selector
          etiqueta="Filtrar por estado"
          [opciones]="FILTROS"
          [valor]="filtro()"
          (valorChange)="filtro.set($event)"
        />
      </div>

      @if (listado.isLoading()) {
        <app-esqueleto class="mt-3 block" [filas]="6" etiqueta="Cargando el padrón…" />
      } @else if (listado.error()) {
        <p class="mt-3 text-destructive">
          No se pudo cargar el padrón. Reintenta en un momento.
        </p>
      } @else if (filtrados().length === 0) {
        <app-estado-vacio
          class="mt-4 block"
          icono="person_search"
          titulo="Ningún socio coincide"
          detalle="Prueba con otro texto o quita el filtro de estado."
        />
      } @else {
        <div class="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
          <table class="tabla">
            <caption class="sr-only">
              Socios del club, {{ filtrados().length }} en total
            </caption>
            <thead>
              <tr>
                <th scope="col">Número</th>
                <th scope="col">Nombre</th>
                <th scope="col">Correo</th>
                <th scope="col">Estado</th>
                <th scope="col">Al día hasta</th>
                <th scope="col"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              @for (socio of pagina(); track socio.id) {
                <tr>
                  <td class="font-mono text-sm">{{ socio.numeroSocio }}</td>
                  <td class="font-medium">
                    {{ socio.usuario.nombre }} {{ socio.usuario.apellido }}
                  </td>
                  <td class="text-sm text-muted-foreground">
                    {{ socio.usuario.email }}
                  </td>
                  <td>
                    <!-- Calculado acá y no leído de la fecha: si no, el admin
                         compara mentalmente seis fechas contra hoy, una por una. -->
                    @if (socio.estado !== 'ACTIVO') {
                      <app-insignia variante="neutro" icono="pause_circle">
                        {{ nombreEstado(socio.estado) }}
                      </app-insignia>
                    } @else if (moroso(socio.alDiaHasta)) {
                      <app-insignia variante="error">Cuota vencida</app-insignia>
                    } @else {
                      <app-insignia variante="exito">Al día</app-insignia>
                    }
                  </td>
                  <td class="text-sm whitespace-nowrap">
                    {{ enDiaMes(socio.alDiaHasta) }}
                  </td>
                  <td>
                    <!-- Sin cortes: en el teléfono la tabla se desplaza igual, y a
                         su ancho mínimo partía "Ver ficha" en dos líneas (TV7.4). -->
                    <button
                      type="button"
                      class="boton boton-secundario boton-chico whitespace-nowrap"
                      (click)="editando.set(socio)"
                    >
                      Ver ficha
                      <span class="sr-only">
                        de {{ socio.usuario.nombre }} {{ socio.usuario.apellido }}
                      </span>
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Fuera de la tabla: un <dialog> dentro de un <td> hereda su ancho y sus
             reglas de layout, y el navegador lo dibuja donde no corresponde. -->
        @if (editando(); as socio) {
          <app-ficha-socio
            [socio]="socio"
            (guardado)="recargar()"
            (cerrado)="editando.set(null)"
          />
        }

        @if (filtrados().length > POR_PAGINA) {
          <app-paginacion
            class="mt-4 block"
            [(pagina)]="paginaActual"
            [total]="filtrados().length"
            [porPagina]="POR_PAGINA"
          />
        }
      }
    </section>
  `,
})
export class SociosPanel {
  private readonly api = inject(Socios);

  protected readonly formulario: Formulario = { ...EN_BLANCO };

  protected readonly busqueda = signal('');
  protected readonly filtro = signal('todos');
  protected readonly paginaActual = signal(1);

  /** El socio cuya ficha está abierta. Nulo es lo normal. */
  protected readonly editando = signal<SocioDelClub | null>(null);

  protected readonly POR_PAGINA = 10;

  protected readonly FILTROS = [
    { valor: 'todos', etiqueta: 'Todos' },
    { valor: 'al-dia', etiqueta: 'Al día' },
    { valor: 'vencidos', etiqueta: 'Cuota vencida' },
    { valor: 'inactivos', etiqueta: 'Suspendidos' },
  ];

  /**
   * Lo que el club está mirando: el texto del buscador y el filtro de estado.
   *
   * Filtra en el navegador porque el listado ya viene entero del servidor. El día
   * que el club tenga miles de socios, esto pasa a ser un parámetro de la
   * consulta y la tabla no se entera.
   */
  protected readonly filtrados = computed(() => {
    const texto = this.busqueda().trim().toLowerCase();
    const filtro = this.filtro();

    // Se lee también fuera de la rama del error, en la paginación.
    return (this.listado.hasValue() ? this.listado.value().socios : []).filter((socio) => {
      const coincide =
        texto === '' ||
        `${socio.numeroSocio} ${socio.usuario.nombre} ${socio.usuario.apellido} ${socio.usuario.email}`
          .toLowerCase()
          .includes(texto);

      const estado =
        filtro === 'todos' ||
        (filtro === 'inactivos' && socio.estado !== 'ACTIVO') ||
        (filtro === 'vencidos' &&
          socio.estado === 'ACTIVO' &&
          this.moroso(socio.alDiaHasta)) ||
        (filtro === 'al-dia' &&
          socio.estado === 'ACTIVO' &&
          !this.moroso(socio.alDiaHasta));

      return coincide && estado;
    });
  });

  /** La tanda que se ve. Volver a la primera al filtrar evita la página vacía. */
  protected readonly pagina = computed(() => {
    const desde = (this.paginaActual() - 1) * this.POR_PAGINA;

    return this.filtrados().slice(desde, desde + this.POR_PAGINA);
  });

  constructor() {
    effect(() => {
      // Se leen para depender de ellos: al cambiar la búsqueda o el filtro, la
      // página 4 de un resultado de dos deja la tabla en blanco.
      this.busqueda();
      this.filtro();
      untracked(() => this.paginaActual.set(1));
    });
  }

  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  /** Se recarga al cambiar, que es lo que refresca las dos listas tras cada acción. */
  private readonly version = signal(0);

  protected readonly listado = resource({
    params: () => ({ version: this.version() }),
    loader: () => this.api.listado(),
  });

  // Un valor y no un `computed`: no depende de ninguna señal, y envolverlo
  // prometería una reactividad que no existe.
  protected readonly hoy = hoyEnElClub();

  protected async invitar(): Promise<void> {
    this.error.set(null);
    this.aviso.set(null);

    const email = this.formulario.email.trim().toLowerCase();
    if (!email) {
      this.error.set('Escribe el correo de la persona que entra al club.');
      return;
    }

    // Solo lo que el admin escribió: los campos vacíos no viajan, para que el
    // servidor use sus valores por defecto en vez de recibir un texto vacío.
    const datos: AltaDeSocio = { email };
    if (this.formulario.numeroSocio.trim()) {
      datos.numeroSocio = this.formulario.numeroSocio.trim();
    }
    if (this.formulario.alDiaHasta) {
      datos.alDiaHasta = this.formulario.alDiaHasta;
    }

    this.guardando.set(true);
    try {
      await this.api.invitar(datos);
      this.aviso.set(
        `${email} queda como socio en cuanto cree su cuenta con ese correo.`,
      );
      Object.assign(this.formulario, EN_BLANCO);
      this.recargar();
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla));
    } finally {
      this.guardando.set(false);
    }
  }

  protected async revocar(id: number, email: string): Promise<void> {
    this.error.set(null);
    this.aviso.set(null);

    try {
      await this.api.revocar(id);
      this.aviso.set(`Se anuló la invitación de ${email}.`);
      this.recargar();
    } catch (falla) {
      this.error.set(mensajeDelServidor(falla));
    }
  }

  protected recargar(): void {
    this.version.update((v) => v + 1);
  }

  protected nombreEstado(estado: EstadoSocio): string {
    return ESTADOS[estado] ?? estado;
  }

  /**
   * El día que vence **todavía cuenta como al día**, igual que en la regla del
   * servidor: la fecha del papel es la última que vale.
   */
  protected moroso(alDiaHasta: string): boolean {
    return alDiaHasta.slice(0, 10) < this.hoy;
  }

  /** "30-11-2026", como lo escribiría el club. */
  protected enDiaMes(fecha: string): string {
    const [ano, mes, dia] = fecha.slice(0, 10).split('-');

    return `${dia}-${mes}-${ano}`;
  }
}
