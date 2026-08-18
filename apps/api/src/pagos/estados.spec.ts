import { EstadoTransaccion } from '../generated/prisma/client';
import { transicionar } from './estados';

/**
 * T15. Las transiciones de `SPEC-pagos.md` § Modelo de datos.
 *
 * Cualquier transición fuera de las permitidas es un error, no una advertencia: una
 * transacción que retrocede es plata que se cobró dos veces o que se dio por cobrada
 * sin estarlo.
 */
describe('transicionar', () => {
  const { PENDIENTE, AUTORIZADA, RECHAZADA, ANULADA, EXPIRADA } =
    EstadoTransaccion;

  // Escritas a mano y no leídas de la tabla del código: derivarlas de lo que se
  // prueba haría que el test pase por construcción. Es el error que ya costó dos
  // tests falsos en T4 y T11.
  const PERMITIDAS: ReadonlyArray<[EstadoTransaccion, EstadoTransaccion]> = [
    [PENDIENTE, AUTORIZADA],
    [PENDIENTE, RECHAZADA],
    [PENDIENTE, EXPIRADA],
    [AUTORIZADA, ANULADA],
  ];

  const TODOS = Object.values(EstadoTransaccion);

  const invalidas = TODOS.flatMap((desde) =>
    TODOS.map((hacia): [EstadoTransaccion, EstadoTransaccion] => [
      desde,
      hacia,
    ]),
  ).filter(
    ([desde, hacia]) =>
      !PERMITIDAS.some(([d, h]) => d === desde && h === hacia),
  );

  it.each(PERMITIDAS)(
    '%s → %s es válida y devuelve el destino',
    (desde, hacia) => {
      expect(transicionar(desde, hacia)).toBe(hacia);
    },
  );

  it.each(invalidas)('%s → %s no existe y lanza', (desde, hacia) => {
    expect(() => transicionar(desde, hacia)).toThrow();
  });

  it.each(TODOS)('no se vuelve a PENDIENTE desde %s', (desde) => {
    // El criterio explícito de T15. Volver a PENDIENTE es lo que permitiría cobrar
    // de nuevo algo ya cobrado.
    expect(() => transicionar(desde, PENDIENTE)).toThrow();
  });

  it('AUTORIZADA → AUTORIZADA tampoco pasa: la idempotencia se resuelve antes', () => {
    // T18 devuelve el mismo resultado sin volver a llamar a la pasarela *sin* pasar
    // por acá. Permitir el bucle acá dejaría que un segundo callback reescriba el
    // código de autorización y la fecha de confirmación del primero.
    expect(() => transicionar(AUTORIZADA, AUTORIZADA)).toThrow();
  });

  it('EXPIRADA → AUTORIZADA lanza: el bloque ya se liberó', () => {
    // Pasa de verdad: la pasarela responde después del barrido de los 15 minutos.
    // Confirmar ahí dejaría una reserva sobre un bloque que otro ya tomó.
    expect(() => transicionar(EXPIRADA, AUTORIZADA)).toThrow();
  });

  it('el mensaje nombra los dos estados', () => {
    // Un "transición inválida" a secas obliga a reproducir el caso para saber qué
    // pasó; el log de producción es lo único que va a quedar de este error.
    expect(() => transicionar(ANULADA, AUTORIZADA)).toThrow(
      /ANULADA.*AUTORIZADA/,
    );
  });
});
