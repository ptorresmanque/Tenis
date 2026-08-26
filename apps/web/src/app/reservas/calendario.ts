/**
 * El archivo `.ics` de una reserva, armado en el navegador.
 *
 * Sin backend y sin librería: un evento de calendario son quince líneas de texto
 * plano con un formato de 1998 que no cambió nunca. La alternativa —un endpoint
 * que lo genere— agregaría un viaje al servidor para juntar datos que la pantalla
 * ya tiene en la mano.
 *
 * `ponytail: un solo evento por archivo, sin recurrencia ni invitados. Si algún
 * día hay que exportar la agenda entera del socio, ahí sí conviene una librería.`
 */

export interface EventoDelClub {
  /** Lo que se ve en el calendario: "Cancha 3 · FEDAL Tennis Center". */
  titulo: string;
  descripcion: string;
  /** ISO en UTC, como llegan de la API. */
  inicio: string;
  fin: string;
  /** El folio: hace de identificador estable del evento. */
  folio: string;
}

/** "2026-08-21T18:00:00.000Z" → "20260821T180000Z", que es lo que come el formato. */
function enFormatoIcs(instante: string): string {
  return new Date(instante).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Escapa lo que el formato trata como sintaxis.
 *
 * Una coma sin escapar parte el campo en dos y el evento entra al calendario con
 * el título cortado. Pasa con cualquier cancha que se llame "Cancha 3, techada".
 */
function escapar(texto: string): string {
  return texto
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

export function comoIcs(evento: EventoDelClub): string {
  // CRLF y no \n: la especificación lo pide y Outlook es el que se pone exigente.
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FEDAL Tennis Center//Reservas//ES',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${escapar(evento.folio)}@fedaltenis.cl`,
    `DTSTAMP:${enFormatoIcs(new Date().toISOString())}`,
    `DTSTART:${enFormatoIcs(evento.inicio)}`,
    `DTEND:${enFormatoIcs(evento.fin)}`,
    `SUMMARY:${escapar(evento.titulo)}`,
    `DESCRIPTION:${escapar(evento.descripcion)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/**
 * Dispara la descarga del `.ics`.
 *
 * Un Blob y un enlace que se pulsa solo: es lo que hace cualquier "descargar" sin
 * servidor. La URL se revoca después, porque si no el archivo queda retenido en
 * memoria hasta que se cierre la pestaña.
 */
export function descargarIcs(evento: EventoDelClub, documento = document): void {
  const url = URL.createObjectURL(
    new Blob([comoIcs(evento)], { type: 'text/calendar;charset=utf-8' }),
  );

  const enlace = documento.createElement('a');
  enlace.href = url;
  enlace.download = `${evento.folio}.ics`;
  enlace.click();

  URL.revokeObjectURL(url);
}
