import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * La nota de atención se puede corregir sin borrar lo escrito: `revisions`
 * guarda las versiones anteriores y `edited_*` dice quién corrigió y cuándo.
 * ESCRITA A MANO: sólo añade columnas.
 */
export class Migration20260924100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "clinical_note" add column if not exists "revisions" jsonb null;`);
    this.addSql(`alter table if exists "clinical_note" add column if not exists "edited_at" timestamptz null;`);
    this.addSql(`alter table if exists "clinical_note" add column if not exists "edited_by_id" text null;`);
    this.addSql(`alter table if exists "clinical_note" add column if not exists "edited_by_name" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "clinical_note" drop column if exists "revisions";`);
    this.addSql(`alter table if exists "clinical_note" drop column if exists "edited_at";`);
    this.addSql(`alter table if exists "clinical_note" drop column if exists "edited_by_id";`);
    this.addSql(`alter table if exists "clinical_note" drop column if exists "edited_by_name";`);
  }
}
