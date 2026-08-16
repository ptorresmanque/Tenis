import { Component } from '@angular/core';
import { httpResource } from '@angular/common/http';

/** Espejo de EstadoSalud en apps/api/src/salud/salud.service.ts. */
interface EstadoSalud {
  estado: 'ok' | 'degradado';
  baseDatos: {
    conectado: boolean;
    versionMotor: string | null;
  };
}

@Component({
  selector: 'app-root',
  template: `
    <main class="mx-auto max-w-xl p-6 font-sans">
      <h1 class="text-2xl font-semibold">Club de Tenis</h1>
      <p class="mt-1 text-sm text-neutral-500">
        Esqueleto del sistema. La pantalla real llega en T3.
      </p>

      <section
        class="mt-6 rounded-xl border border-neutral-200 p-4"
        aria-labelledby="titulo-estado"
      >
        <h2 id="titulo-estado" class="text-sm font-medium text-neutral-500">
          Estado de la base de datos
        </h2>

        @if (salud.hasValue()) {
          <p class="mt-2 text-lg">
            Conectado a
            <span class="font-mono font-semibold">
              {{ salud.value().baseDatos.versionMotor }}
            </span>
          </p>
        } @else if (salud.error()) {
          <p class="mt-2 text-lg text-red-700">
            La API no responde o la base está caída.
          </p>
        } @else if (salud.isLoading()) {
          <p class="mt-2 text-lg text-neutral-500">Consultando…</p>
        }
      </section>
    </main>
  `,
})
export class App {
  // El dato lo informa MariaDB vía SELECT VERSION(); si esto muestra una versión,
  // las cuatro piezas del monorepo están habladas entre sí.
  protected readonly salud = httpResource<EstadoSalud>(() => '/api/salud');
}
