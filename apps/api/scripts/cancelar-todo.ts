/**
 * Deja la grilla vacía en la base de desarrollo: cancela todas las reservas activas.
 *
 * Temporal, para probar a mano. Va directo a la base y no por `ModificacionService`
 * a propósito: acá no hay que devolver plata ni respetar ventanas, solo soltar las
 * canchas. Con `--aplicar` escribe; sin el flag solo cuenta.
 */
import { EstadoReserva } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

const ACTIVAS = [EstadoReserva.PENDIENTE_PAGO, EstadoReserva.CONFIRMADA];
const aplicar = process.argv.includes('--aplicar');

void (async () => {
  // `--aplicar` no basta como barrera: quien decide contra qué base corre esto es
  // el `.env`, y con el equivocado deja al club sin agenda —sin devoluciones ni
  // aviso a nadie, porque este script salta a propósito las reglas del negocio.
  if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? '')) {
    throw new Error('Solo contra la base local: DATABASE_URL apunta a otro host.');
  }

  const prisma = new PrismaService();

  const activas = await prisma.reserva.findMany({
    where: { estado: { in: ACTIVAS } },
    orderBy: { inicio: 'asc' },
    select: {
      folio: true,
      inicio: true,
      estado: true,
      socioId: true,
      nombre: true,
      cancha: { select: { nombre: true } },
    },
  });

  console.table(
    activas.map((r) => ({
      folio: r.folio,
      cancha: r.cancha.nombre,
      inicio: r.inicio.toISOString(),
      estado: r.estado,
      quien: r.socioId ? `socio ${r.socioId}` : `visitante (${r.nombre})`,
    })),
  );
  console.log(`${activas.length} reservas activas.`);

  if (!aplicar) {
    console.log('Simulación: nada escrito. Repetí con --aplicar.');
    await prisma.$disconnect();
    return;
  }

  const { count } = await prisma.reserva.updateMany({
    where: { estado: { in: ACTIVAS } },
    data: { estado: EstadoReserva.CANCELADA, canceladaEn: new Date() },
  });

  console.log(`${count} canceladas.`);
  await prisma.$disconnect();
})();
