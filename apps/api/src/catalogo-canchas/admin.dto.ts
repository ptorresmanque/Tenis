import { BadRequestException } from '@nestjs/common';

import {
  fechaDelClub,
  instanteEnElClub,
  minutosDeReloj,
} from '../comun/tiempo';
import { MotivoBloqueo, Superficie } from '../generated/prisma/client';

/**
 * Validación del borde del panel de administración, con el patrón de
 * `registro.dto.ts`: funciones puras que lanzan `BadRequestException`.
 *
 * Nada de lo que entra por acá llega a la base sin pasar por estas funciones. Es
 * el admin quien escribe, pero un horario mal tipeado corre la grilla del club
 * entero y un monto negativo se convierte en una tarifa que le paga al cliente.
 */

const LARGO_MAXIMO = 191; // El ancho de las columnas VARCHAR del schema.

function texto(valor: unknown, campo: string): string {
  const limpio = typeof valor === 'string' ? valor.trim() : '';

  if (!limpio) {
    throw new BadRequestException(`Falta ${campo}.`);
  }
  if (limpio.length > LARGO_MAXIMO) {
    throw new BadRequestException(`${campo} es demasiado largo.`);
  }

  return limpio;
}

function booleano(valor: unknown, campo: string): boolean {
  if (typeof valor !== 'boolean') {
    throw new BadRequestException(`${campo} tiene que ser sí o no.`);
  }

  return valor;
}

function entero(valor: unknown, campo: string, minimo: number): number {
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < minimo) {
    throw new BadRequestException(
      `${campo} tiene que ser un número entero desde ${minimo}.`,
    );
  }

  return valor;
}

function superficieValida(valor: unknown): Superficie {
  const superficies = Object.values(Superficie) as string[];

  if (typeof valor !== 'string' || !superficies.includes(valor)) {
    throw new BadRequestException(
      `La superficie tiene que ser una de: ${superficies.join(', ')}.`,
    );
  }

  return valor as Superficie;
}

export interface DatosCancha {
  nombre: string;
  superficie: Superficie;
  techada: boolean;
  iluminacion: boolean;
  /** Sin él, el servicio la pone al final de la lista. */
  orden?: number;
}

export function leerCanchaNueva(cuerpo: unknown): DatosCancha {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  return {
    nombre: texto(datos.nombre, 'el nombre'),
    superficie: superficieValida(datos.superficie),
    techada:
      datos.techada === undefined ? false : booleano(datos.techada, 'Techada'),
    iluminacion:
      datos.iluminacion === undefined
        ? false
        : booleano(datos.iluminacion, 'Iluminación'),
    orden:
      datos.orden === undefined
        ? undefined
        : entero(datos.orden, 'El orden', 0),
  };
}

/**
 * Solo lo que vino. Un PATCH que rellenara los campos ausentes con valores por
 * defecto apagaría la iluminación de una cancha por corregirle el nombre.
 */
export function leerCambiosDeCancha(
  cuerpo: unknown,
): Partial<DatosCancha & { activa: boolean }> {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;
  const cambios: Partial<DatosCancha & { activa: boolean }> = {};

  if (datos.nombre !== undefined)
    cambios.nombre = texto(datos.nombre, 'el nombre');
  if (datos.superficie !== undefined) {
    cambios.superficie = superficieValida(datos.superficie);
  }
  if (datos.techada !== undefined) {
    cambios.techada = booleano(datos.techada, 'Techada');
  }
  if (datos.iluminacion !== undefined) {
    cambios.iluminacion = booleano(datos.iluminacion, 'Iluminación');
  }
  if (datos.orden !== undefined)
    cambios.orden = entero(datos.orden, 'El orden', 0);
  if (datos.activa !== undefined)
    cambios.activa = booleano(datos.activa, 'Activa');

  if (Object.keys(cambios).length === 0) {
    throw new BadRequestException('No viene ningún cambio.');
  }

  return cambios;
}

export interface DatosHorario {
  diaSemana: number;
  horaApertura: string;
  horaCierre: string;
}

/** El horario completo de una cancha: reemplaza al anterior, no se le suma. */
export function leerHorarios(cuerpo: unknown): DatosHorario[] {
  if (!Array.isArray(cuerpo)) {
    throw new BadRequestException('Se espera una lista de horarios.');
  }

  const horarios = cuerpo.map((fila: unknown) => {
    const datos = (fila ?? {}) as Record<string, unknown>;
    const diaSemana = entero(datos.diaSemana, 'El día', 0);

    if (diaSemana > 6) {
      throw new BadRequestException('El día va de 0 (domingo) a 6 (sábado).');
    }

    const horaApertura = horaDeCuerpo(datos.horaApertura, 'la apertura');
    const horaCierre = horaDeCuerpo(datos.horaCierre, 'el cierre');

    if (minutosDeReloj(horaCierre) <= minutosDeReloj(horaApertura)) {
      throw new BadRequestException(
        'El cierre tiene que ser posterior a la apertura.',
      );
    }

    return { diaSemana, horaApertura, horaCierre };
  });

  const dias = new Set(horarios.map((h) => h.diaSemana));
  if (dias.size !== horarios.length) {
    // La base no lo impide —un único sobre (cancha, día) no cubre el caso general,
    // ver T9—, así que se ataja acá, que es por donde entra.
    throw new BadRequestException('Hay dos horarios para el mismo día.');
  }

  return horarios;
}

/**
 * La hora tal como vino, ya comprobada con `minutosDeReloj` — la misma función que
 * usa la grilla, para que lo que el panel acepta y lo que el cálculo entiende no
 * puedan separarse.
 *
 * El error se traduce: `minutosDeReloj` lanza un `Error` común, y sin envolverlo
 * un "8:00" mal tipeado sale como 500 y parece que el panel está roto.
 */
