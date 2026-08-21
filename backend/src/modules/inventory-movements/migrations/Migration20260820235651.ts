import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260820235651 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "inventory_movement" ("id" text not null, "variant_id" text not null, "variant_title" text null, "batch_id" text null, "batch_number" text null, "expiration_date" timestamptz null, "quantity_delta" integer not null, "quantity_after" integer not null, "type" text check ("type" in ('entry_purchase', 'entry_return', 'entry_adjustment', 'entry_transfer', 'entry_initial', 'exit_sale', 'exit_adjustment', 'exit_transfer', 'exit_expiry', 'exit_damage')) not null, "reason" text null, "reference_type" text null, "reference_id" text null, "user_id" text null, "user_email" text null, "unit_cost" real null, "notes" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "inventory_movement_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_inventory_movement_deleted_at" ON "inventory_movement" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "inventory_movement" cascade;`);
  }

}
