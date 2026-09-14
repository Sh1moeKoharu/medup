import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * Número de empleado del actor en cada asiento.
 *
 * Nulable: los asientos anteriores no lo tienen, y su huella se calculó sin
 * él. `lib/audit-chain.ts` sólo lo mete en la huella cuando existe, así que
 * la cadena anterior sigue cuadrando tal cual.
 *
 * ESCRITA A MANO, como las demás de este módulo: un `add column if not
 * exists` no puede borrar nada.
 */
export class Migration20260909120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "audit_log" add column if not exists "user_employee_number" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "audit_log" drop column if exists "user_employee_number";`);
  }

}
