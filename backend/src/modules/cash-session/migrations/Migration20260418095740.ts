import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260418095740 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "cash_movement" ("id" text not null, "session_id" text not null, "order_id" text null, "type" text check ("type" in ('sale', 'refund', 'cash_in', 'cash_out')) not null, "payment_method" text check ("payment_method" in ('cash', 'card', 'transfer', 'other')) not null, "amount" numeric not null, "reference" text null, "description" text null, "created_by" text null, "raw_amount" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "cash_movement_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cash_movement_deleted_at" ON "cash_movement" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "cash_session" ("id" text not null, "opened_at" timestamptz not null, "closed_at" timestamptz null, "opening_amount" numeric not null default 0, "expected_closing_amount" numeric null, "actual_closing_amount" numeric null, "difference" numeric null, "cashier_id" text not null, "cashier_name" text not null, "sales_channel_id" text null, "status" text check ("status" in ('open', 'closed')) not null default 'open', "notes" text null, "raw_opening_amount" jsonb not null default '{"value":"0","precision":20}', "raw_expected_closing_amount" jsonb null, "raw_actual_closing_amount" jsonb null, "raw_difference" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "cash_session_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cash_session_deleted_at" ON "cash_session" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "cash_movement" cascade;`);

    this.addSql(`drop table if exists "cash_session" cascade;`);
  }

}
