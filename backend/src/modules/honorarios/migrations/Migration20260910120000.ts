import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/** Turnos y comisiones de médicos. ESCRITA A MANO: sólo `create table if not exists`. */
export class Migration20260910120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "doctor_shift" ("id" text not null, "doctor_id" text not null, "doctor_name" text null, "opened_at" timestamptz not null, "closed_at" timestamptz null, "notes" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "doctor_shift_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_doctor_shift_deleted_at" ON "doctor_shift" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_doctor_shift_doctor_id" ON "doctor_shift" ("doctor_id");`);

    this.addSql(`create table if not exists "doctor_commission" ("id" text not null, "doctor_id" text not null, "doctor_name" text null, "percent" real not null default 0, "notes" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "doctor_commission_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_doctor_commission_deleted_at" ON "doctor_commission" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_doctor_commission_doctor_id_unique" ON "doctor_commission" ("doctor_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "doctor_commission" cascade;`);
    this.addSql(`drop table if exists "doctor_shift" cascade;`);
  }

}
