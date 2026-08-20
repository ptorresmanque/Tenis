import { Component } from '@angular/core';
import { httpResource } from '@angular/common/http';

/** Espejo de EstadoSalud en apps/api/src/salud/salud.service.ts. */
export interface EstadoSalud {
  estado: 'ok' | 'degradado';
  baseDatos: {
    conectado: boolean;
    versionMotor: string | null;
  };
}

@Component({
  selector: 'app-estado',
  template: `
    <h1 class="font-display text-3xl font-bold">Estado del sistema</h1>
    <p class="mt-1 text-muted-foreground">
      Comprueba que la API y la base de datos responden.
    </p>

    <section
      class="mt-6 rounded-xl border border-border bg-card p-6 shadow-md"
      aria-labelledby="titulo-bd"
    >
      <h2 id="titulo-bd" class="text-sm font-semibold text-muted-foreground uppercase">
        Base de datos
      </h2>

      @if (salud.hasValue()) {
        <p class="mt-3 flex flex-wrap items-center gap-3">
          <!-- El estado no se comunica solo por color: lleva texto.
               Y el verde es accent-strong, no accent: este texto mide 14px y
               sobre accent daría 3.77:1, por debajo de AA. -->
          <span
            class="rounded-full bg-accent-strong px-3 py-1 text-sm font-semibold text-on-accent"
          >
            Conectada
          </span>
          <span class="font-mono text-lg">
            {{ salud.value().baseDatos.versionMotor }}
          </span>
        </p>
      } @else if (salud.error()) {
        <p class="mt-3 flex flex-wrap items-center gap-3">
          <span
            class="rounded-full bg-destructive px-3 py-1 text-sm font-semibold text-white"
          >
            Sin conexión
          </span>
          <span class="text-lg">La API no responde o la base está caída.</span>
        </p>
      } @else if (salud.isLoading()) {
        <p class="mt-3 text-lg text-muted-foreground">Consultando…</p>
      }
    </section>
  `,
})
export class Estado {
  // `/detalle` y no `/api/salud`: la ruta pública dice solo si el sistema está sano.
  // La versión del motor sale del servidor únicamente para el admin.
  protected readonly salud = httpResource<EstadoSalud>(
    () => '/api/salud/detalle',
  );
}
