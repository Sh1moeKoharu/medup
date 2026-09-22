import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/** La orden médica que originó la requisición. ESCRITA A MANO. */
export class Migration20260914140100 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "requisition" add column if not exists "medical_order_id" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "requisition" drop column if exists "medical_order_id";`);
  }
}
