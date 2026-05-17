import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260510081620 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "medical_batch" add column if not exists "reserved_quantity" integer not null default 0;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "medical_batch" drop column if exists "reserved_quantity";`);
  }

}
