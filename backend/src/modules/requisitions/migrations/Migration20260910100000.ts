import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * Requisiciones entre almacenes (Enfermería pide a Farmacia).
 *
 * ESCRITA A MANO, como las demás del proyecto: `db:generate` ya emitió una
 * vez un `drop table` sobre tablas ajenas. Aquí sólo hay `create table if
 * not exists`; no puede borrar nada.
 */
export class Migration20260910100000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "requisition" ("id" text not null, "status" text check ("status" in ('pending', 'dispatched', 'received', 'cancelled')) not null default 'pending', "source_location_id" text not null, "destination_location_id" text not null, "requested_by_id" text not null, "requested_by_name" text null, "dispatched_by_id" text null, "dispatched_by_name" text null, "dispatched_at" timestamptz null, "received_by_id" text null, "received_by_name" text null, "received_at" timestamptz null, "notes" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "requisition_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_requisition_deleted_at" ON "requisition" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_requisition_status" ON "requisition" ("status");`);

    this.addSql(`create table if not exists "requisition_item" ("id" text not null, "variant_id" text not null, "product_title" text null, "quantity_requested" integer not null default 1, "quantity_dispatched" integer not null default 0, "requisition_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "requisition_item_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_requisition_item_requisition_id" ON "requisition_item" ("requisition_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_requisition_item_deleted_at" ON "requisition_item" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "requisition_item" add constraint "requisition_item_requisition_id_foreign" foreign key ("requisition_id") references "requisition" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "requisition_item" drop constraint if exists "requisition_item_requisition_id_foreign";`);
    this.addSql(`drop table if exists "requisition_item" cascade;`);
    this.addSql(`drop table if exists "requisition" cascade;`);
  }

}
