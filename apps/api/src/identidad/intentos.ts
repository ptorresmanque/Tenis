import { Injectable } from '@nestjs/common';

/**
 * Cuántos intentos fallidos se toleran antes de cerrar la puerta, y por cuánto tiempo.
 *
 * Cinco es holgado para quien tipeó mal su contraseña y estrecho para un script:
 * probar mil claves pasa a tomar días en vez de minutos. Quince minutos de espera
 * molestan poco a quien se equivocó de verdad —el club atiende y puede ayudarlo— y
 * hacen inviable insistir.
 */
export const FALLOS_TOLERADOS = 5;
export const VENTANA_MS = 15 * 60 * 1000;

/**
 * Cuántas combinaciones de correo e IP se recuerdan a la vez.
 *
 * La poda normal ocurre al mirar una llave, así que la que falla una vez y nunca más
 * se quedaría para siempre: probar contraseñas contra un millón de correos distintos
 * llenaría la memoria sin que nadie llegue a bloquearse. Al pasar este techo se barre
 * todo lo vencido, y si aun así no alcanza se descarta lo más viejo. Nada de esto
 * pierde un bloqueo vivo salvo bajo un ataque de ese tamaño, que es exactamente cuando
 * quedarse sin memoria sería peor.
 */
const LLAVES_MAXIMAS = 10_000;

/**
 * Memoria de intentos fallidos de contraseña.
 *
 * **Cuenta fallos, no peticiones.** Limitar peticiones castigaría al club entero, que
 * sale a internet por una sola IP: dos socios entrando desde el mesón agotarían la
 * cuota de cualquiera. Los fallos, en cambio, son raros salvo que alguien esté
 * probando claves.
 *
 * La llave junta correo e IP: así quien ataca una cuenta se bloquea a sí mismo sin
 * dejar afuera a nadie más, y el dueño legítimo puede seguir entrando desde su casa
 * aunque a alguien se le ocurra machacar su correo desde otro lado.
 *
 * `ponytail: vive en memoria, así que se olvida al reiniciar y no se comparte entre
 * instancias. Con un proceso —que es como corre el club— alcanza. Si algún día hay
 * varios, esto pasa a Redis con la misma interfaz.`
 */
@Injectable()
export class IntentosFallidos {
  private readonly fallos = new Map<string, number[]>();

  /** Si esa combinación ya agotó su cuota de errores. */
  bloqueado(llave: string, ahora = Date.now()): boolean {
    return this.recientes(llave, ahora).length >= FALLOS_TOLERADOS;
  }

  anotarFallo(llave: string, ahora = Date.now()): void {
    this.fallos.set(llave, [...this.recientes(llave, ahora), ahora]);

    if (this.fallos.size > LLAVES_MAXIMAS) this.podar(ahora);
  }

  /** Cuántas llaves tiene en memoria. Para vigilar que la poda haga su trabajo. */
  cuantasRecuerda(): number {
    return this.fallos.size;
  }

  /** Entró bien: se le perdona lo anterior. */
  perdonar(llave: string): void {
    this.fallos.delete(llave);
  }

  /**
   * Barre lo vencido y, si todavía sobra, lo más viejo.
   *
   * `Map` conserva el orden de inserción, así que lo primero que devuelve es lo que
   * más tiempo lleva sin tocarse.
   */
  private podar(ahora: number): void {
    for (const [llave] of this.fallos) {
      this.recientes(llave, ahora);
    }

    for (const [llave] of this.fallos) {
      if (this.fallos.size <= LLAVES_MAXIMAS) return;

      this.fallos.delete(llave);
    }
  }

  /**
   * Los fallos que todavía cuentan, descartando de paso los vencidos.
   *
   * La limpieza ocurre acá y no en un temporizador: cada llave se poda la próxima vez
   * que se la mira, y del resto se encarga `podar` cuando el mapa crece de más.
   */
  private recientes(llave: string, ahora: number): number[] {
    const vigentes = (this.fallos.get(llave) ?? []).filter(
      (cuando) => ahora - cuando < VENTANA_MS,
    );

    if (vigentes.length === 0) {
      this.fallos.delete(llave);
    } else {
      this.fallos.set(llave, vigentes);
    }

    return vigentes;
  }
}
