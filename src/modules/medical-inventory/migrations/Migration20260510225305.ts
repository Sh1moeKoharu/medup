import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260510225305 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "regulated_prescription" alter column "dispense_date" drop default;`);
    this.addSql(`alter table if exists "regulated_prescription" alter column "dispense_date" type timestamptz using ("dispense_date"::timestamptz);`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "regulated_prescription" alter column "dispense_date" type timestamptz using ("dispense_date"::timestamptz);`);
    this.addSql(`alter table if exists "regulated_prescription" alter column "dispense_date" set default Sun May 10 2026 16:52:10 GMT-0600 (hora estándar central);`);
  }

}
