import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { hashear } from '../src/identidad/contrasena';
import {
  PerfilGoogle,
  ProveedorGoogle,
} from '../src/identidad/google/google.port';
import { NOMBRE_COOKIE } from '../src/identidad/sesion/cookie';
import { SesionService } from '../src/identidad/sesion/sesion.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * T7. La tarea con más superficie de ataque de `identidad`.
 *
 * El test que no puede faltar es el del correo no verificado: sin esa condición,
 * cualquiera que registre el correo de un socio en un proveedor que no lo verifica
 * se queda con su cuenta del club.
 */
describe('Entrar con Google', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const DOMINIO = '@google.test';
  const email = `socio${DOMINIO}`;
  const CODIGO = 'codigo-de-google';

  /** El perfil que Google devolvería; cada test lo ajusta antes del callback. */
  let perfil: PerfilGoogle;
  let ultimoDesafio = '';

  let configurado = true;

  const proveedorDoble: ProveedorGoogle = {
    configurado: () => configurado,
    urlDeAutorizacion: (state, desafio) => {
      ultimoDesafio = desafio;
      return `https://accounts.google.example/auth?state=${state}&code_challenge=${desafio}`;
    },
    perfil: (codigo) => Promise.resolve(codigo === CODIGO ? perfil : null),
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ProveedorGoogle)
      .useValue(proveedorDoble)
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
    configurado = true;
    perfil = {
      googleId: 'google-123',
      email,
      emailVerificado: true,
      nombre: 'Matías',
      apellido: 'Rojas',
    };
  });

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];

  /** Arranca el flujo y devuelve la cookie temporal y el state que viajó a Google. */
  const empezar = async (): Promise<{ cookie: string; state: string }> => {
    const respuesta = await request(servidor())
      .get('/api/auth/google')
      .expect(302);

    const destino = new URL(respuesta.headers.location);
    const cookies = respuesta.headers['set-cookie'] as unknown as string[];

    return {
      cookie: cookies[0].split(';')[0],
      state: destino.searchParams.get('state') ?? '',
    };
  };

  const volver = (cookie: string, consulta: string) =>
    request(servidor())
      .get(`/api/auth/google/callback?${consulta}`)
      .set('Cookie', cookie);

  /** El camino completo y feliz: ir a Google y volver con un código bueno. */
  const entrarConGoogle = async () => {
    const { cookie, state } = await empezar();
    return volver(cookie, `code=${CODIGO}&state=${state}`).expect(302);
  };

  const usuarios = () =>
    prisma.usuario.findMany({ where: { email: { endsWith: DOMINIO } } });

  /**
   * La cookie de sesión de una respuesta, si la hay. Se busca entre todas: la
   * vuelta de Google siempre trae al menos la del flujo, que se está borrando.
   */
  const cookieDeSesion = (respuesta: request.Response): string | undefined =>
    (respuesta.headers['set-cookie'] as unknown as string[] | undefined)?.find(
      (galleta) => galleta.startsWith(`${NOMBRE_COOKIE}=`),
    );

  it('manda a Google un desafío, nunca el verificador en claro', async () => {
    const { cookie } = await empezar();

    // Si el desafío viajara igual al verificador que guarda la cookie, PKCE no
    // protegería de nada: quien intercepte el código podría canjearlo.
    expect(ultimoDesafio).not.toBe('');
    expect(cookie).not.toContain(ultimoDesafio);
  });

  it('sin credenciales configuradas avisa en vez de reventar', async () => {
    configurado = false;

    const respuesta = await request(servidor())
      .get('/api/auth/google')
      .expect(302);

    expect(respuesta.headers.location).toContain('error=sin_configurar');
  });

  it('con un correo nuevo crea la cuenta y abre sesión', async () => {
    const respuesta = await entrarConGoogle();

    const [usuario] = await usuarios();
    expect(usuario.googleId).toBe('google-123');
    expect(usuario.emailVerificado).toBe(true);
    expect(cookieDeSesion(respuesta)).toBeDefined();
  });

  it('la cuenta que crea Google no tiene contraseña', async () => {
    await entrarConGoogle();

    const [usuario] = await usuarios();
    // Quien entra solo con Google nunca eligió una contraseña; inventarle una
    // dejaría un hash que nadie puede usar y que igual hay que custodiar.
    expect(usuario.passwordHash).toBeNull();
  });

  it('sobre un correo ya registrado vincula, no duplica', async () => {
    const existente = await prisma.usuario.create({
      data: {
        email,
        nombre: 'Matías',
        apellido: 'Rojas',
        // Verificado: es el socio que ya usaba el club con su contraseña. El caso
        // de una cuenta sin verificar tiene sus propios tests más abajo.
        emailVerificado: true,
        passwordHash: await hashear('raqueta lluviosa 44'),
      },
    });

    await entrarConGoogle();

    const encontrados = await usuarios();
    expect(encontrados).toHaveLength(1);
    expect(encontrados[0].id).toBe(existente.id);
    expect(encontrados[0].googleId).toBe('google-123');
    // La contraseña sigue sirviendo: vincular agrega una forma de entrar, no la cambia.
    expect(encontrados[0].passwordHash).toBe(existente.passwordHash);
  });

  describe('vincular sobre una cuenta cuyo correo nadie había verificado', () => {
    /**
     * El robo que queda si esto no se cubre: alguien registra el correo de un socio
     * con una contraseña suya. El correo de verificación le llega al socio, que lo
     * ignora. Cuando el socio entra con Google, la cuenta se vincula a su nombre...
     * y el otro sigue teniendo una contraseña válida para entrar a ella.
     */
    const registrarSinVerificar = async () =>
      prisma.usuario.create({
        data: {
          email,
          nombre: 'Matías',
          apellido: 'Rojas',
          emailVerificado: false,
          passwordHash: await hashear('la contraseña del atacante'),
        },
      });

    it('deja sin efecto la contraseña que nadie demostró ser suya', async () => {
      await registrarSinVerificar();

      await entrarConGoogle();

      const [usuario] = await usuarios();
      expect(usuario.googleId).toBe('google-123');
      expect(usuario.passwordHash).toBeNull();
    });

    it('cierra las sesiones abiertas con esa contraseña', async () => {
      const previo = await registrarSinVerificar();
      const sesiones = app.get(SesionService);
      await sesiones.abrirPara(previo.id);

      await entrarConGoogle();

      expect(
        await prisma.sesion.count({ where: { usuarioId: previo.id } }),
      ).toBe(1);
    });

    it('conserva la contraseña si el correo ya estaba verificado', async () => {
      const previo = await prisma.usuario.create({
        data: {
          email,
          nombre: 'Matías',
          apellido: 'Rojas',
          emailVerificado: true,
          passwordHash: await hashear('raqueta lluviosa 44'),
        },
      });

      await entrarConGoogle();

      // Acá la misma persona demostró el correo por dos caminos: no hay motivo
      // para quitarle la contraseña que venía usando.
      const [usuario] = await usuarios();
      expect(usuario.passwordHash).toBe(previo.passwordHash);
    });
  });

  it('volver a entrar con la misma cuenta de Google no crea otra', async () => {
    await entrarConGoogle();
    await entrarConGoogle();

    expect(await usuarios()).toHaveLength(1);
  });

  describe('correo sin verificar', () => {
    beforeEach(() => {
      perfil = { ...perfil, emailVerificado: false };
    });

    it('sobre una cuenta existente se rechaza y no vincula', async () => {
      const existente = await prisma.usuario.create({
        data: {
          email,
          nombre: 'Matías',
          apellido: 'Rojas',
          passwordHash: await hashear('raqueta lluviosa 44'),
        },
      });

      const respuesta = await entrarConGoogle();

      // El corazón de T7. Si esto vinculara, cualquiera que registre el correo de
      // un socio en un proveedor que no lo verifica se queda con su cuenta.
      const [usuario] = await usuarios();
      expect(usuario.id).toBe(existente.id);
      expect(usuario.googleId).toBeNull();
      expect(cookieDeSesion(respuesta)).toBeUndefined();
    });

    it('el rechazo lleva a la pantalla de ingreso con el motivo', async () => {
      const respuesta = await entrarConGoogle();

      // El motivo viaja para que la SPA pueda decir "entra con tu contraseña" en
      // vez de un "no se pudo" que deja a la persona sin saber qué hacer.
      expect(respuesta.headers.location).toContain('/entrar');
      expect(respuesta.headers.location).toContain(
        'error=correo_no_verificado',
      );
    });

    it('tampoco crea una cuenta nueva', async () => {
      await entrarConGoogle();

      expect(await usuarios()).toHaveLength(0);
    });
  });

  describe('vuelta manipulada', () => {
    it('un state que no coincide se rechaza', async () => {
      const { cookie } = await empezar();

      const respuesta = await volver(
        cookie,
        `code=${CODIGO}&state=otro-state`,
      ).expect(302);

      // El state es lo que ata esta vuelta al navegador que empezó el flujo.
      expect(cookieDeSesion(respuesta)).toBeUndefined();
      expect(await usuarios()).toHaveLength(0);
    });

    it('sin la cookie del inicio se rechaza', async () => {
      const { state } = await empezar();

      const respuesta = await request(servidor())
        .get(`/api/auth/google/callback?code=${CODIGO}&state=${state}`)
        .expect(302);

      expect(cookieDeSesion(respuesta)).toBeUndefined();
      expect(await usuarios()).toHaveLength(0);
    });

    it('quien se arrepiente en la pantalla de Google vuelve sin error de falla', async () => {
      const { cookie } = await empezar();

      const respuesta = await volver(cookie, 'error=access_denied').expect(302);

      // Cancelar no es que algo se rompió, y el mensaje tiene que decir eso.
      expect(respuesta.headers.location).toContain('error=cancelado');
      expect(cookieDeSesion(respuesta)).toBeUndefined();
    });

    it('un código que Google no reconoce se rechaza', async () => {
      const { cookie, state } = await empezar();

      const respuesta = await volver(
        cookie,
        `code=codigo-inventado&state=${state}`,
      ).expect(302);

      expect(respuesta.headers.location).toContain('/entrar');
      expect(await usuarios()).toHaveLength(0);
    });

    it('la cookie del flujo se borra al volver', async () => {
      const { cookie, state } = await empezar();

      const respuesta = await volver(cookie, `code=${CODIGO}&state=${state}`);
      const cookies = respuesta.headers['set-cookie'] as unknown as string[];

      // Un verificador PKCE sirve una sola vez; dejarlo en el navegador es basura
      // con valor para quien la encuentre.
      expect(cookies.some((c) => c.startsWith('google_oauth=;'))).toBe(true);
    });
  });
});
