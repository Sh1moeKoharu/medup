import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/** Notas de atención. ESCRITA A MANO: sólo `create table if not exists`. */
export class Migration20260910110100 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "clinical_note" ("id" text not null, "customer_id" text not null, "customer_name" text null, "author_id" text not null, "author_name" text null, "author_role" text check ("author_role" in ('doctor', 'nurse', 'admin')) not null default 'doctor', "medical_order_id" text null, "content" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "clinical_note_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_clinical_note_deleted_at" ON "clinical_note" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_clinical_note_customer_id" ON "clinical_note" ("customer_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "clinical_note" cascade;`);
  }

}