function horaDeCuerpo(valor: unknown, campo: string): string {
  if (typeof valor !== 'string') {
    throw new BadRequestException(`Falta ${campo}, con forma HH:MM.`);
  }

  try {
    minutosDeReloj(valor);
  } catch {
    throw new BadRequestException(
      `${campo} se espera con forma HH:MM, entre 00:00 y 24:00.`,
    );
  }

  return valor;
}

export interface DatosFranja {
  canchaId: number | null;
  diaSemana: number | null;
  horaDesde: string;
  horaHasta: string;
  esPico: boolean;
  montoClp: number;
  vigenteDesde: Date;
  vigenteHasta: Date | null;
}

export function leerFranja(cuerpo: unknown): DatosFranja {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  const horaDesde = horaDeCuerpo(datos.horaDesde, 'el inicio de la franja');
  const horaHasta = horaDeCuerpo(datos.horaHasta, 'el fin de la franja');

  if (minutosDeReloj(horaHasta) <= minutosDeReloj(horaDesde)) {
    throw new BadRequestException(
      'La franja tiene que terminar después de empezar.',
    );
  }

  return {
    canchaId:
      datos.canchaId === undefined || datos.canchaId === null
        ? null
        : entero(datos.canchaId, 'La cancha', 1),
    diaSemana:
      datos.diaSemana === undefined || datos.diaSemana === null
        ? null
        : diaValido(datos.diaSemana),
    horaDesde,
    horaHasta,
    esPico: datos.esPico === undefined ? false : booleano(datos.esPico, 'Pico'),
    // Cero es legítimo: una cancha puede ser gratis para el club. Negativo no:
    // sería una tarifa que le paga al cliente.
    montoClp: entero(datos.montoClp, 'El monto', 0),
    vigenteDesde: fechaDeCuerpo(datos.vigenteDesde, 'La vigencia'),
    vigenteHasta:
      datos.vigenteHasta === undefined || datos.vigenteHasta === null
        ? null
        : fechaDeCuerpo(datos.vigenteHasta, 'El fin de vigencia'),
  };
}

export interface DatosBloqueo {
  canchaId: number;
  inicio: Date;
  fin: Date;
  motivo: MotivoBloqueo;
  descripcion: string | null;
}

/**
 * El rango entra en hora del club —fecha y hora como las piensa el admin— y sale
 * como instantes. La conversión la hace el servidor y no el navegador: es la misma
 * que usa la grilla, y duplicarla en el cliente es duplicar el bug de marzo.
 *
 * Van dos fechas y no una: una cancha en mantención toda la semana es un bloqueo,
 * no siete.
 */
export function leerBloqueo(cuerpo: unknown): DatosBloqueo {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  const motivos = Object.values(MotivoBloqueo) as string[];
  if (typeof datos.motivo !== 'string' || !motivos.includes(datos.motivo)) {
    throw new BadRequestException(
      `El motivo tiene que ser uno de: ${motivos.join(', ')}.`,
    );
  }

  const inicio = instanteDeCuerpo(
    datos.fechaDesde,
    datos.horaDesde,
    'el inicio',
  );
  const fin = instanteDeCuerpo(datos.fechaHasta, datos.horaHasta, 'el fin');

  if (fin <= inicio) {
    // Un rango al revés no bloquea nada y no avisa: la cancha sigue apareciendo
    // libre y nadie entiende por qué la mantención no tomó.
    throw new BadRequestException(
      'El bloqueo tiene que terminar después de empezar.',
    );
  }

  const descripcion =
    typeof datos.descripcion === 'string' ? datos.descripcion.trim() : '';

  return {
    canchaId: entero(datos.canchaId, 'La cancha', 1),
    inicio,
    fin,
    motivo: datos.motivo as MotivoBloqueo,
    descripcion: descripcion.slice(0, LARGO_MAXIMO) || null,
  };
}

function instanteDeCuerpo(fecha: unknown, hora: unknown, campo: string): Date {
  if (typeof fecha !== 'string') {
    throw new BadRequestException(`Falta la fecha de ${campo}.`);
  }

  try {
    return instanteEnElClub(fecha, horaDeCuerpo(hora, `la hora de ${campo}`));
  } catch (error) {
    // `horaDeCuerpo` ya devuelve un 400 con su motivo; lo que queda por traducir
    // es la fecha, que `instanteEnElClub` rechaza con un `Error` común.
    if (error instanceof BadRequestException) {
      throw error;
    }

    throw new BadRequestException(
      `La fecha de ${campo} se espera con forma AAAA-MM-DD y tiene que existir.`,
    );
  }
}

function diaValido(valor: unknown): number {
  const dia = entero(valor, 'El día', 0);

  if (dia > 6) {
    throw new BadRequestException('El día va de 0 (domingo) a 6 (sábado).');
  }

  return dia;
}

/**
 * Con `fechaDelClub` y no con una regex propia: es la única que además comprueba
 * que el día exista. `new Date('2026-02-30')` no falla, se desborda al 2 de marzo,
 * y una tarifa que empieza a regir un día distinto del que el admin escribió es
 * un cobro equivocado.
 */
function fechaDeCuerpo(valor: unknown, campo: string): Date {
  try {
    return fechaDelClub(typeof valor === 'string' ? valor : '');
  } catch {
    throw new BadRequestException(
      `${campo} se espera con forma AAAA-MM-DD y tiene que existir.`,
    );
  }
}
