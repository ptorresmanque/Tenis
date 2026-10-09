import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T120. La migración que lleva los teléfonos guardados a la forma nueva. Se corre el SQL
 * tal como quedó en el archivo, sobre filas sembradas en cada forma: si una sentencia está
 * mal escrita, falla acá y no en el despliegue.
 */
describe('Migración de los teléfonos (T120)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const DOMINIO = '@telefonos-t120.test';
  const SQL = readFileSync(
    join(
      __dirname,
      '../prisma/migrations/20261009150000_telefonos_chilenos/migration.sql',
    ),
    'utf8',
  );

  /** Las sentencias del archivo, sin los comentarios. */
  const sentencias = SQL.split(/;\s*\n/)
    .map((trozo) =>
      trozo
        .split('\n')
        .filter((linea) => !linea.startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter(Boolean);

  const usuario = (quien: string, telefono: string | null) =>
    prisma.usuario.create({
      data: {
        email: `${quien}${DOMINIO}`,
        nombre: quien,
        apellido: 'De prueba',
        telefono,
      },
      select: { id: true },
    });

  const telefonoDe = async (quien: string) =>
    (
      await prisma.usuario.findUniqueOrThrow({
        where: { email: `${quien}${DOMINIO}` },
        select: { telefono: true },
      })
    ).telefono;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = modulo.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
  });

  afterAll(async () => {
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    await app.close();
  });

  it('**lleva a la forma nueva lo que se puede leer, y no toca lo demás**', async () => {
    await usuario('formateado', '+56 9 8765 4321');
    await usuario('sin-prefijo', '9 8765 4321');
    await usuario('ocho-digitos', '8765 4321');
    await usuario('ya-normal', '56912345678');
    await usuario('fijo', '(2) 2345-6789');
    await usuario('extranjero', '+54 11 4321 8765');
    await usuario('basura', 'no tengo');
    await usuario('sin-telefono', null);

    for (const sentencia of sentencias) {
      await prisma.$executeRawUnsafe(sentencia);
    }

    expect(await telefonoDe('formateado')).toBe('56987654321');
    expect(await telefonoDe('sin-prefijo')).toBe('56987654321');
    expect(await telefonoDe('ocho-digitos')).toBe('56987654321');
    expect(await telefonoDe('ya-normal')).toBe('56912345678');
    expect(await telefonoDe('fijo')).toBe('56223456789');
    // Lo que no es chileno queda como estaba: mejor verlo tal cual que perderlo.
    expect(await telefonoDe('extranjero')).toBe('+54 11 4321 8765');
    expect(await telefonoDe('basura')).toBe('no tengo');
    expect(await telefonoDe('sin-telefono')).toBeNull();
  });

  it('las seis tablas con teléfono están, y jugador no', () => {
    expect(sentencias).toHaveLength(6);
    expect(SQL).not.toMatch(/UPDATE `jugador`/);
  });
});
