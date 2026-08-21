import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260821040140 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "audit_log" add column if not exists "user_role" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "audit_log" drop column if exists "user_role";`);
  }

}
