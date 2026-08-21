import { model } from "@medusajs/framework/utils";

/**
 * Asiento del libro mayor de inventario (tabla `Inventario_Movimientos` de la
 * propuesta).
 *
 * REGLA CENTRAL: append-only. Un asiento NUNCA se edita ni se borra. Si un
 * movimiento fue erróneo se registra otro que lo compensa. Es lo que permite
 * que kardex, mermas, inventario físico y costo promedio se DERIVEN de aquí en
 * lugar de recalcularse a mano.
 *
 * Antes de esto el stock se mutaba en sitio (`quantity = 0` al bloquear un lote
 * vencido, restas directas en el FEFO) y no quedaba rastro de qué había pasado.
 *
 * Campos desnormalizados a propósito (`batch_number`, `variant_title`): el
 * asiento debe seguir siendo legible aunque el lote o el producto desaparezcan.
 */
export const InventoryMovement = model.define("inventory_movement", {
    id: model.id().primaryKey(),

    // ── Qué se movió ────────────────────────────────────────────────────────
    variant_id: model.text(),
    variant_title: model.text().nullable(),   // desnormalizado
    batch_id: model.text().nullable(),        // nullable: un ajuste puede no ser por lote
    batch_number: model.text().nullable(),    // desnormalizado
    expiration_date: model.dateTime().nullable(),

    // ── Cuánto ──────────────────────────────────────────────────────────────
    /** Con signo: positivo = entrada, negativo = salida. Nunca 0. */
    quantity_delta: model.number(),
    /** Saldo del lote DESPUÉS del movimiento. Permite auditar sin recalcular. */
    quantity_after: model.number(),

    // ── Por qué ─────────────────────────────────────────────────────────────
    type: model.enum([
        // Entradas
        "entry_purchase",      // Compra a proveedor
        "entry_return",        // Devolución de paciente
        "entry_adjustment",    // Ajuste autorizado (positivo)
        "entry_transfer",      // Traspaso interno recibido
        "entry_initial",       // Carga inicial / migración de datos
        // Salidas
        "exit_sale",           // Venta o dispensación
        "exit_adjustment",     // Ajuste autorizado (negativo)
        "exit_transfer",       // Traspaso interno enviado
        "exit_expiry",         // Merma por caducidad
        "exit_damage",         // Merma por daño o robo
    ]),
    reason: model.text().nullable(),

    // ── De dónde vino ───────────────────────────────────────────────────────
    /** Qué originó el movimiento: "order", "medical_order", "job", "manual"… */
    reference_type: model.text().nullable(),
    reference_id: model.text().nullable(),

    // ── Quién ───────────────────────────────────────────────────────────────
    user_id: model.text().nullable(),
    user_email: model.text().nullable(),

    /** Costo unitario al momento del movimiento. Base del costo promedio. */
    unit_cost: model.float().nullable(),

    notes: model.text().nullable(),
});
