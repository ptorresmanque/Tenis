import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import { PrismaClient } from './generated/prisma/client';
import { hashear, problemaDeContrasena } from './identidad/contrasena';
import { DatosRegistro, leerRegistro } from './identidad/registro.dto';
import { PrismaService } from './prisma/prisma.service';

/**
 * Deja lista para usarse una base recién migrada, sin el seed de demostración: ese
 * crea cuentas con una contraseña publicada en un repo público y no corre nunca fuera
 * de desarrollo. Lo corre el agente de despliegue después de cada `migrate deploy`
 * (tasks/plan-despliegue.md, D2 y D3):
 *
 *   ADMIN_INICIAL=/ruta/admin-inicial.env npm run arranque -w apps/api
 *
 * Siembra lo que la app necesita para funcionar y, si ADMIN_INICIAL trae la ruta de un
 * archivo, crea el primer admin con lo que dice ese archivo:
 *
 *   ADMIN_CORREO, ADMIN_NOMBRE, ADMIN_APELLIDO, ADMIN_CLAVE y, opcional, ADMIN_TELEFONO
 *
 * Idempotente: corre en cada release.
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

/**
 * Lee el admin-inicial.env con las mismas reglas que un registro: el correo en
 * minúsculas y con formato, nombre y apellido obligatorios, y la contraseña con el
 * largo mínimo y fuera de la lista de filtradas.
 */
function leerAdminInicial(ruta: string): DatosRegistro {
  const campos = parseEnv(readFileSync(ruta, 'utf8'));

  try {
    const datos = leerRegistro({
      email: campos.ADMIN_CORREO,
      contrasena: campos.ADMIN_CLAVE,
      nombre: campos.ADMIN_NOMBRE,
      apellido: campos.ADMIN_APELLIDO,
      telefono: campos.ADMIN_TELEFONO,
    });
    const problema = problemaDeContrasena(datos.contrasena);
    if (problema) {
      throw new Error(problema);
    }
    return datos;
  } catch (error) {
    throw new Error(`${ruta}: ${(error as Error).message}`);
  }
}

/**
 * Crea el admin o, si el correo ya tiene una cuenta verificada, la deja como admin.
 * **Nunca cambia la clave de una cuenta que ya existe**: el arranque corre en cada
 * release, y el archivo con la clave inicial puede seguir en el servidor o haberse
 * reescrito.
 *
 * **Una cuenta sin el correo verificado no se promueve.** Cualquiera puede registrarse
 * con el correo que el club va a usar como admin, y el login no exige verificarlo:
 * promoverla dejaría de admin a quien se registró primero, con su clave.
 */
async function crearAdminInicial(
  prisma: PrismaClient,
  datos: DatosRegistro,
): Promise<void> {
  const existente = await prisma.usuario.findUnique({
    where: { email: datos.email },
    select: { esAdmin: true, emailVerificado: true },
  });

  if (!existente) {
    await prisma.usuario.create({
      data: {
        email: datos.email,
        nombre: datos.nombre,
        apellido: datos.apellido,
        telefono: datos.telefono,
        passwordHash: await hashear(datos.contrasena),
        // No hay a quién mandarle el enlace antes de que exista el primer admin.
        emailVerificado: true,
        esAdmin: true,
      },
    });
    return;
  }
  if (existente.esAdmin) {
    return;
  }
  if (!existente.emailVerificado) {
    throw new Error(
      `${datos.email} ya tiene una cuenta y su correo no está verificado, así que no ` +
        'queda como admin: cualquiera puede registrarse con un correo ajeno. Verifica ' +
        'el correo de esa cuenta o pon otro en admin-inicial.env.',
    );
  }
  await prisma.usuario.update({
    where: { email: datos.email },
    data: { esAdmin: true },
  });
}

/** Devuelve lo que se hizo, para el log del agente. */
export async function arrancar(
  prisma: PrismaClient,
  rutaAdmin: string | undefined,
): Promise<string> {
  // Antes de tocar la base: un archivo mal escrito no deja el arranque a medias.
  const admin = rutaAdmin ? leerAdminInicial(rutaAdmin) : null;

  await asegurarConfiguracionClub(prisma);
  await sembrarCategoriasDeJuego(prisma);

  if (!admin) {
    return 'Arranque listo, sin admin inicial: ADMIN_INICIAL viene vacío.';
  }
  await crearAdminInicial(prisma, admin);
  return `Arranque listo, con ${admin.email} como admin.`;
}

async function main(): Promise<void> {
  // Como main.ts: el .env de la app, que en el servidor es un symlink al del ambiente.
  process.loadEnvFile(`${__dirname}/../.env`);
  const prisma = new PrismaService();
  try {
    console.log(await arrancar(prisma, process.env.ADMIN_INICIAL));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
