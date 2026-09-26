import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * Las aseguranzas del paciente: una lista [{ insurance_id, policy_number }].
 * `insurance_policy` (un solo texto) se conserva para lo capturado antes.
 * ESCRITA A MANO: sólo añade una columna.
 */
export class Migration20260926100100 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "medical_customer" add column if not exists "insurances" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "medical_customer" drop column if exists "insurances";`);
  }
}
