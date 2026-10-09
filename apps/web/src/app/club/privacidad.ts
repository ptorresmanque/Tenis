import { Component } from '@angular/core';

/** Un momento en que el club recibe datos tuyos, y lo que hace con ellos. */
interface Tratamiento {
  cuando: string;
  datos: string;
  paraQue: string;
  base: string;
}

/**
 * La política de privacidad del club (D9), con lo que exige el art. 14 ter de la
 * Ley 21.719.
 *
 * **El texto es fijo, a propósito.** Es un documento con versión y fecha: los datos
 * del responsable no salen de la configuración del club, como los del pie, porque
 * un cambio en el panel no puede cambiar una política ya publicada sin subirle la
 * versión. El texto describe lo que la app hace de verdad: si cambia lo que se
 * guarda o con quién se comparte, cambia esta página.
 *
 * Lo redactó Claude a partir del código y lo aprueba el club; el borrador con lo que
 * conviene que revise un abogado está en tasks/politica-privacidad-borrador.md.
 */
@Component({
  selector: 'app-privacidad',
  template: `
    <article class="max-w-prose">
      <h1 class="titular text-5xl sm:text-6xl">Política de privacidad</h1>
      <p class="mt-2 text-sm text-muted-foreground">
        Versión {{ version }} · vigente desde el {{ vigenteDesde }}
      </p>

      <p class="mt-6">
        En FEDAL Tennis Center usamos tus datos personales solo para lo que necesitas del club: tu
        cuenta, tus reservas, tus pagos, tus clases y tus torneos. Aquí te contamos qué datos
        tratamos, para qué, con quién los compartimos, cuánto tiempo los guardamos y cómo puedes
        ejercer tus derechos.
      </p>

      <h2 class="titular mt-10 text-3xl sm:text-4xl">1. Quién es responsable de tus datos</h2>
      <ul class="mt-3 grid list-disc gap-1 ps-5">
        <li><strong>Responsable:</strong> Fedal SpA, RUT 77.950.109-4.</li>
        <li><strong>Representante legal:</strong> Jonatan Illanes Bravo.</li>
        <li><strong>Domicilio:</strong> Lircay lt 42, Temuco.</li>
        <li>
          <strong>Correo para todo lo relacionado con tus datos:</strong>
          <a [href]="'mailto:' + correo" class="underline">{{ correo }}</a
          >.
        </li>
        <li>
          El club no ha designado un encargado de prevención ni un delegado de protección de datos.
        </li>
      </ul>

      <h2 class="titular mt-10 text-3xl sm:text-4xl">2. Qué datos tratamos y para qué</h2>
      @for (tratamiento of tratamientos; track tratamiento.cuando) {
        <section class="mt-5 border-t-4 border-primary pt-3">
          <h3 class="subtitulo">{{ tratamiento.cuando }}</h3>
          <dl class="mt-2 grid gap-2 text-sm">
            <div>
              <dt class="font-semibold">Qué datos</dt>
              <dd class="text-muted-foreground">{{ tratamiento.datos }}</dd>
            </div>
            <div>
              <dt class="font-semibold">Para qué</dt>
              <dd class="text-muted-foreground">{{ tratamiento.paraQue }}</dd>
            </div>
            <div>
              <dt class="font-semibold">Con qué base</dt>
              <dd class="text-muted-foreground">{{ tratamiento.base }}</dd>
            </div>
          </dl>
        </section>
      }

      <p class="mt-6">
        <strong>Cookies:</strong> usamos solo una cookie técnica de sesión, que te mantiene
        conectado hasta 30 días o hasta que cierres sesión, y una cookie temporal de 10 minutos
        mientras entras con Google. No usamos cookies de publicidad ni de analítica.
      </p>
      <p class="mt-3">
        <strong>Correos:</strong> solo te enviamos avisos del sistema, cada uno porque lo necesitas
        para usar el club. No te enviamos publicidad.
      </p>
      <ul class="mt-2 grid list-disc gap-1 ps-5">
        <li>La verificación de tu correo y la recuperación de tu contraseña.</li>
        <li>
          La confirmación de tu reserva, con el enlace a tu reserva y cómo cambiarla, para que sepas
          que quedó tomada y cómo llegar.
        </li>
        <li>
          Si reservas sin ser socio, un aviso por cada cambio de tu reserva, hecho desde tu enlace o
          por el club, para que te enteres si alguien con tu enlace la movió.
        </li>
        <li>
          Si eres socio, el recordatorio de tu cuota: unos días antes de fin de mes y, si quedó
          impaga, desde el día 1, para que no te quedes sin poder reservar.
        </li>
        <li>
          Si otro socio carga un partido interno que jugó contigo, un aviso para que lo confirmes o
          lo rechaces. Lleva su nombre y el resultado que cargó.
        </li>
        <li>
          Si el club cierra la cancha o agenda una clase en tu hora, el aviso de que se canceló.
        </li>
        <li>
          Si te inscribes en un torneo, la confirmación de tu inscripción; el aviso de que el pago
          de tu inscripción quedó confirmado o rechazado, con el motivo; el aviso de que el cuadro
          se armó o cambió, con tu primer partido; y cada vez que el club programa, cambia o quita
          la hora de uno de tus partidos.
        </li>
        <li>
          Si eres administrador del club, el aviso de cada comprobante de transferencia que llega
          para revisar, con el nombre de quien se inscribió, la categoría y el monto.
        </li>
      </ul>

      <h2 class="titular mt-10 text-3xl sm:text-4xl">3. Decisiones automatizadas</h2>
      <p class="mt-3">
        Algunas reglas del club las aplica el sistema sin que intervenga una persona:
      </p>
      <ul class="mt-3 grid list-disc gap-1 ps-5">
        <li>
          Si tu cuota está impaga o tu ficha de socio está suspendida, no puedes reservar hasta
          regularizar tu situación.
        </li>
        <li>
          Si un administrador confirma que tomaste una hora y no la usaste, no puedes reservar
          durante los días de sanción que fija el club. La sanción la decide una persona; el sistema
          solo la aplica.
        </li>
        <li>
          El sistema no deja pasar de los cupos del club: reservas por día, reservas en horario
          punta por semana y reservas con invitados por mes.
        </li>
      </ul>
      <p class="mt-3">
        Si crees que una de estas decisiones está mal aplicada en tu caso, escríbenos a
        <a [href]="'mailto:' + correo" class="underline">{{ correo }}</a> y una persona del club la
        revisa.
      </p>

      <h2 class="titular mt-10 text-3xl sm:text-4xl">4. Menores de edad</h2>
      <p class="mt-3">
        Las cuentas son solo para mayores de 18 años. Los menores usan las canchas y las clases
        junto a un adulto responsable. Cuando ese adulto anota a un menor, como acompañante en una
        reserva, en una clase o en un torneo, declara ser su padre, madre o tutor y da el
        consentimiento por él. Del menor guardamos solo su nombre y, en clases y torneos, el
        teléfono de contacto que entregue el adulto; en torneos, también el correo.
      </p>

      <h2 class="titular mt-10 text-3xl sm:text-4xl">5. Con quién compartimos tus datos</h2>
      <ul class="mt-3 grid list-disc gap-2 ps-5">
        <li><strong>Transbank (Chile)</strong> procesa los pagos con tarjeta.</li>
        <li>
          <strong>Haulmer (Chile)</strong> aloja el sitio, la base de datos y el correo del club, en
          servidores en Chile.
        </li>
        <li>
          <strong>Google (Estados Unidos), solo si eliges "Entrar con Google":</strong>
          recibe tu solicitud de ingreso y nos devuelve tu nombre y tu correo verificado. Como
          Google está en Estados Unidos, es una transferencia internacional: ocurre solo porque tú
          eliges esa forma de entrar, y siempre puedes usar tu correo y una contraseña en su lugar.
        </li>
        <li>
          <strong>YouTube (Google, Estados Unidos), en las transmisiones de torneos:</strong>
          los partidos se transmiten por YouTube, así que tu imagen en la cancha queda también en
          esa plataforma. Si abres la página de un torneo con transmisiones, tu navegador le pide a
          YouTube la miniatura de cada video. El reproductor se carga recién cuando aprietas play, y
          usa la versión de YouTube que no instala cookies hasta que reproduces el video.
        </li>
        <li>
          <strong>OpenStreetMap (Reino Unido), en la página "El club":</strong> el mapa con la
          ubicación del club se carga desde OpenStreetMap, así que tu navegador le pide las imágenes
          del mapa y, con eso, ve tu dirección IP. No le enviamos ningún dato tuyo. Los botones
          "Cómo llegar" abren Google Maps o Waze (Google, Estados Unidos) solo si los aprietas.
        </li>
        <li>
          <strong>Público en el sitio:</strong> los resultados, cuadros, ranking, fotos y
          transmisiones de los torneos quedan a la vista de cualquier persona.
        </li>
      </ul>
      <p class="mt-3">No vendemos ni cedemos tus datos para publicidad.</p>

      <h2 class="titular mt-10 text-3xl sm:text-4xl">6. Cuánto tiempo guardamos tus datos</h2>
      <dl class="mt-3 grid gap-3">
        @for (plazo of plazos; track plazo[0]) {
          <div class="grid gap-x-4 sm:grid-cols-2">
            <dt class="font-semibold">{{ plazo[0] }}</dt>
            <dd class="text-muted-foreground">{{ plazo[1] }}</dd>
          </div>
        }
      </dl>
      <p class="mt-3">
        Una vez al año, el club revisa los datos que ya cumplieron su plazo y los elimina o
        anonimiza.
      </p>

      <h2 class="titular mt-10 text-3xl sm:text-4xl">7. Cómo protegemos tus datos</h2>
      <ul class="mt-3 grid list-disc gap-1 ps-5">
        <li>Todo el sitio funciona con conexión cifrada (HTTPS).</li>
        <li>Las contraseñas se guardan con un cifrado irreversible (argon2id).</li>
        <li>El sistema frena los intentos repetidos de adivinar contraseñas.</li>
        <li>El panel de administración solo lo usan las cuentas autorizadas por el club.</li>
        <li>
          Antes de cada actualización del sistema se respalda la base de datos, y los respaldos
          quedan en el servidor con acceso restringido.
        </li>
        <li>Los datos están en servidores en Chile.</li>
      </ul>

      <h2 class="titular mt-10 text-3xl sm:text-4xl">8. Tus derechos</h2>
      <p class="mt-3">Puedes pedirnos en cualquier momento:</p>
      <ul class="mt-3 grid list-disc gap-1 ps-5">
        <li><strong>Acceso:</strong> saber qué datos tuyos tenemos.</li>
        <li>
          <strong>Rectificación:</strong> corregir los que estén equivocados o desactualizados.
        </li>
        <li><strong>Supresión:</strong> que borremos los que ya no tienen por qué estar.</li>
        <li><strong>Oposición:</strong> que dejemos de tratarlos para algún fin.</li>
        <li>
          <strong>Portabilidad:</strong> recibirlos en un formato que puedas llevar a otro lado.
        </li>
        <li><strong>Revisión por una persona</strong> de una decisión automatizada (sección 3).</li>
        <li>
          <strong>Retirar tu consentimiento</strong> para la publicación en torneos. Desde ese
          momento retiramos tus fotos y dejamos de publicar tus transmisiones; los resultados ya
          publicados se mantienen como parte del registro del torneo.
        </li>
      </ul>
      <p class="mt-3">
        <strong>Cómo:</strong> escríbenos a
        <a [href]="'mailto:' + correo" class="underline">{{ correo }}</a> desde el correo asociado a
        tu cuenta, o identificándote, y cuéntanos qué necesitas. Te respondemos dentro de 30 días
        corridos, plazo que podemos extender una sola vez por otros 30 si el caso lo requiere,
        avisándote.
      </p>
      <p class="mt-3">
        Si no te respondemos a tiempo o rechazamos tu solicitud, puedes reclamar ante la Agencia de
        Protección de Datos Personales.
      </p>

      <h2 class="titular mt-10 text-3xl sm:text-4xl">9. Cambios a esta política</h2>
      <p class="mt-3">
        Si cambiamos esta política, publicaremos la nueva versión aquí con su fecha. Si el cambio es
        importante, además te avisaremos por correo.
      </p>
    </article>
  `,
})
export class Privacidad {
  /** Cambiar el texto es subir la versión y la fecha. */
  protected readonly version = '1.2';
  protected readonly vigenteDesde = '9 de octubre de 2026';
  protected readonly correo = 'contacto@fedal.cl';

