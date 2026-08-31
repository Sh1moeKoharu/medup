import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * Encadenamiento de la bitácora (NOM-024-SSA3-2012 §6.6.2).
 *
 * Dos columnas nuevas, ambas nulables: los asientos que ya existen se quedan
 * sin huella y la cadena arranca en el primero que se escriba a partir de
 * ahora. El verificador lo reporta como tal en vez de darlos por corruptos.
 *
 * ESCRITA A MANO a propósito. `db:generate` sobre este proyecto ya emitió una
 * vez `drop table` para tablas que sólo debía dejar en paz, y costó datos. Un
 * `add column if not exists` se lee entero de un vistazo y no puede borrar
 * nada.
 */
export class Migration20260831120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "audit_log" add column if not exists "prev_hash" text null;`);
    this.addSql(`alter table if exists "audit_log" add column if not exists "hash" text null;`);
    // La verificación recorre la bitácora en orden de escritura.
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_audit_log_created_at" ON "audit_log" ("created_at");`);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "IDX_audit_log_created_at";`);
    this.addSql(`alter table if exists "audit_log" drop column if exists "hash";`);
    this.addSql(`alter table if exists "audit_log" drop column if exists "prev_hash";`);
  }

}
