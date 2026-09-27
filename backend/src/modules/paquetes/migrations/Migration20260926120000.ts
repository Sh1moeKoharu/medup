import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/** Paquetes a precio cerrado. ESCRITA A MANO: sólo `create table if not exists`. */
export class Migration20260926120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "altus_package" ("id" text not null, "name" text not null, "specialist_id" text null, "specialist_name" text null, "items" jsonb not null, "includes_consultation" boolean not null default false, "price" real not null, "status" text check ("status" in ('active', 'inactive')) not null default 'active', "valid_from" timestamptz null, "valid_until" timestamptz null, "notes" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "altus_package_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_altus_package_deleted_at" ON "altus_package" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "altus_package" cascade;`);
  }
}
