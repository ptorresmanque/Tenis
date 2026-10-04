import { aCsv, SEPARADOR } from './csv';

/**
 * T59: la salida que el club va a usar de verdad.
 *
 * Lo que este archivo persigue es el error silencioso del CSV: **un nombre con una coma
 * parte la fila en dos** y todas las columnas de la derecha se corren. En una planilla
 * eso no se ve como un error, se ve como datos, y alguien decide con ellos.
 */
describe('CSV', () => {
  const sinBom = (texto: string) => texto.replace(/^\uFEFF/, '');
  const lineas = (texto: string) => sinBom(texto).split('\r\n');

  it('escribe el encabezado y una fila por dato', () => {
    const csv = aCsv(['Corte', 'Ingreso'], [['Techada', 320000]]);

    expect(lineas(csv)).toEqual(['Corte;Ingreso', 'Techada;320000']);
  });

  it('sin filas deja el encabezado solo, que sigue siendo un CSV válido', () => {
    expect(lineas(aCsv(['Corte', 'Ingreso'], []))).toEqual(['Corte;Ingreso']);
  });

  describe('lo que hay que escapar', () => {
    it('**un nombre con el separador no parte la fila**', () => {
      // El error que corre todas las columnas de la derecha sin avisar.
      const csv = aCsv(['Socio', 'Deuda'], [['Díaz; Carolina', 25000]]);

      expect(lineas(csv)[1]).toBe('"Díaz; Carolina";25000');
    });

    it('**una comilla se duplica**', () => {
      // Sin duplicarla, el campo queda abierto y se come el resto del archivo.
      const csv = aCsv(['Cancha'], [['La "grande"']]);

      expect(lineas(csv)[1]).toBe('"La ""grande"""');
    });

    it('un salto de línea dentro de un campo se entrecomilla', () => {
      // Entrecomillado, el salto queda **dentro** de la celda y no parte la fila: por
      // eso al cortar por CRLF sigue habiendo dos líneas y no tres.
      const csv = aCsv(['Nota'], [['Primera\nSegunda']]);

      expect(lineas(csv)).toEqual(['Nota', '"Primera\nSegunda"']);
    });

    it('una coma no necesita comillas: el separador no es la coma', () => {
      // Con punto y coma como separador, una coma es un carácter más.
      const csv = aCsv(['Socio'], [['Díaz, Carolina']]);

      expect(lineas(csv)[1]).toBe('Díaz, Carolina');
    });

    it('el encabezado se escapa con la misma regla', () => {
      expect(lineas(aCsv(['Un; raro'], []))[0]).toBe('"Un; raro"');
    });
  });

  describe('los valores', () => {
    it('los números van sin formato: los formatea la planilla', () => {
      // Un "$320.000" es texto y no suma. El CSV lleva el número crudo.
      expect(lineas(aCsv(['Monto'], [[320000]]))[1]).toBe('320000');
    });

    it('un decimal va con coma, que es lo que Excel en español lee como número', () => {
      // T77: la ocupación se mide en medias horas. Con punto, "0.5" se abre como texto
      // o como fecha, y la columna deja de sumar.
      expect(lineas(aCsv(['Horas'], [[0.5]]))[1]).toBe('0,5');
      expect(lineas(aCsv(['Horas'], [[12.5]]))[1]).toBe('12,5');
    });

    it('un nulo queda como celda vacía, no como la palabra null', () => {
      expect(lineas(aCsv(['Ocupación'], [[null]]))[1]).toBe('');
    });

    it('el cero es un cero y no una celda vacía', () => {
      // Son cosas distintas: cero es "nadie vino", vacío es "no se midió".
      expect(lineas(aCsv(['Ocupación'], [[0]]))[1]).toBe('0');
    });
  });

  describe('para que una planilla lo abra bien', () => {
    it('**empieza con BOM, o Excel se come los acentos**', () => {
      // Sin él, "Díaz" se abre como "DÃ­az" y el club piensa que el sistema
      // guarda mal los nombres.
      expect(aCsv(['Socio'], [])).toMatch(/^\uFEFF/);
    });

    it('el separador es el punto y coma', () => {
      // Excel en español parte por punto y coma, no por coma: con coma, el archivo
      // se abre entero en una sola columna y el club vuelve a copiar a mano.
      expect(SEPARADOR).toBe(';');
    });

    it('las líneas terminan en CRLF, como manda el formato', () => {
      expect(aCsv(['A'], [['b']])).toContain('\r\n');
    });
  });
});
