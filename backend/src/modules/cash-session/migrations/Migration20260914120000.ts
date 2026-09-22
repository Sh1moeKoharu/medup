import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * Una sola caja abierta en toda la clínica.
 *
 * La ruta ya lo comprueba antes de abrir, pero dos aperturas en el mismo
 * instante pasarían las dos la comprobación. El índice único parcial lo cierra
 * en la base: sólo puede existir una fila `open` sin borrar.
 *
 * Si al migrar ya hay más de una caja abierta (de cuando el turno era por
 * cajero), el índice no se puede crear. No se cierra ninguna a ciegas —cada una
 * lleva su efectivo—: se deja un aviso y la ruta sigue impidiendo abrir más.
 * Una migración corre una sola vez, así que en ese caso el índice se crea a
 * mano después de cerrar las sobrantes (la sentencia está en el aviso).
 */
export class Migration20260914120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      DO $$
      BEGIN
        IF (SELECT count(*) FROM "cash_session" WHERE "status" = 'open' AND "deleted_at" IS NULL) <= 1 THEN
          CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cash_session_una_abierta" ON "cash_session" ((true)) WHERE "status" = 'open' AND "deleted_at" IS NULL;
        ELSE
          RAISE NOTICE 'Hay más de una caja abierta. Ciérralas desde Caja y ejecuta: CREATE UNIQUE INDEX "IDX_cash_session_una_abierta" ON "cash_session" ((true)) WHERE "status" = ''open'' AND "deleted_at" IS NULL;';
        END IF;
      END $$;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "IDX_cash_session_una_abierta";`);
  }
}
