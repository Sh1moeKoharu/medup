import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * La nota de atención con estructura: qué revisó el médico, qué hizo, y la
 * fecha de la atención (que no siempre es el momento en que se captura).
 * `content` se conserva: es el texto completo que se imprime y el de las notas
 * libres de antes.
 */
export class Migration20260914130000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "clinical_note" add column if not exists "attended_at" timestamptz null;`);
    this.addSql(`alter table if exists "clinical_note" add column if not exists "findings" text null;`);
    this.addSql(`alter table if exists "clinical_note" add column if not exists "procedures" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "clinical_note" drop column if exists "attended_at";`);
    this.addSql(`alter table if exists "clinical_note" drop column if exists "findings";`);
    this.addSql(`alter table if exists "clinical_note" drop column if exists "procedures";`);
  }
}
