import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * Nómina y comisiones de todo el personal. ESCRITA A MANO.
 *
 * Los porcentajes de médico que ya existían (`doctor_commission`) se copian
 * como porcentaje base del esquema de cada médico, para que nadie pierda su
 * comisión al actualizar.
 */
export class Migration20260914150000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "doctor_shift" add column if not exists "role" text null;`);

    this.addSql(`create table if not exists "staff_compensation" ("id" text not null, "user_id" text not null, "user_name" text null, "role" text null, "fixed_per_shift" real not null default 0, "hourly_rate" real not null default 0, "default_percent" real not null default 0, "notes" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "staff_compensation_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_staff_compensation_user_id_unique" ON "staff_compensation" ("user_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_staff_compensation_deleted_at" ON "staff_compensation" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "staff_commission_rule" ("id" text not null, "user_id" text not null, "label" text null, "days" text not null, "start_time" text not null, "end_time" text not null, "percent" real not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "staff_commission_rule_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_staff_commission_rule_user_id" ON "staff_commission_rule" ("user_id");`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_staff_commission_rule_deleted_at" ON "staff_commission_rule" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "staff_payment" ("id" text not null, "user_id" text not null, "user_name" text null, "role" text null, "period_from" timestamptz not null, "period_to" timestamptz not null, "amount" real not null, "breakdown" jsonb null, "paid_at" timestamptz not null, "paid_by_id" text not null, "paid_by_name" text null, "reference" text null, "notes" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "staff_payment_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_staff_payment_user_id" ON "staff_payment" ("user_id");`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_staff_payment_deleted_at" ON "staff_payment" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`insert into "staff_compensation" ("id", "user_id", "user_name", "role", "default_percent", "notes")
      select 'stcomp_' || substr(md5(dc."doctor_id"), 1, 24), dc."doctor_id", dc."doctor_name", 'doctor', dc."percent", dc."notes"
      from "doctor_commission" dc
      where dc."deleted_at" is null
        and not exists (select 1 from "staff_compensation" sc where sc."user_id" = dc."doctor_id" and sc."deleted_at" is null);`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "staff_payment" cascade;`);
    this.addSql(`drop table if exists "staff_commission_rule" cascade;`);
    this.addSql(`drop table if exists "staff_compensation" cascade;`);
    this.addSql(`alter table if exists "doctor_shift" drop column if exists "role";`);
  }
}
