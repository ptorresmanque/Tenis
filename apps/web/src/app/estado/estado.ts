import { Component } from '@angular/core';
import { httpResource } from '@angular/common/http';

import { Insignia } from '../ui/insignia';

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
  imports: [Insignia],
  template: `
    <!-- La cabecera del panel (TV7.1), sin acción: es una pantalla para mirar. -->
    <header class="cabecera-panel">
      <div>
        <h1 class="titular text-4xl">Estado del sistema</h1>
        <p class="mt-1 text-muted-foreground">
          Comprueba que la API y la base de datos responden.
        </p>
      </div>
    </header>

    <section
      class="mt-6 rounded-xl border border-border bg-card p-6 shadow-md"
      aria-labelledby="titulo-bd"
    >
      <h2 id="titulo-bd" class="rotulo-seccion">
        Base de datos
      </h2>

      @if (salud.hasValue()) {
        <p class="mt-3 flex flex-wrap items-center gap-3">
          <app-insignia variante="exito">Conectada</app-insignia>
          <span class="font-mono text-lg">
            {{ salud.value().baseDatos.versionMotor }}
          </span>
        </p>
      } @else if (salud.error()) {
        <p class="mt-3 flex flex-wrap items-center gap-3">
          <app-insignia variante="error">Sin conexión</app-insignia>
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
