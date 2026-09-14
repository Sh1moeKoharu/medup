import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * Destinatario de la orden médica, quién la surtió, y su enlace con el cobro.
 *
 * Las órdenes que ya existen quedan como `pharmacy`: hasta hoy todas las
 * surtía Farmacia, y así es como se registraron. Las nuevas nacen para
 * Enfermería salvo que el médico diga lo contrario.
 *
 * ESCRITA A MANO: sólo `add column if not exists`; no puede borrar nada.
 */
export class Migration20260910110000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "medical_order" add column if not exists "recipient_area" text check ("recipient_area" in ('nursing', 'pharmacy')) not null default 'nursing';`);
    // Todo lo anterior a esta columna lo surtía Farmacia: se marca así, en
    // cualquier estado, para que no aparezca de pronto en la bandeja de
    // Enfermería una orden que Farmacia ya tenía en la suya.
    this.addSql(`update "medical_order" set "recipient_area" = 'pharmacy';`);
    this.addSql(`alter table if exists "medical_order" add column if not exists "dispensed_by_id" text null;`);
    this.addSql(`alter table if exists "medical_order" add column if not exists "dispensed_by_name" text null;`);
    this.addSql(`alter table if exists "medical_order" add column if not exists "dispensed_at" timestamptz null;`);
    this.addSql(`alter table if exists "medical_order" add column if not exists "draft_order_id" text null;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_medical_order_recipient_area" ON "medical_order" ("recipient_area");`);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "IDX_medical_order_recipient_area";`);
    this.addSql(`alter table if exists "medical_order" drop column if exists "draft_order_id", drop column if exists "dispensed_at", drop column if exists "dispensed_by_name", drop column if exists "dispensed_by_id", drop column if exists "recipient_area";`);
  }

}
