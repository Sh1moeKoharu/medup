import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260418002959 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "medical_customer" ("id" text not null, "customer_type" text check ("customer_type" in ('b2c', 'b2b')) not null default 'b2c', "employee_number" text null, "company_name" text null, "medical_history" jsonb null, "insurance_policy" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "medical_customer_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_medical_customer_deleted_at" ON "medical_customer" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "medical_customer" cascade;`);
  }

}
