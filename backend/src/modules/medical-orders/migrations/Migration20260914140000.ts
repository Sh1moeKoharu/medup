import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/** Ajustes de renglones de órdenes médicas, con motivo. ESCRITA A MANO. */
export class Migration20260914140000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "medical_order_adjustment" ("id" text not null, "order_id" text not null, "variant_id" text not null, "product_title" text null, "quantity_before" integer not null, "quantity_after" integer not null, "reason" text null, "actor_id" text not null, "actor_name" text null, "actor_role" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "medical_order_adjustment_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_medical_order_adjustment_order_id" ON "medical_order_adjustment" ("order_id");`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_medical_order_adjustment_deleted_at" ON "medical_order_adjustment" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "medical_order_adjustment" cascade;`);
  }
}
