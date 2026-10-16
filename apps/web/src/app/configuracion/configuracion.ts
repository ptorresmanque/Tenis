import { Component } from '@angular/core';

import { PestanasDeLaPantalla } from '../ui/pestanas-de-la-pantalla';

/**
 * Configuración del club: el cascarón con la sub-navegación.
 *
 * Secciones y no pantallas sueltas, como decidió R.5 en el plan: comparten encabezado
 * y se saltan entre sí todo el tiempo. Agregar una es agregar una línea a esta lista y
 * su ruta, sin tocar nada más — así entró la de categorías de juego en T60.
 *
 * Desde T290 (SPEC-panel.md D11) son cinco y no nueve: «El club» junta los datos, los textos y
 * las preguntas frecuentes, y «Servicios», la tienda, la cafetería y el gimnasio, cada parte en
 * su panel: cinco se eligen de un vistazo. Las pestañas las dibuja el componente compartido, como
 * en la agenda, Finanzas y Canchas.
 */
@Component({
  selector: 'app-configuracion',
  imports: [PestanasDeLaPantalla],
  template: `
    <!-- La cabecera del panel (TV7.1), sin acción: cada sección trae la suya, y
         la navegación entre secciones va debajo. -->
    <header class="cabecera-panel">
      <div>
        <h1 class="titular text-4xl">Configuración</h1>
        <p class="mt-1 text-muted-foreground">
          Las reglas con las que funciona el club y quién puede cambiarlas.
        </p>
      </div>
    </header>

    <app-pestanas-de-la-pantalla etiqueta="Secciones de configuración" [pestanas]="SECCIONES" />
  `,
})
export class Configuracion {
  protected readonly SECCIONES = [
    { ruta: '/administracion/configuracion/reglas', etiqueta: 'Reglas y cuotas' },
    { ruta: '/administracion/configuracion/el-club', etiqueta: 'El club' },
    { ruta: '/administracion/configuracion/servicios', etiqueta: 'Servicios' },
    { ruta: '/administracion/configuracion/categorias-juego', etiqueta: 'Categorías de juego' },
    // T274. El correo diario con la agenda, para admins y gestores.
    { ruta: '/administracion/configuracion/informe-diario', etiqueta: 'Informe diario' },
  ];
}
