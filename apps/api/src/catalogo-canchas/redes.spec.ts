import { BadRequestException } from '@nestjs/common';

import { leerRed, leerWhatsapp } from './redes';

/**
 * T140. El admin pega en "Datos del club" el enlace de cada red, o escribe `@usuario`. El
 * servidor guarda un enlace `https` del dominio de esa red, y nada más: el pie de todas las
 * páginas lo publica.
 */
describe('leerRed', () => {
  it('guarda el enlace del perfil tal como se pegó', () => {
    expect(leerRed('instagram', 'https://www.instagram.com/fedaltennis')).toBe(
      'https://www.instagram.com/fedaltennis',
    );
  });

  it('**`@usuario` y el enlace terminan en lo mismo**', () => {
    expect(leerRed('instagram', '@fedaltennis')).toBe(
      'https://www.instagram.com/fedaltennis',
    );
    expect(leerRed('tiktok', '@fedaltennis')).toBe(
      'https://www.tiktok.com/@fedaltennis',
    );
    expect(leerRed('youtube', '@fedaltennis')).toBe(
      'https://www.youtube.com/@fedaltennis',
    );
  });

  it('Facebook no tiene `@usuario`: pide el enlace', () => {
    expect(() => leerRed('facebook', '@fedaltennis')).toThrow(
      /enlace de Facebook/,
    );
  });

  it('acepta el enlace sin `https://`, que es como lo copia la barra del teléfono', () => {
    expect(leerRed('facebook', 'facebook.com/fedaltennis')).toBe(
      'https://facebook.com/fedaltennis',
    );
  });

  it('un `http://` de la misma red pasa a `https://`: es el mismo perfil', () => {
    expect(leerRed('youtube', 'http://youtube.com/@fedaltennis')).toBe(
      'https://youtube.com/@fedaltennis',
    );
  });

  it('acepta los subdominios de la red y sus dominios cortos', () => {
    expect(leerRed('facebook', 'https://m.facebook.com/fedaltennis')).toBe(
      'https://m.facebook.com/fedaltennis',
    );
    expect(leerRed('facebook', 'https://fb.com/fedaltennis')).toBe(
      'https://fb.com/fedaltennis',
    );
    expect(leerRed('youtube', 'https://youtu.be/abc123')).toBe(
      'https://youtu.be/abc123',
    );
  });

  it('**un enlace de otro dominio responde 400**, aunque lo nombre', () => {
    // El pie de cada página lo publica: un error de tipeo, o una cuenta de admin en
    // malas manos, mandaría a los visitantes a cualquier parte.
    expect(() => leerRed('instagram', 'https://otro.cl/fedaltennis')).toThrow(
      BadRequestException,
    );
    expect(() =>
      leerRed('instagram', 'https://instagram.com.otro.cl/fedaltennis'),
    ).toThrow(BadRequestException);
    expect(() =>
      leerRed('instagram', 'https://falsoinstagram.com/fedaltennis'),
    ).toThrow(BadRequestException);
  });

  it('**`javascript:` responde 400**', () => {
    expect(() => leerRed('tiktok', 'javascript:alert(1)')).toThrow(
      BadRequestException,
    );
  });

  it('el dominio solo, sin perfil, responde 400', () => {
    expect(() => leerRed('instagram', 'https://www.instagram.com/')).toThrow(
      /perfil/,
    );
  });

  it('el mensaje nombra la red y muestra un ejemplo con su forma', () => {
    expect(() => leerRed('tiktok', 'https://otro.cl/x')).toThrow(
      /TikTok.*tiktok\.com/,
    );
    // Un canal de YouTube es `/@nombre`: el ejemplo no puede enseñar otra forma.
    expect(() => leerRed('youtube', 'https://otro.cl/x')).toThrow(
      'https://www.youtube.com/@fedaltennis',
    );
  });

  it('un `@usuario` con espacios o símbolos responde 400', () => {
    expect(() => leerRed('instagram', '@fedal tennis')).toThrow(
      BadRequestException,
    );
    expect(() => leerRed('instagram', '@fedal/../x')).toThrow(
      BadRequestException,
    );
  });

  it('vacío es "el club no tiene esa red"', () => {
    expect(leerRed('instagram', '   ')).toBe('');
  });

  it('lo que no es texto responde 400', () => {
    expect(() => leerRed('instagram', 42)).toThrow(BadRequestException);
  });

  it('un enlace más largo que la columna responde 400', () => {
    expect(() =>
      leerRed('instagram', `https://instagram.com/${'a'.repeat(200)}`),
    ).toThrow(/largo/);
  });
});

describe('leerWhatsapp', () => {
  it('se guarda como el teléfono: 56 y los 9 dígitos', () => {
    expect(leerWhatsapp('9 8765 4321')).toBe('56987654321');
    expect(leerWhatsapp('+56 9 8765 4321')).toBe('56987654321');
  });

  it('vacío es "el club no tiene WhatsApp"', () => {
    expect(leerWhatsapp('')).toBe('');
  });

  it('el error nombra WhatsApp y no "el teléfono"', () => {
    // El formulario muestra el error arriba del botón, no junto al campo: "el teléfono"
    // mandaría a corregir el campo equivocado.
    expect(() => leerWhatsapp('8765 432')).toThrow(/WhatsApp/);
  });

  it('el error dice de quién es el WhatsApp, si no es el del club (T184)', () => {
    // La pestaña "Tienda y cafetería" tiene dos: el error tiene que decir cuál corregir.
    expect(() => leerWhatsapp('8765 432', 'El WhatsApp de la tienda')).toThrow(
      'El WhatsApp de la tienda tiene que tener 9 dígitos, sin contar el +56.',
    );
  });
});
