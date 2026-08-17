import { PrismaClient, Superficie } from '../src/generated/prisma/client';

/**
 * Datos de demo de `catalogo-canchas` (T9): las canchas del club, su horario de
 * apertura, las tarifas por franja y la fila de configuración.
 *
 * Idempotente como el de identidad: se corre muchas veces durante el desarrollo.
 */

interface CanchaDemo {
  nombre: string;
  superficie: Superficie;
  techada: boolean;
  iluminacion: boolean;
  orden: number;
}

const CANCHAS: CanchaDemo[] = [
  {
    nombre: 'Cancha 1',
    superficie: Superficie.ARCILLA,
    techada: false,
    iluminacion: true,
    orden: 1,
  },
  {
    nombre: 'Cancha 2',
    superficie: Superficie.CEMENTO,
    techada: false,
    iluminacion: true,
    orden: 2,
  },
  {
    // La techada es la que hace interesante la demo un día de lluvia, y la única
    // que justifica que la superficie se muestre en la grilla.
    nombre: 'Cancha 3 (techada)',
    superficie: Superficie.PASTO_SINTETICO,
    techada: true,
    iluminacion: true,
    orden: 3,
  },
];

/** Apertura pareja para todas las canchas: `canchaId` nulo. */
const APERTURA = [
  // Domingo y sábado abren más tarde y cierran antes, como cualquier club.
  { diaSemana: 0, horaApertura: '09:00', horaCierre: '20:00' },
  { diaSemana: 1, horaApertura: '08:00', horaCierre: '22:00' },
  { diaSemana: 2, horaApertura: '08:00', horaCierre: '22:00' },
  { diaSemana: 3, horaApertura: '08:00', horaCierre: '22:00' },
  { diaSemana: 4, horaApertura: '08:00', horaCierre: '22:00' },
  { diaSemana: 5, horaApertura: '08:00', horaCierre: '22:00' },
  { diaSemana: 6, horaApertura: '09:00', horaCierre: '20:00' },
];

/**
 * Tarifas del club. Todas para toda cancha y todo día: la especificidad por cancha
 * o por día existe en el modelo, pero el club no la usa todavía y sembrarla sin
 * necesidad haría creer que la resolución de T11 se probó con datos reales.
 */
const FRANJAS = [
  { horaDesde: '08:00', horaHasta: '18:00', esPico: false, montoClp: 12000 },
  // Pico: después del trabajo, que es cuando todos quieren jugar.
  { horaDesde: '18:00', horaHasta: '22:00', esPico: true, montoClp: 20000 },
];

/** Las franjas rigen desde antes de cualquier reserva que se pueda hacer hoy. */
const VIGENTE_DESDE = new Date('2026-01-01T00:00:00.000Z');

export async function sembrarCatalogo(prisma: PrismaClient): Promise<void> {
  // Sin `update`: si alguien cambió los valores desde el panel, el seed no tiene
  // por qué revertirlos. Solo garantiza que la fila exista.
  await prisma.configuracionClub.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });

  for (const cancha of CANCHAS) {
    await prisma.cancha.upsert({
      where: { nombre: cancha.nombre },
      create: cancha,
      update: cancha,
    });
  }

  // Ni la apertura ni las franjas tienen clave natural —`cancha_id` nulo no choca
  // consigo mismo en MySQL—, así que la idempotencia se resuelve buscando primero.
  for (const horario of APERTURA) {
    const existente = await prisma.horarioApertura.findFirst({
      where: { canchaId: null, diaSemana: horario.diaSemana },
      select: { id: true },
    });

    if (existente) {
      await prisma.horarioApertura.update({
        where: { id: existente.id },
        data: horario,
      });
    } else {
      await prisma.horarioApertura.create({ data: horario });
    }
  }

  for (const franja of FRANJAS) {
    const datos = { ...franja, vigenteDesde: VIGENTE_DESDE };

    const existente = await prisma.franjaHoraria.findFirst({
      where: {
        canchaId: null,
        diaSemana: null,
        horaDesde: franja.horaDesde,
        horaHasta: franja.horaHasta,
      },
      select: { id: true },
    });

    if (existente) {
      await prisma.franjaHoraria.update({
        where: { id: existente.id },
        data: datos,
      });
    } else {
      await prisma.franjaHoraria.create({ data: datos });
    }
  }
}
