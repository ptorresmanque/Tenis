import { PrismaClient } from './generated/prisma/client';

/**
 * Datos de arranque: lo que una base recién migrada necesita para que la app funcione,
 * a diferencia de los datos de demostración de prisma/seed*.ts. Vive en src/ para que
 * el build lo compile: en el servidor no hay ts-node.
 */

interface CategoriaDeJuego {
  nombre: string;
  orden: number;
}

/**
 * Las seis del tenis chileno, de la más baja a la más alta: con lo que el club empieza
 * a trabajar el primer día (T60).
 *
 * **El `orden` va de diez en diez y no de uno en uno.** Es único, así que intercalar
 * una categoría nueva entre dos existentes tiene que poder hacerse sin renumerar las
 * que ya están: una "Sub-18" entre la 3ª y la 2ª es escribir 35. Con orden
 * consecutivo, cada inserción sería una cascada de choques contra el único.
 */
export const CATEGORIAS_DE_JUEGO: CategoriaDeJuego[] = [
  { nombre: '5ª', orden: 10 },
  { nombre: '4ª', orden: 20 },
  { nombre: '3ª', orden: 30 },
  { nombre: '2ª', orden: 40 },
  { nombre: '1ª', orden: 50 },
  { nombre: 'Honor', orden: 60 },
];

/**
 * Siembra las categorías de juego. **Crea lo que falta y no toca lo que ya está.**
 *
 * El `update` vacío es la parte importante y no un descuido. Estas seis filas las
 * administra el club desde el panel: puede mover la 5ª al lugar 35, desactivarla
 * porque este año no la corre, o intercalarle una "Sub-18". Un seed que reescriba
 * `orden` o `activa` deshace esas decisiones en silencio la próxima vez que corra.
 *
 * Y con `orden` único no es solo silencioso: si el admin movió la 5ª a 35 y puso otra
 * categoría en el 10 que quedó libre, devolver la 5ª al 10 **revienta contra el único
 * a mitad del bucle** y deja la siembra por la mitad, porque esto no corre en una
 * transacción. Está comprobado, no supuesto.
 */
export async function sembrarCategoriasDeJuego(
  prisma: PrismaClient,
): Promise<void> {
  for (const categoria of CATEGORIAS_DE_JUEGO) {
    await prisma.categoriaJuego.upsert({
      where: { nombre: categoria.nombre },
      create: categoria,
      update: {},
    });
  }
}

/**
 * La fila única de configuración del club. `update: {}` porque es operativa —el admin
 * la ajusta en serio desde el panel—: solo hay que garantizar que exista.
 */
export async function asegurarConfiguracionClub(
  prisma: PrismaClient,
): Promise<void> {
  await prisma.configuracionClub.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });
}
