import { DatosDelClub, firmaDelClub } from './club';

/** La firma que comparten todos los correos del club (T108; la reutilizan T109 a T112). */
describe('la firma del club', () => {
  const CLUB: DatosDelClub = {
    nombre: 'FEDAL Tennis Center',
    direccion: 'Avenida del Tenis 1234, Ñuñoa',
    telefono: '+56 2 2345 6789',
    email: 'hola@fedal.cl',
    latitud: -33.4372,
    longitud: -70.6506,
  };

  it('**nombra al club, su dirección y cómo contactarlo**', () => {
    const firma = firmaDelClub(CLUB);

    expect(firma).toContain('FEDAL Tennis Center');
    expect(firma).toContain('Avenida del Tenis 1234, Ñuñoa');
    expect(firma).toContain('+56 2 2345 6789 · hola@fedal.cl');
  });

  it('**con ubicación, lleva "Cómo llegar" a Google Maps**', () => {
    expect(firmaDelClub(CLUB)).toContain(
      'Cómo llegar: https://www.google.com/maps/dir/?api=1&destination=-33.4372,-70.6506',
    );
  });

  it('sin ubicación cargada no ofrece un enlace que no lleva a ningún lado', () => {
    const firma = firmaDelClub({ ...CLUB, latitud: null, longitud: null });

    expect(firma).not.toContain('Cómo llegar');
  });

  it('lo que el club no cargó no deja líneas vacías ni separadores sueltos', () => {
    const firma = firmaDelClub({ ...CLUB, direccion: '', telefono: '' });

    expect(firma).toBe(
      '-- \nFEDAL Tennis Center\nhola@fedal.cl\n' +
        'Cómo llegar: https://www.google.com/maps/dir/?api=1&destination=-33.4372,-70.6506',
    );
  });
});
