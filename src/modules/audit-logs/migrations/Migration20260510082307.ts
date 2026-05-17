import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260510082307 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "audit_log" ("id" text not null, "user_id" text null, "user_email" text null, "method" text not null, "endpoint" text not null, "ip_address" text null, "payload" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "audit_log_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_audit_log_deleted_at" ON "audit_log" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "audit_log" cascade;`);
  }

}
