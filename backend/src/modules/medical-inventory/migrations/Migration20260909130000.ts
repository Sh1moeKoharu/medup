import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * Inventario por almacén, datos de compra y mínimos/máximos.
 *
 * ── LO QUE HACE ─────────────────────────────────────────────────────────────
 * 1. `medical_batch.stock_location_id`: a qué almacén pertenece cada lote.
 *    Las filas que ya existen se rellenan con la ubicación de inventario que
 *    ya había (la única, "Almacén principal" en las instalaciones actuales).
 *    NADA cambia de sitio: la suma de existencias es la misma antes y
 *    después. Ese es el número que hay que apuntar antes de migrar
 *    (`scripts/sumar-existencias.ts`) y comprobar después.
 * 2. Campos de la compra: fecha, unidad de compra, unidad de venta y factor.
 *    Las filas existentes quedan con factor 1: se compraron y se venden en la
 *    misma unidad, que es lo que el sistema asumía hasta hoy.
 * 3. Tabla `stock_policy`: mínimo y máximo por presentación y almacén.
 *
 * ── LO QUE NO HACE ──────────────────────────────────────────────────────────
 * No declara `stock_location_id NOT NULL`. Con más de una ubicación previa no
 * se puede adivinar cuál toca, y la columna se quedaría vacía en esas filas;
 * la regla la aplica el código (todo alta la exige) y `preparar-almacenes.ts`
 * lista cualquier lote que haya quedado sin almacén.
 *
 * ESCRITA A MANO, como las demás de este módulo: `db:generate` ya emitió una
 * vez un `drop table` sobre tablas ajenas. Nada aquí puede borrar datos.
 */
export class Migration20260909130000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "medical_batch" add column if not exists "stock_location_id" text null;`);
    this.addSql(`alter table if exists "medical_batch" add column if not exists "purchase_date" timestamptz null;`);
    this.addSql(`alter table if exists "medical_batch" add column if not exists "purchase_unit" text null;`);
    this.addSql(`alter table if exists "medical_batch" add column if not exists "sale_unit" text null;`);
    this.addSql(`alter table if exists "medical_batch" add column if not exists "units_per_purchase" integer not null default 1;`);

    // Relleno: la ubicación que ya existía. Sólo si hay exactamente UNA viva;
    // con varias no se adivina y el script de preparación lo reporta.
    this.addSql(`
      update "medical_batch" set "stock_location_id" = (
        select "id" from "stock_location" where "deleted_at" is null limit 1
      )
      where "stock_location_id" is null
        and (select count(*) from "stock_location" where "deleted_at" is null) = 1;
    `);

    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_medical_batch_stock_location_id" ON "medical_batch" ("stock_location_id");`);

    this.addSql(`create table if not exists "stock_policy" ("id" text not null, "variant_id" text not null, "stock_location_id" text not null, "min_quantity" integer not null default 0, "max_quantity" integer null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "stock_policy_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_stock_policy_deleted_at" ON "stock_policy" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_stock_policy_variant_id_stock_location_id_unique" ON "stock_policy" ("variant_id", "stock_location_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "stock_policy" cascade;`);
    this.addSql(`DROP INDEX IF EXISTS "IDX_medical_batch_stock_location_id";`);
    this.addSql(`alter table if exists "medical_batch" drop column if exists "units_per_purchase", drop column if exists "sale_unit", drop column if exists "purchase_unit", drop column if exists "purchase_date", drop column if exists "stock_location_id";`);
  }

}
