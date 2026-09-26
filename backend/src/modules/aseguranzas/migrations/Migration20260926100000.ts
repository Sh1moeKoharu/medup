import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/** Aseguranzas. ESCRITA A MANO: sólo `create table if not exists`. */
export class Migration20260926100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "insurance" ("id" text not null, "name" text not null, "discount_percent" real not null default 0, "status" text check ("status" in ('active', 'inactive')) not null default 'active', "valid_from" timestamptz null, "valid_until" timestamptz null, "notes" text null, "promotion_id" text null, "promotion_code" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "insurance_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_insurance_deleted_at" ON "insurance" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "insurance" cascade;`);
  }
}
