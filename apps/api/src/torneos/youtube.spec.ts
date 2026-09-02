import { idDeYoutube, urlDelReproductor } from './youtube';

/**
 * T68. De dónde sale el id que termina dentro del `src` de un `iframe`.
 *
 * **Este archivo es la puerta.** Si algo que no es un id de YouTube pasa por acá, el
 * club termina cargando dentro de su propio sitio lo que decidió quien pegó el enlace.
 */
describe('idDeYoutube', () => {
  const ID = 'dQw4w9WgXcQ';

  it('**las cinco formas del mismo video dan el mismo id**', () => {
    // El club va a pegar cualquiera de ellas según de dónde copie el enlace.
    const formas = [
      `https://youtu.be/${ID}?t=42`,
      `https://www.youtube.com/watch?v=${ID}&list=PLabc`,
      `https://www.youtube.com/live/${ID}`,
      `https://www.youtube.com/embed/${ID}`,
      ID,
    ];

    expect(new Set(formas.map(idDeYoutube))).toEqual(new Set([ID]));
  });

  it('acepta el enlace con http, con m. y sin www', () => {
    for (const enlace of [
      `http://youtube.com/watch?v=${ID}`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://www.youtube-nocookie.com/embed/${ID}`,
    ]) {
      expect(idDeYoutube(enlace)).toBe(ID);
    }
  });

  describe('lo que rechaza, que es para lo que existe', () => {
    it('**un enlace de otro dominio, aunque tenga forma de YouTube**', () => {
      // Sin comprobar el host, el patrón de la ruta no distingue de qué sitio viene y
      // el club terminaría enlazando un video que no es el suyo.
      expect(idDeYoutube(`https://malo.cl/embed/${ID}`)).toBeNull();
      expect(idDeYoutube(`https://youtube.malo.cl/embed/${ID}`)).toBeNull();
      expect(idDeYoutube(`https://malo.cl/?x=youtube.com&v=${ID}`)).toBeNull();
    });

    it('**un `javascript:` con un id adentro**', () => {
      // Es lo que convierte un campo de formulario en el que decide qué se carga
      // dentro del sitio del club.
      expect(idDeYoutube(`javascript:alert(1)//${ID}`)).toBeNull();
      expect(idDeYoutube(`javascript:fetch('//malo.cl?v=${ID}')`)).toBeNull();
    });

    it('un `data:` con un id adentro', () => {
      expect(idDeYoutube(`data:text/html,<script>1</script>${ID}`)).toBeNull();
    });

    it('**un id de largo distinto de once**', () => {
      expect(idDeYoutube('dQw4w9WgXc')).toBeNull();
      expect(idDeYoutube('dQw4w9WgXcQQ')).toBeNull();
      expect(idDeYoutube(`https://youtu.be/dQw4w9WgXc`)).toBeNull();
    });

    it('un id con caracteres que no van', () => {
      expect(idDeYoutube('dQw4w9WgX<>')).toBeNull();
      expect(idDeYoutube('dQw4w9WgX Q')).toBeNull();
    });

    it('lo que no es texto, y lo vacío', () => {
      for (const raro of [null, undefined, 42, {}, [], true, '', '   ']) {
        expect(idDeYoutube(raro)).toBeNull();
      }
    });

    it('un enlace de YouTube que no lleva a ningún video', () => {
      expect(idDeYoutube('https://www.youtube.com/')).toBeNull();
      expect(idDeYoutube('https://www.youtube.com/@clubdetenis')).toBeNull();
    });
  });
});

describe('urlDelReproductor', () => {
  it('**usa el dominio sin cookies**', () => {
    // Sin eso, cada visitante que abre el calendario carga scripts de Google y queda
    // identificado por mirar una página del club, aunque no toque nada.
    expect(urlDelReproductor('dQw4w9WgXcQ')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
  });
});
