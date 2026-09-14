import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * En qué almacén ocurrió cada movimiento del kardex.
 *
 * Los asientos que ya existen se rellenan con la única ubicación de
 * inventario que había, igual que los lotes (ver la migración del mismo día
 * en `medical-inventory`). El libro mayor es append-only: esto AÑADE una
 * columna y la rellena; no cambia ningún importe ni ningún saldo.
 */
export class Migration20260909130100 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "inventory_movement" add column if not exists "stock_location_id" text null;`);

    this.addSql(`
      update "inventory_movement" set "stock_location_id" = (
        select "id" from "stock_location" where "deleted_at" is null limit 1
      )
      where "stock_location_id" is null
        and (select count(*) from "stock_location" where "deleted_at" is null) = 1;
    `);

    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_inventory_movement_stock_location_id" ON "inventory_movement" ("stock_location_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "IDX_inventory_movement_stock_location_id";`);
    this.addSql(`alter table if exists "inventory_movement" drop column if exists "stock_location_id";`);
  }

}
