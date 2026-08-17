import { cookiesSeguras } from './cookie';

/**
 * `Secure` sobre `http` es una cookie que algunos navegadores descartan sin avisar
 * —Safari entre ellos—, y entonces no hay forma de entrar ni con contraseña ni con
 * Google. Bajar la guardia solo en el localhost de desarrollo, y en ningún otro
 * caso, es lo que permite tener las dos cosas.
 */
describe('cookiesSeguras', () => {
  const con = (url: string | undefined) => {
    const anterior = process.env.API_PUBLIC_URL;
    if (url === undefined) {
      delete process.env.API_PUBLIC_URL;
    } else {
      process.env.API_PUBLIC_URL = url;
    }

    try {
      return cookiesSeguras();
    } finally {
      process.env.API_PUBLIC_URL = anterior;
    }
  };

  it('no exige Secure en el localhost de desarrollo', () => {
    expect(con('http://localhost:3001/api')).toBe(false);
    expect(con('http://127.0.0.1:3001/api')).toBe(false);
  });

  it('exige Secure con https', () => {
    expect(con('https://club.example.cl/api')).toBe(true);
  });

  it('exige Secure si la API no está en localhost, aunque sea http', () => {
    // Un http hacia otra máquina viaja por la red: ahí la cookie sí necesita
    // protección, y lo que hay que arreglar es el http, no la cookie.
    expect(con('http://api.club.example.cl')).toBe(true);
  });

  it('exige Secure cuando no hay nada configurado', () => {
    // Si alguien despliega sin definir la URL pública, el error tiene que caer
    // del lado seguro: cookies protegidas y un ingreso que falla a la vista.
    expect(con(undefined)).toBe(true);
    expect(con('esto-no-es-una-url')).toBe(true);
  });
});