  protected readonly tratamientos: Tratamiento[] = [
    {
      cuando: 'Creas tu cuenta',
      datos:
        'Nombre, apellido, correo, teléfono (chileno: +56 y nueve dígitos) y contraseña. ' +
        'La contraseña se guarda cifrada ' +
        'de forma irreversible: nadie puede leerla, ni siquiera el club. Si entras con ' +
        'Google, además, el identificador que Google nos entrega y la confirmación de tu correo.',
      paraQue: 'Identificarte, darte acceso y enviarte los avisos del sistema.',
      base: 'La relación que tienes con el club (contrato).',
    },
    {
      cuando: 'Eres socio',
      datos:
        'Número de socio, estado de la ficha, fecha de ingreso, cuotas, pagos y el ' +
        'historial de cambios de tu ficha.',
      paraQue: 'Administrar tu membresía y cobrar las cuotas.',
      base: 'Contrato, y la ley tributaria para los registros contables.',
    },
    {
      cuando: 'Reservas una cancha',
      datos:
        'Nombre, correo y teléfono de quien reserva; fecha, hora y cancha; el nombre de quienes ' +
        'juegan contigo, de una a tres personas; y los reportes de no uso, cuando otro socio ' +
        'informa que una cancha reservada no se ocupó.',
      paraQue:
        'Gestionar tu reserva, confirmártela y avisarte si cambia o se cancela, contar el cupo ' +
        'de invitados del socio y cuidar el buen uso de las canchas. Si eres socio, los nombres ' +
        'de tus invitados anteriores te los sugerimos la próxima vez que reserves: solo tú los ves.',
      base: 'Contrato.',
    },
    {
      cuando: 'Pagas',
      datos:
        'Monto, estado del pago, código de autorización y los últimos 4 dígitos de la ' +
        'tarjeta que entrega Webpay; el comprobante de transferencia, si pagas así; y los ' +
        'pagos en efectivo que registra el club. El número completo de tu tarjeta nunca ' +
        'pasa por el club: lo procesa Transbank.',
      paraQue: 'Cobrar, devolver cuando corresponde y llevar la contabilidad.',
      base: 'Contrato y obligación legal (tributaria).',
    },
    {
      cuando: 'Te inscribes en una clase',
      datos: 'Nombre y teléfono.',
      paraQue: 'Organizar la clase y avisarte cambios.',
      base: 'Contrato.',
    },
    {
      cuando: 'Te inscribes en un torneo',
      datos:
        'Nombre, apellidos, teléfono, correo, el club o lugar de dónde vienes, categoría, ' +
        'los horarios en que no puedes jugar, el pago y el comprobante; después, tus ' +
        'resultados, los cuadros y el ranking, y las fotos y transmisiones de los ' +
        'partidos. Si tienes sesión, el formulario se llena con los datos de tu cuenta, y ' +
        'si eres socio puedes inscribirte con los de tu ficha. El teléfono y el correo no ' +
        'se publican.',
      paraQue:
        'Organizar el torneo, escribirte sobre tu inscripción y tus partidos, y publicar en ' +
        'el sitio tu nombre, si tu inscripción está pagada o pendiente, tus resultados, el ' +
        'ranking, las fotos y las transmisiones.',
      base:
        'Contrato (la inscripción) y tu consentimiento para la publicación, que das al ' +
        'inscribirte. El formulario de inscripción te lo informa.',
    },
    {
      cuando: 'Juegas partidos internos con otros socios',
      datos:
        'Tu nombre y el de tu rival, el día, quién ganó y el marcador de cada partido que ' +
        'cargas o que te cargan, y si lo confirmaste o lo rechazaste. Con los confirmados se ' +
        'calculan tu puntaje y tu lugar en el ranking interno.',
      paraQue:
        'Armar el ranking interno del club, que ven solo los socios. Un partido cuenta solo ' +
        'cuando tu rival lo confirma, o cuando el club resuelve un desacuerdo. Si pasas seis ' +
        'meses sin jugar, sales de la tabla principal.',
      base: 'Contrato (tu membresía).',
    },
    {
      cuando: 'Nos escribes por el formulario de contacto',
      datos: 'Nombre, correo, teléfono y tu mensaje.',
      paraQue: 'Responderte.',
      base: 'Tu solicitud (medidas previas a un contrato).',
    },
    {
      cuando: 'Usas el sitio',
      datos:
        'Tu dirección IP al iniciar sesión, guardada solo en memoria por 15 minutos para ' +
        'frenar los intentos de adivinar contraseñas, y los registros técnicos del servidor.',
      paraQue: 'La seguridad del sitio y de tu cuenta.',
      base: 'Interés legítimo del club en proteger el sitio.',
    },
  ];

  protected readonly plazos: [string, string][] = [
    ['Cuenta de un socio activo', 'Mientras seas socio.'],
    [
      'Cuenta de ex socios y cuentas sin uso',
      '2 años desde tu última actividad (último ingreso o reserva). Después se eliminan o se anonimizan.',
    ],
    ['Pagos (Webpay, efectivo y cuotas)', '6 años, como exige la ley tributaria.'],
    ['Comprobantes de transferencia', '6 años, junto con el pago que respaldan.'],
    [
      'Datos de contacto de una reserva hecha sin ser socio',
      '1 año desde la reserva. El registro del pago se guarda los 6 años.',
    ],
    ['Mensajes del formulario de contacto', '1 año desde que te respondemos.'],
    ['Resultados y ranking de torneos', 'Mientras exista el historial deportivo del club.'],
    [
      'Partidos internos y ranking interno',
      'Mientras exista el historial deportivo del club: el ranking se calcula con todos los partidos confirmados.',
    ],
    ['Fotos de torneos', '3 años desde el torneo.'],
    ['Sesión iniciada', '30 días, o hasta que cierres sesión.'],
    [
      'Respaldos de la base de datos',
      'Se conservan los últimos 10 y los anteriores se borran solos.',
    ],
  ];
}
