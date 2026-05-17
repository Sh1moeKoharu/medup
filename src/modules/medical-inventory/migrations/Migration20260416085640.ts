import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260416085640 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "medical_batch" ("id" text not null, "batch_number" text not null, "expiration_date" timestamptz not null, "quantity" integer not null default 0, "variant_id" text not null, "shelf_location" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "medical_batch_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_medical_batch_deleted_at" ON "medical_batch" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "medical_batch" cascade;`);
  }

}
