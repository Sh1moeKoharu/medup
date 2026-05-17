import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260510081412 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "medical_order" ("id" text not null, "status" text check ("status" in ('pending', 'dispensed', 'cancelled')) not null default 'pending', "creator_id" text not null, "creator_name" text null, "creator_role" text check ("creator_role" in ('doctor', 'nurse', 'admin')) not null default 'doctor', "customer_id" text not null, "customer_name" text null, "notes" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "medical_order_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_medical_order_deleted_at" ON "medical_order" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "medical_order_item" ("id" text not null, "variant_id" text not null, "product_title" text null, "quantity" integer not null default 1, "instructions" text null, "order_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "medical_order_item_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_medical_order_item_order_id" ON "medical_order_item" ("order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_medical_order_item_deleted_at" ON "medical_order_item" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "medical_order_item" add constraint "medical_order_item_order_id_foreign" foreign key ("order_id") references "medical_order" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "medical_order_item" drop constraint if exists "medical_order_item_order_id_foreign";`);

    this.addSql(`drop table if exists "medical_order" cascade;`);

    this.addSql(`drop table if exists "medical_order_item" cascade;`);
  }

}
