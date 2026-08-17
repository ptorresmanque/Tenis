import { EstadoSocio, PrismaClient } from '../src/generated/prisma/client';
import { hashear } from '../src/identidad/contrasena';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Datos de demo de `identidad` (T4). Idempotente: se corre tantas veces como haga
 * falta durante el desarrollo sin duplicar ni reventar.
 *
 * Todas comparten la misma contraseña: son cuentas de demostración en una base de
 * desarrollo, y tener que recordar cinco distintas durante una demo en vivo es una
 * forma segura de arruinarla. Ninguna de estas cuentas existe en producción.
 */

/** Dominio que identifica a las cuentas de demo, para poder distinguirlas. */
export const DOMINIO_SEED = '@clubdetenis.cl';

export const CONTRASENA_DEMO = 'raqueta lluviosa 44';

/** Medianoche UTC de hoy más `dias`. Las fechas civiles son columnas DATE. */
function enDias(dias: number): Date {
  const fecha = new Date();
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  fecha.setUTCHours(0, 0, 0, 0);
  return fecha;
}

interface CuentaDemo {
  email: string;
  nombre: string;
  apellido: string;
  telefono: string;
  esAdmin?: boolean;
  socio?: {
    numeroSocio: string;
    estado?: EstadoSocio;
    ingresoHaceDias: number;
    /** Días desde hoy hasta el vencimiento de la cuota. Negativo = moroso. */
    alDiaEnDias: number;
  };
  profesor?: boolean;
}

const CUENTAS: CuentaDemo[] = [
  {
    email: `admin${DOMINIO_SEED}`,
    nombre: 'Rodrigo',
    apellido: 'Vera',
    telefono: '+56911111111',
    esAdmin: true,
  },
  {
    email: `carolina.diaz${DOMINIO_SEED}`,
    nombre: 'Carolina',
    apellido: 'Díaz',
    telefono: '+56922222222',
    socio: { numeroSocio: '001', ingresoHaceDias: 900, alDiaEnDias: 90 },
  },
  {
    // El moroso: `reservas` tiene que rechazarlo con un mensaje distinto al del
    // socio suspendido. Sin esta cuenta la demo solo muestra el camino feliz.
    email: `matias.rojas${DOMINIO_SEED}`,
    nombre: 'Matías',
    apellido: 'Rojas',
    telefono: '+56933333333',
    socio: { numeroSocio: '002', ingresoHaceDias: 400, alDiaEnDias: -30 },
  },
  {
    email: `ana.silva${DOMINIO_SEED}`,
    nombre: 'Ana',
    apellido: 'Silva',
    telefono: '+56944444444',
    profesor: true,
  },
  {
    // Socio y profesor a la vez, el caso que el modelo de datos tiene que soportar.
    email: `felipe.morales${DOMINIO_SEED}`,
    nombre: 'Felipe',
    apellido: 'Morales',
    telefono: '+56955555555',
    socio: { numeroSocio: '003', ingresoHaceDias: 1500, alDiaEnDias: 60 },
    profesor: true,
  },
];

export async function sembrar(prisma: PrismaClient): Promise<void> {
  // Un solo hash para las cinco cuentas. Sirve porque la contraseña es pública y
  // las cuentas son de demostración; con usuarios reales, compartir el hash
  // significaría compartir la sal y delatar quién usa la misma contraseña.
  const passwordHash = await hashear(CONTRASENA_DEMO);

  for (const cuenta of CUENTAS) {
    const usuario = {
      passwordHash,
      nombre: cuenta.nombre,
      apellido: cuenta.apellido,
      telefono: cuenta.telefono,
      emailVerificado: true,
      esAdmin: cuenta.esAdmin ?? false,
    };

    const socio = cuenta.socio && {
      numeroSocio: cuenta.socio.numeroSocio,
      estado: cuenta.socio.estado ?? EstadoSocio.ACTIVO,
      fechaIngreso: enDias(-cuenta.socio.ingresoHaceDias),
      alDiaHasta: enDias(cuenta.socio.alDiaEnDias),
    };
    const profesor = cuenta.profesor ? { activo: true } : undefined;

    // Upsert y no delete + create: borrar reasignaría los ids y dejaría colgado
    // todo lo que otros módulos hayan enganchado al usuario.
    await prisma.usuario.upsert({
      where: { email: cuenta.email },
      create: {
        email: cuenta.email,
        ...usuario,
        socio: socio && { create: socio },
        profesor: profesor && { create: profesor },
      },
      update: {
        ...usuario,
        socio: socio && { upsert: { create: socio, update: socio } },
        profesor: profesor && { upsert: { create: profesor, update: profesor } },
      },
    });
  }
}

async function main(): Promise<void> {
  const prisma = new PrismaService();
  try {
    await sembrar(prisma);
    console.log(`Seed listo: ${CUENTAS.length} cuentas de demo.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main();
}
