import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * Agrega `status` y `quarantined_at` a `medical_batch`.
 *
 * ⚠️ NOTA IMPORTANTE — esta migración fue EDITADA A MANO.
 *
 * `medusa db:generate medical_inventory` la generó incluyendo además:
 *     drop table if exists "inventory_movement" cascade;
 *     drop table if exists "regulated_prescription" cascade;
 *
 * Eso ocurre porque el snapshot de este módulo todavía declaraba dos modelos
 * que en algún momento vivieron aquí y fueron eliminados. El generador
 * interpretó su ausencia como "hay que borrar esas tablas".
 *
 * `inventory_movement` YA NO pertenece a este módulo: es el libro mayor, y vive
 * en el módulo `inventory-movements`. Dejar ese DROP aquí destruiría el ledger
 * completo cada vez que se levantara una base desde cero. Ambos DROP fueron
 * eliminados a propósito; no volver a agregarlos.
 */
export class Migration20260821001512 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "medical_batch" add column if not exists "status" text check ("status" in ('active', 'quarantined', 'destroyed')) not null default 'active', add column if not exists "quarantined_at" timestamptz null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "medical_batch" drop column if exists "status", drop column if exists "quarantined_at";`);
  }

}
