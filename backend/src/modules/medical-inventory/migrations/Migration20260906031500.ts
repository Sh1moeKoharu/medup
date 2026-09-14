import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * Pone a cero las reservas huérfanas de `medical_batch`.
 *
 * ── POR QUÉ ─────────────────────────────────────────────────────────────────
 * `reserved_quantity` existía para apartar stock al surtir una orden médica, a
 * la espera de que caja lo cobrara. Ese cobro nunca se construyó, así que la
 * reserva no se liberaba jamás y el disponible (`quantity - reserved_quantity`)
 * se erosionaba de forma monótona: se llegó a medir un lote con 80 unidades en
 * el anaquel y 3 apartadas para siempre.
 *
 * Desde que surtir DESCUENTA (ver la ruta /dispense) nadie vuelve a escribir la
 * columna. Pero las reservas ya escritas se quedan donde están: no hay ningún
 * proceso que las libere, porque el que debía hacerlo nunca existió.
 *
 * ── POR QUÉ UNA MIGRACIÓN Y NO UNA NOTA ─────────────────────────────────────
 * Esto estaba documentado en el modelo como un `UPDATE` que alguien debía
 * ejecutar a mano al desplegar. Un paso manual escrito en un comentario es un
 * paso que se olvida, y su omisión no da ningún síntoma inmediato: los informes
 * simplemente empiezan a restar de menos. Así se aplica solo, una vez, en cada
 * base que venga de la versión anterior.
 *
 * En una instalación nueva no cambia ninguna fila.
 */
export class Migration20260906031500 extends Migration {

  override async up(): Promise<void> {
    this.addSql(
      `update "medical_batch" set "reserved_quantity" = 0 where "reserved_quantity" <> 0;`
    );
  }

  override async down(): Promise<void> {
    /**
     * Sin vuelta atrás a propósito.
     *
     * Las reservas que esto borra no se pueden reconstruir: no se guardaba a qué
     * orden médica correspondía cada una, que es precisamente por lo que nadie
     * podía liberarlas. Revertir sólo podría inventar números.
     */
  }

}
