import { Component, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { hoyEnElClub } from '../../catalogo-canchas/reloj-del-club';
import { mensajeDelServidor } from '../../core/errores';
import { AltaDeSocio, EstadoSocio, Socios } from './socios.service';

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
  imports: [FormsModule],
  template: `
    <h1 class="font-display text-3xl font-bold">Socios del club</h1>

    <section class="mt-6" aria-labelledby="titulo-alta">
      <h2 id="titulo-alta" class="font-display text-xl font-semibold">
        Dar de alta un socio
      </h2>
      <p class="mt-1 text-sm text-muted-foreground">
        Alcanza con el correo. Cuando esa persona cree su cuenta —con contraseña o
        con Google— le aparece la ficha de socio sola.
      </p>

      <form class="mt-3 flex flex-wrap items-end gap-3" (ngSubmit)="invitar()">
        <div>
          <label for="email-socio" class="block text-sm font-medium">
            Correo
          </label>
          <input
            id="email-socio"
            name="email-socio"
            type="email"
            class="mt-1 w-64 rounded-lg border border-border bg-card px-3 py-2"
            [(ngModel)]="formulario.email"
          />
        </div>

        <div>
          <label for="numero-socio" class="block text-sm font-medium">
            Número
          </label>
          <input
            id="numero-socio"
            name="numero-socio"
            class="mt-1 w-28 rounded-lg border border-border bg-card px-3 py-2"
            placeholder="automático"
            [(ngModel)]="formulario.numeroSocio"
          />
        </div>

        <div>
          <label for="al-dia-hasta" class="block text-sm font-medium">
            Al día hasta
          </label>
          <input
            id="al-dia-hasta"
            name="al-dia-hasta"
            type="date"
            class="mt-1 cursor-pointer rounded-lg border border-border bg-card px-3 py-2
                   transition-colors hover:border-primary"
            [(ngModel)]="formulario.alDiaHasta"
          />
        </div>

        <button
          type="submit"
          [disabled]="guardando()"
          class="cursor-pointer rounded-lg bg-primary px-5 py-2 font-semibold text-on-primary
                 shadow-md transition-[background-color,box-shadow] duration-200
                 hover:bg-secondary hover:shadow-lg disabled:opacity-60"
        >
          Invitar
        </button>
      </form>

      <p role="status" aria-live="polite" class="mt-2 text-sm">
        @if (error()) {
          <span class="text-destructive">{{ error() }}</span>
        } @else if (aviso()) {
          <span class="text-accent-strong">{{ aviso() }}</span>
        }
      </p>
    </section>

    <section class="mt-8" aria-labelledby="titulo-pendientes">
      <h2 id="titulo-pendientes" class="font-display text-xl font-semibold">
        Invitaciones pendientes
      </h2>

      @if (listado.value(); as datos) {
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
                <span class="font-medium">{{ invitacion.email }}</span>
                <span class="text-muted-foreground">
                  socio {{ invitacion.numeroSocio }}
                </span>
                <button
                  type="button"
                  class="ms-auto cursor-pointer rounded-md border border-destructive px-3 py-1
                         font-medium text-destructive transition-colors hover:bg-destructive/10"
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
      <h2 id="titulo-socios" class="font-display text-xl font-semibold">
        Socios
      </h2>

      @if (listado.isLoading()) {
        <p class="mt-3 text-muted-foreground">Cargando…</p>
      } @else if (listado.value(); as datos) {
        <ul class="mt-3 space-y-2">
          @for (socio of datos.socios; track socio.id) {
            <li
              class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border
                     border-border bg-card p-3 shadow-sm"
            >
              <span class="font-mono text-sm">{{ socio.numeroSocio }}</span>
              <span class="font-medium">
                {{ socio.usuario.nombre }} {{ socio.usuario.apellido }}
              </span>
              <span class="text-sm text-muted-foreground">
                {{ socio.usuario.email }}
              </span>

              @if (socio.estado !== 'ACTIVO') {
                <span
                  class="rounded-md border border-muted-foreground px-2 py-0.5 text-xs
                         font-medium text-muted-foreground"
                >
                  {{ nombreEstado(socio.estado) }}
                </span>
              }

              <!-- Calculado acá y no leído de la fecha: si no, el admin compara
                   mentalmente seis fechas contra hoy, socio por socio. -->
              @if (moroso(socio.alDiaHasta)) {
                <span
                  class="rounded-md border border-destructive px-2 py-0.5 text-xs
                         font-medium text-destructive"
                >
                  Cuota vencida
                </span>
              } @else {
                <span class="text-xs text-muted-foreground">
                  Al día hasta {{ enDiaMes(socio.alDiaHasta) }}
                </span>
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class SociosPanel {
  private readonly api = inject(Socios);

  protected readonly formulario: Formulario = { ...EN_BLANCO };

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
