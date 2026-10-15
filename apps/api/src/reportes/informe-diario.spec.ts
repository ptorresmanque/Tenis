import { FilaDelInforme } from './informe-del-dia.service';
import { informeEnTexto } from './informe-diario.service';

/** T275. El correo del informe diario: lo que lee el club, en texto plano. */
describe('El correo del informe diario', () => {
  const RESERVA: FilaDelInforme = {
    inicio: '19:00',
    fin: '20:30',
    lugar: 'Cancha 3',
    tipo: 'Reserva',
    quien: 'Camila Rojas',
    telefono: '+56911112222',
    socioOVisitante: 'Visitante',
    folio: 'AB23CDE',
    estado: 'Confirmada',
    acompanantes: 'Beto Rival',
    observaciones: 'Llegó tarde (Rodrigo)',
  };
  const CLASE: FilaDelInforme = {
    inicio: '08:00',
    fin: '09:00',
    lugar: 'Gimnasio',
    tipo: 'Clase de preparación física',
    quien: 'Ana Silva',
    telefono: null,
    socioOVisitante: null,
    folio: null,
    estado: 'Programada',
    acompanantes: '',
    observaciones: '',
  };

  const correo = (filas: FilaDelInforme[]) =>
    informeEnTexto(
      '2042-03-11',
      filas,
      { nombre: 'Rodrigo' },
      'https://qa.fedal.cl',
      '-- \nFEDAL',
    );

  it('el asunto dice de qué día es', () => {
    expect(correo([]).asunto).toBe('Agenda del día: martes, 11 de marzo');
  });

  it('**una línea por hora, con lo que importa al mesón, y debajo con quién y las notas**', () => {
    const { cuerpo } = correo([CLASE, RESERVA]);

    expect(cuerpo).toContain('Hola Rodrigo:');
    expect(cuerpo).toContain(
      '08:00–09:00 · Gimnasio · Clase de preparación física · Ana Silva · Programada',
    );
    expect(cuerpo).toContain(
      '19:00–20:30 · Cancha 3 · Camila Rojas (visitante) · +56911112222 · Folio AB23CDE · Confirmada',
    );
    expect(cuerpo).toContain('   Con Beto Rival');
    expect(cuerpo).toContain('   Observaciones: Llegó tarde (Rodrigo)');
    expect(cuerpo).toContain('1 reserva y 1 clase.');
    expect(cuerpo).toContain('https://qa.fedal.cl/administracion/reservas');
    expect(cuerpo.endsWith('-- \nFEDAL')).toBe(true);
  });

  it('un día sin nada sale igual, y lo dice', () => {
    expect(correo([]).cuerpo).toContain('Hoy no hay reservas ni clases.');
  });
});
