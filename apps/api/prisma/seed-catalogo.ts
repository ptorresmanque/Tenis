import {
  MotivoBloqueo,
  PrismaClient,
  Superficie,
} from '../src/generated/prisma/client';
import { asegurarConfiguracionClub } from '../src/arranque';
import { instanteEnElClub } from '../src/comun/tiempo';

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

/**
 * Las ocho canchas del club: todas de cemento y todas con iluminación. Las cuatro
 * últimas son techadas, que es lo que hace interesante la demo un día de lluvia.
 */
export const CANCHAS: CanchaDemo[] = Array.from({ length: 8 }, (_, i) => ({
  nombre: `Cancha ${i + 1}`,
  superficie: Superficie.CEMENTO,
  techada: i >= 4,
  iluminacion: true,
  orden: i + 1,
}));

/**
 * Dos de las techadas están en mantención hasta diciembre. Van como `Bloqueo` y no
 * como `activa: false`: la mantención termina en una fecha, y una cancha inactiva no
 * explica ni cuándo vuelve ni por qué no está.
 *
 * "Hasta diciembre" es hasta el 1 de diciembre: el bloqueo termina cuando empieza el
 * mes, no cuando termina.
 */
export const EN_MANTENCION = ['Cancha 7', 'Cancha 8'];
const MANTENCION = {
  inicio: instanteEnElClub('2026-08-01', '00:00'),
  fin: instanteEnElClub('2026-12-01', '00:00'),
  motivo: MotivoBloqueo.MANTENCION,
  descripcion: 'Mantención de la superficie',
};

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
  {
    horaDesde: '08:00',
    horaHasta: '18:00',
    esPico: false,
    montoClp: 12000,
    // Con descuento sobre una hora y media a precio de hora: es lo que motiva vender
    // las dos duraciones por separado (T79).
    montoClp90: 16000,
  },
  // Pico: después del trabajo, que es cuando todos quieren jugar.
  {
    horaDesde: '18:00',
    horaHasta: '22:00',
    esPico: true,
    montoClp: 20000,
    montoClp90: 27000,
  },
];

/** Las franjas rigen desde antes de cualquier reserva que se pueda hacer hoy. */
const VIGENTE_DESDE = new Date('2026-01-01T00:00:00.000Z');

export async function sembrarCatalogo(prisma: PrismaClient): Promise<void> {
  // Las canchas y las tarifas son datos de demo que conviene restaurar en cada corrida;
  // la configuración es operativa y solo tiene que existir, como en producción.
  await asegurarConfiguracionClub(prisma);

  // La cancha 3 llevaba el "(techada)" en el nombre cuando era la única. Renombrarla
  // y no recrearla: la base de desarrollo tiene reservas colgando de ese id, y un
  // upsert con el nombre nuevo dejaría la vieja como una novena cancha fantasma.
  await prisma.cancha.updateMany({
    where: { nombre: 'Cancha 3 (techada)' },
    data: { nombre: 'Cancha 3' },
  });

  for (const cancha of CANCHAS) {
    const { id } = await prisma.cancha.upsert({
      where: { nombre: cancha.nombre },
      // `activa` también en el update: la base de desarrollo termina con canchas que
      // alguien desactivó probando el panel, y las ocho son datos de demo que el seed
      // tiene que dejar como dice acá.
      create: { ...cancha, activa: true },
      update: { ...cancha, activa: true },
      select: { id: true },
    });

    // Como la apertura y las franjas: sin clave natural, la idempotencia se resuelve
    // buscando primero. Una cancha del seed tiene a lo más una mantención.
    if (EN_MANTENCION.includes(cancha.nombre)) {
      const existente = await prisma.bloqueo.findFirst({
        where: { canchaId: id, motivo: MotivoBloqueo.MANTENCION },
        select: { id: true },
      });

      if (existente) {
        await prisma.bloqueo.update({
          where: { id: existente.id },
          data: MANTENCION,
        });
      } else {
        await prisma.bloqueo.create({ data: { ...MANTENCION, canchaId: id } });
      }
    }
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
