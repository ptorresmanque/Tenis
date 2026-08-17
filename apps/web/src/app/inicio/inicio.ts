import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-inicio',
  imports: [RouterLink],
  template: `
    <h1 class="font-display text-4xl font-bold text-balance">
      Reservá tu cancha en el club
    </h1>
    <p class="mt-2 max-w-prose text-lg text-muted-foreground">
      Socios y visitantes. Las pantallas reales llegan con los módulos de canchas y
      reservas; por ahora esto solo muestra que el sistema de diseño está en pie.
    </p>

    <div class="mt-6 flex flex-wrap gap-3">
      <a
        routerLink="/disponibilidad"
        class="cursor-pointer rounded-lg bg-primary px-6 py-3 font-semibold text-on-primary
               shadow-md transition-[background-color,box-shadow] duration-200
               hover:bg-secondary hover:shadow-lg"
      >
        Ver disponibilidad
      </a>
      <a
        routerLink="/entrar"
        class="cursor-pointer rounded-lg border-2 border-primary px-6 py-3 font-semibold
               text-primary transition-colors duration-200 hover:bg-muted"
      >
        Soy socio
      </a>
    </div>

    <section class="mt-12" aria-labelledby="titulo-superficies">
      <h2 id="titulo-superficies" class="font-display text-2xl font-semibold">
        Superficies
      </h2>

      <ul class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        @for (superficie of superficies; track superficie.nombre) {
          <li class="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h3 class="font-display text-lg font-semibold">{{ superficie.nombre }}</h3>
            <p class="mt-1 text-sm text-muted-foreground">{{ superficie.detalle }}</p>
            <p class="mt-3 font-semibold text-accent-strong">
              {{ superficie.disponibles }} canchas
            </p>
          </li>
        }
      </ul>
    </section>
  `,
})
export class Inicio {
  // Datos de muestra: sirven para ver los tokens aplicados. El catálogo real
  // llega con catalogo-canchas (T9 en adelante).
  protected readonly superficies = [
    { nombre: 'Arcilla', detalle: 'Al aire libre', disponibles: 4 },
    { nombre: 'Cemento', detalle: 'Al aire libre, con iluminación', disponibles: 2 },
    { nombre: 'Pasto sintético', detalle: 'Techada', disponibles: 1 },
  ];
}
