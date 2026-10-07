import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { verify } from '@node-rs/argon2';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { CorreoSaliente, EnviadorCorreo } from '../src/identidad/correo';
import { IntentosFallidos } from '../src/identidad/intentos';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T5. El registro es la primera puerta abierta al mundo: valida en el borde, no
 * revela quién tiene cuenta, y la contraseña no sale por ningún lado.
 */
describe('Registro con email y contraseña', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Dominio propio de este archivo: Jest corre los archivos en paralelo y otro
  // test que borrara por email podría llevarse estas cuentas a mitad de camino.
  const DOMINIO = '@registro.test';
  const email = `nuevo${DOMINIO}`;
  const CONTRASENA = 'raqueta lluviosa 44';

  const enviados: CorreoSaliente[] = [];
  // Cómo termina el envío. Por defecto, bien; un test lo cambia para simular un
  // sendmail que falla o que no responde.
  let terminarEnvio = (): Promise<void> => Promise.resolve();
  const enviadorDoble: EnviadorCorreo = {
    enviar: (correo) => {
      enviados.push(correo);
      return terminarEnvio();
    },
  };

  const cuerpoValido = {
    email,
    contrasena: CONTRASENA,
    nombre: 'Sofía',
    apellido: 'Contreras',
    telefono: '+56966666666',
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EnviadorCorreo)
      .useValue(enviadorDoble)
      .compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.usuario.deleteMany({
      where: { email: { endsWith: DOMINIO } },
    });
    enviados.length = 0;
    terminarEnvio = () => Promise.resolve();
  });

  // getHttpServer() devuelve `any`; el tipo que supertest espera se saca de él mismo.
  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  const registrar = (cuerpo: Record<string, unknown>) =>
    request(servidor()).post('/api/auth/registro').send(cuerpo);

  it('crea el usuario con la contraseña hasheada con argon2id', async () => {
    await registrar(cuerpoValido).expect(201);

    const usuario = await prisma.usuario.findUnique({ where: { email } });

    expect(usuario?.passwordHash?.startsWith('$argon2id$')).toBe(true);
    expect(await verify(usuario!.passwordHash!, CONTRASENA)).toBe(true);
  });

  it('crea un visitante: sin ficha de socio y con el correo sin verificar', async () => {
    await registrar(cuerpoValido).expect(201);

    const usuario = await prisma.usuario.findUnique({
      where: { email },
      include: { socio: true },
    });

    expect(usuario?.socio).toBeNull();
    expect(usuario?.emailVerificado).toBe(false);
    expect(usuario?.esAdmin).toBe(false);
  });

  it('normaliza el correo: mayúsculas y espacios no crean una cuenta aparte', async () => {
    await registrar(cuerpoValido).expect(201);
    await registrar({
      ...cuerpoValido,
      email: `  NUEVO${DOMINIO.toUpperCase()} `,
    });

    expect(
      await prisma.usuario.count({ where: { email: { endsWith: DOMINIO } } }),
    ).toBe(1);
  });

  describe('rechazos', () => {
    it('rechaza una contraseña de menos de 10 caracteres, diciendo por qué', async () => {
      const respuesta = await registrar({
        ...cuerpoValido,
        contrasena: 'corta123',
      }).expect(400);

      expect(JSON.stringify(respuesta.body)).toContain('10');
      expect(await prisma.usuario.count({ where: { email } })).toBe(0);
    });

    it('rechaza una contraseña que está en la lista de filtradas', async () => {
      const respuesta = await registrar({
        ...cuerpoValido,
        contrasena: 'password123',
      }).expect(400);

      expect(JSON.stringify(respuesta.body)).toContain('filtradas');
      expect(await prisma.usuario.count({ where: { email } })).toBe(0);
    });

    it('rechaza un correo con formato inválido', async () => {
      await registrar({ ...cuerpoValido, email: 'no-es-un-correo' }).expect(
        400,
      );
    });

    it('rechaza el nombre vacío', async () => {
      await registrar({ ...cuerpoValido, nombre: '   ' }).expect(400);
    });

    it('rechaza un nombre más largo que la columna, con un mensaje que se lee bien', async () => {
      // La web muestra este texto tal cual: decía "el nombre es demasiado largo.",
      // con minúscula, y sin decir hasta dónde.
      const respuesta = await registrar({
        ...cuerpoValido,
        nombre: 'a'.repeat(192),
      }).expect(400);

      expect((respuesta.body as { message: string }).message).toBe(
        'Acorta el nombre: tiene más de 191 caracteres.',
      );
    });

    it('rechaza un cuerpo sin los campos obligatorios', async () => {
      await registrar({}).expect(400);
    });
  });

  describe('no revela quién tiene cuenta', () => {
    it('responde a un correo ya registrado igual que a uno nuevo', async () => {
      const primera = await registrar(cuerpoValido).expect(201);
      const segunda = await registrar({
        ...cuerpoValido,
        contrasena: 'otra contraseña larga',
      }).expect(201);

      // Mismo status y mismo cuerpo: si difirieran, el formulario de registro se
      // convierte en un oráculo para averiguar quién es socio del club.
      expect(segunda.body).toEqual(primera.body);
    });

    it('no sobrescribe la contraseña de la cuenta que ya existía', async () => {
      await registrar(cuerpoValido).expect(201);
      await registrar({ ...cuerpoValido, contrasena: 'otra contraseña larga' });

      const usuario = await prisma.usuario.findUnique({ where: { email } });

      // Sin esto, cualquiera reescribe la contraseña de un socio con solo saber
      // su correo. Es la toma de cuenta más barata que existe.
      expect(await verify(usuario!.passwordHash!, CONTRASENA)).toBe(true);
    });

    it('no crea un segundo usuario con el mismo correo', async () => {
      await registrar(cuerpoValido);
      await registrar(cuerpoValido);

      expect(await prisma.usuario.count({ where: { email } })).toBe(1);
    });
  });

  describe('si el correo no sale', () => {
    beforeEach(() => {
      terminarEnvio = () => Promise.reject(new Error('sendmail salió con 75'));
    });

    it('la cuenta queda creada y la respuesta es la de siempre', async () => {
      // Antes respondía 500, y la web decía "No pudimos crear la cuenta" sobre una
      // cuenta que sí existe. El enlace se pide de nuevo desde /verificar-correo.
      const respuesta = await registrar(cuerpoValido).expect(201);

      expect((respuesta.body as { mensaje: string }).mensaje).toContain(
        'te llega un enlace',
      );
      expect(await prisma.usuario.count({ where: { email } })).toBe(1);
    });

    it('a un correo que ya tenía cuenta le responde igual', async () => {
      const nueva = await registrar(cuerpoValido).expect(201);
      const repetida = await registrar(cuerpoValido).expect(201);

      // Si solo uno de los dos caminos fallara, sendmail caído diría quién tiene cuenta.
      expect(repetida.body).toEqual(nueva.body);
    });
  });

  describe('la contraseña no se filtra', () => {
    it('no aparece en la respuesta del registro exitoso', async () => {
      const respuesta = await registrar(cuerpoValido).expect(201);

      expect(JSON.stringify(respuesta.body)).not.toContain(CONTRASENA);
    });

    it('no aparece en el mensaje de error de un rechazo', async () => {
      const respuesta = await registrar({
        ...cuerpoValido,
        contrasena: 'password123',
      }).expect(400);

      expect(JSON.stringify(respuesta.body)).not.toContain('password123');
    });

    it('no aparece en la salida del proceso', async () => {
      const escrito: string[] = [];
      const espiar = (flujo: NodeJS.WriteStream) =>
        jest
          .spyOn(flujo, 'write')
          .mockImplementation((texto: string | Uint8Array) => {
            escrito.push(String(texto));
            return true;
          });

      const salida = espiar(process.stdout);
      const errores = espiar(process.stderr);
      try {
        await registrar(cuerpoValido);
        await registrar({ ...cuerpoValido, contrasena: 'password123' });
      } finally {
        salida.mockRestore();
        errores.mockRestore();
      }

      expect(escrito.join('')).not.toContain(CONTRASENA);
    });
  });

  describe('verificación del correo', () => {
    const enlaceDelUltimoCorreo = (): string => {
      const enlace = /https?:\/\/\S+token=[\w.-]+/.exec(
        enviados.at(-1)?.cuerpo ?? '',
      );
      if (!enlace) {
        throw new Error('El correo enviado no trae enlace de verificación.');
      }
      return enlace[0];
    };

    const verificarCon = (enlace: string) =>
      request(servidor()).get(`/api/auth/verificar?${enlace.split('?')[1]}`);

    it('manda un correo al registrarse', async () => {
      await registrar(cuerpoValido).expect(201);

      expect(enviados).toHaveLength(1);
      expect(enviados[0].para).toBe(email);
    });

    it('el enlace del correo deja el correo verificado', async () => {
      await registrar(cuerpoValido);

      await verificarCon(enlaceDelUltimoCorreo()).expect(302);

      const usuario = await prisma.usuario.findUnique({ where: { email } });
      expect(usuario?.emailVerificado).toBe(true);
    });

    it('el enlace lleva a /verificar-correo, que se abre también con la sesión iniciada', async () => {
      // Antes llevaba a /registro, que es solo para quien no tiene sesión: quien se
      // registró, entró y abrió el correo después volvía al inicio sin saber si
      // había quedado verificado.
      await registrar(cuerpoValido);

      const respuesta = await verificarCon(enlaceDelUltimoCorreo()).expect(302);

      expect(respuesta.headers.location).toMatch(
        /\/verificar-correo\?verificado=1$/,
      );
    });

    it('el enlace no sirve dos veces', async () => {
      await registrar(cuerpoValido);
      const enlace = enlaceDelUltimoCorreo();
      await verificarCon(enlace);

      const respuesta = await verificarCon(enlace).expect(302);

      expect(respuesta.headers.location).toContain('verificado=0');
    });

    it('un token inventado no verifica a nadie', async () => {
      await registrar(cuerpoValido);

      const respuesta = await verificarCon(
        'http://x/api/auth/verificar?token=inventado',
      ).expect(302);

      expect(respuesta.headers.location).toContain('verificado=0');
      const usuario = await prisma.usuario.findUnique({ where: { email } });
      expect(usuario?.emailVerificado).toBe(false);
    });

    it('un token vencido no verifica a nadie', async () => {
      await registrar(cuerpoValido);
      const enlace = enlaceDelUltimoCorreo();
      await prisma.usuario.update({
        where: { email },
        data: { verificacionExpiraEn: new Date(Date.now() - 1000) },
      });

      await verificarCon(enlace).expect(302);

      const usuario = await prisma.usuario.findUnique({ where: { email } });
      expect(usuario?.emailVerificado).toBe(false);
    });

    it('el correo al que ya tenía cuenta no trae enlace de verificación', async () => {
      await registrar(cuerpoValido);
      enviados.length = 0;

      await registrar(cuerpoValido).expect(201);

      // Se le avisa que alguien intentó registrarse con su correo, pero un enlace
      // acá dejaría a un desconocido disparando verificaciones de una cuenta ajena.
      expect(enviados).toHaveLength(1);
      expect(enviados[0].cuerpo).not.toContain('token=');
    });

    describe('pedir un enlace nuevo', () => {
      const pedirEnlace = (correo: string) =>
        request(servidor())
          .post('/api/auth/reenviar-verificacion')
          .send({ email: correo });

      beforeEach(() => {
        // El freno vive en memoria y lo comparte todo el archivo: sin esto, los
        // pedidos de un test se suman a los del siguiente. Las cuatro formas en que
        // Express puede reportar el localhost, igual que en contacto.spec.ts.
        const pedidos = app.get(IntentosFallidos);
        for (const ip of ['::ffff:127.0.0.1', '127.0.0.1', '::1', 'sin-ip']) {
          pedidos.perdonar(`verificacion|${email}|${ip}`);
        }
      });

      it('con el enlace vencido, el nuevo deja el correo verificado', async () => {
        await registrar(cuerpoValido);
        await prisma.usuario.update({
          where: { email },
          data: { verificacionExpiraEn: new Date(Date.now() - 1000) },
        });
        enviados.length = 0;

        await pedirEnlace(email).expect(201);

        expect(enviados).toHaveLength(1);
        expect(enviados[0].para).toBe(email);
        await verificarCon(enlaceDelUltimoCorreo()).expect(302);
        const usuario = await prisma.usuario.findUnique({ where: { email } });
        expect(usuario?.emailVerificado).toBe(true);
      });

      it('el enlace anterior deja de servir', async () => {
        await registrar(cuerpoValido);
        const anterior = enlaceDelUltimoCorreo();

        await pedirEnlace(email).expect(201);

        // Si los dos siguieran vivos, pedir uno nuevo no cortaría un enlace que
        // llegó a otras manos.
        const respuesta = await verificarCon(anterior).expect(302);
        expect(respuesta.headers.location).toContain('verificado=0');
      });

      it('responde lo mismo a un correo sin cuenta, y no le manda nada', async () => {
        await registrar(cuerpoValido);
        enviados.length = 0;

        const conCuenta = await pedirEnlace(email).expect(201);
        const sinCuenta = await pedirEnlace(`nadie${DOMINIO}`).expect(201);

        expect(sinCuenta.body).toEqual(conCuenta.body);
        expect(enviados.map((correo) => correo.para)).toEqual([email]);
      });

      it('a una cuenta ya verificada no le manda otro enlace', async () => {
        await registrar(cuerpoValido);
        await verificarCon(enlaceDelUltimoCorreo());
        enviados.length = 0;

        await pedirEnlace(email).expect(201);

        expect(enviados).toHaveLength(0);
      });

      it('responde lo mismo aunque el envío falle', async () => {
        await registrar(cuerpoValido);
        const bien = await pedirEnlace(email).expect(201);
        terminarEnvio = () => Promise.reject(new Error('sendmail salió con 1'));

        const mal = await pedirEnlace(email).expect(201);

        // Un error solo cuando hay cuenta sería otra forma de decir quién la tiene.
        expect(mal.body).toEqual(bien.body);
      });

      it('no espera a que el correo termine de salir', async () => {
        await registrar(cuerpoValido);
        // Un envío que no termina mientras dura el pedido. Si la respuesta lo
        // esperara, lo que tarda sendmail diría qué correos tienen cuenta: a los que
        // no tienen no se les manda nada y responden al tiro.
        let soltar = () => {};
        terminarEnvio = () =>
          new Promise<void>((resolver) => (soltar = resolver));

        try {
          await pedirEnlace(email).timeout(2000).expect(201);
        } finally {
          // Si la respuesta sí lo esperaba, esto la libera y la app puede cerrarse.
          soltar();
        }
      });

      it('rechaza un correo con formato inválido', async () => {
        await pedirEnlace('no-es-un-correo').expect(400);
      });

      it('al sexto pedido seguido responde 429, sin dejar afuera a otros correos', async () => {
        // Correo propio: este test agota su cuota y el `beforeEach` no la limpia.
        const correo = `freno${DOMINIO}`;
        for (let i = 0; i < 5; i++) {
          await pedirEnlace(correo).expect(201);
        }

        await pedirEnlace(correo).expect(429);
        await pedirEnlace(email).expect(201);
      });
    });
  });
});
