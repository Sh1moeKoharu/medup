import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260510230253 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "b2b_agreement" ("id" text not null, "company_name" text not null, "rfc" text null, "contact_name" text null, "contact_email" text null, "contact_phone" text null, "discount_percent" real not null default 0, "credit_limit" real not null default 0, "payment_terms_days" integer not null default 30, "status" text check ("status" in ('active', 'inactive')) not null default 'active', "valid_from" timestamptz null, "valid_until" timestamptz null, "notes" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "b2b_agreement_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_b2b_agreement_deleted_at" ON "b2b_agreement" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "b2b_agreement" cascade;`);
  }

}
