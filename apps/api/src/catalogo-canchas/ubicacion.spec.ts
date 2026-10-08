import { BadRequestException } from '@nestjs/common';

import { leerUbicacion } from './ubicacion';

/**
 * T100. El admin pega en "Datos del club" lo que tiene a mano: el enlace de Google Maps
 * o las coordenadas que Google Maps copia con el clic derecho. El servidor guarda dos
 * números.
 */
describe('leerUbicacion', () => {
  const FEDAL = { latitud: -33.4372, longitud: -70.6506 };

  it('lee las coordenadas que copia Google Maps con el clic derecho', () => {
    expect(leerUbicacion('-33.4372, -70.6506')).toEqual(FEDAL);
  });

  it('también sin espacio, o separadas solo por un espacio', () => {
    expect(leerUbicacion('-33.4372,-70.6506')).toEqual(FEDAL);
    expect(leerUbicacion('-33.4372 -70.6506')).toEqual(FEDAL);
  });

  it('**en el enlace de un lugar usa el punto del lugar, no el centro de la vista**', () => {
    // `@` es dónde estaba centrado el mapa cuando se copió el enlace; `!3d…!4d…` es el
    // lugar. Con el `@`, el marcador puede quedar a una cuadra del club.
    const enlace =
      'https://www.google.com/maps/place/FEDAL/@-33.4400,-70.6550,15z/' +
      'data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-33.4372!4d-70.6506!16s';

    expect(leerUbicacion(enlace)).toEqual(FEDAL);
  });

  it('sin el punto del lugar, usa el centro de la vista', () => {
    expect(
      leerUbicacion('https://www.google.com/maps/@-33.4372,-70.6506,17z'),
    ).toEqual(FEDAL);
  });

  it('lee el enlace de una búsqueda por coordenadas', () => {
    expect(
      leerUbicacion('https://maps.google.com/?q=-33.4372,-70.6506'),
    ).toEqual(FEDAL);
  });

  it('redondea a 6 decimales: unos 10 centímetros, de sobra para un club', () => {
    expect(leerUbicacion('-33.43721234, -70.65069876')).toEqual({
      latitud: -33.437212,
      longitud: -70.650699,
    });
  });

  it('vacío es borrar la ubicación', () => {
    expect(leerUbicacion('   ')).toBeNull();
  });

  it('**un enlace corto dice qué pegar en su lugar**: no trae coordenadas', () => {
    // "Compartir" en Google Maps entrega estos. Seguirlo exigiría pedirle la página a
    // Google desde el servidor.
    expect(() => leerUbicacion('https://maps.app.goo.gl/AbCdEf123')).toThrow(
      /enlace corto/,
    );
  });

  it('rechaza una latitud o una longitud fuera de rango', () => {
    expect(() => leerUbicacion('-133.4, -70.6')).toThrow(BadRequestException);
    expect(() => leerUbicacion('-33.4, -270.6')).toThrow(BadRequestException);
  });

  it('rechaza un texto del que no salen dos números, y dice qué pegar', () => {
    expect(() => leerUbicacion('Avenida Siempre Viva 742')).toThrow(
      /Pega el enlace de Google Maps/,
    );
  });
});
