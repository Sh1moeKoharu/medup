import { MedusaContainer } from "@medusajs/framework/types"
import { INVENTORY_MOVEMENTS_MODULE } from "../modules/inventory-movements"

/**
 * Punto ÚNICO de escritura del libro mayor de inventario.
 *
 * Toda mutación de `medical_batch.quantity` debe pasar por aquí. Si aparece un
 * `updateMedicalBatches({ quantity })` en el código que no registre su asiento,
 * es un bug: el kardex quedará descuadrado y no habrá forma de saberlo.
 *
 * ── LIMITACIÓN CONOCIDA (atomicidad) ────────────────────────────────────────
 * El asiento se escribe DESPUÉS de mutar el stock, en una operación separada.
 * No son atómicos: si el proceso muere entre ambos pasos, el stock cambia sin
 * asiento. Hacerlo atómico exige mover estas operaciones a workflows de Medusa
 * con compensación, que es un cambio de arquitectura mayor y queda como paso
 * siguiente.
 *
 * Mitigación provisional: un fallo al asentar se registra con nivel ERROR
 * incluyendo todos los datos del movimiento, de modo que el asiento pueda
 * reconstruirse a mano desde los logs. Nunca se traga en silencio.
 */

export type MovementType =
  | "entry_purchase"
  | "entry_return"
  | "entry_adjustment"
  | "entry_transfer"
  | "entry_initial"
  | "exit_sale"
  | "exit_adjustment"
  | "exit_transfer"
  | "exit_expiry"
  | "exit_damage"

export type RecordMovementInput = {
  variant_id: string
  /** Con signo: positivo entrada, negativo salida. Un 0 se rechaza. */
  quantity_delta: number
  /** Saldo del lote DESPUÉS del movimiento. */
  quantity_after: number
  type: MovementType
  variant_title?: string | null
  batch_id?: string | null
  batch_number?: string | null
  expiration_date?: Date | string | null
  reason?: string | null
  reference_type?: string | null
  reference_id?: string | null
  user_id?: string | null
  user_email?: string | null
  unit_cost?: number | null
  notes?: string | null
}

/** Los tipos que deben venir con delta positivo. */
const ENTRY_TYPES: MovementType[] = [
  "entry_purchase",
  "entry_return",
  "entry_adjustment",
  "entry_transfer",
  "entry_initial",
]

/**
 * Valida la coherencia del asiento antes de escribirlo.
 * Devuelve el mensaje de error, o null si está bien.
 */
function validate(input: RecordMovementInput): string | null {
  if (!input.variant_id) {
    return "variant_id es obligatorio"
  }

  if (!Number.isFinite(input.quantity_delta) || input.quantity_delta === 0) {
    return `quantity_delta debe ser un número distinto de 0 (recibido: ${input.quantity_delta})`
  }

  if (!Number.isFinite(input.quantity_after) || input.quantity_after < 0) {
    return `quantity_after debe ser un número >= 0 (recibido: ${input.quantity_after})`
  }

  // El signo debe concordar con el tipo: un "entry_*" con delta negativo casi
  // siempre significa que quien llama invirtió el signo.
  const isEntry = ENTRY_TYPES.includes(input.type)
  if (isEntry && input.quantity_delta < 0) {
    return `El tipo "${input.type}" es una entrada pero el delta es negativo (${input.quantity_delta})`
  }
  if (!isEntry && input.quantity_delta > 0) {
    return `El tipo "${input.type}" es una salida pero el delta es positivo (${input.quantity_delta})`
  }

  return null
}

/**
 * Asienta un movimiento de inventario.
 *
 * Nunca lanza: un fallo del ledger no debe tumbar la operación de negocio que
 * ya ocurrió. Devuelve true si se asentó, false si no (y lo deja logueado).
 */
export async function recordInventoryMovement(
  container: MedusaContainer,
  input: RecordMovementInput
): Promise<boolean> {
  const logger: any = container.resolve("logger")

  const problem = validate(input)
  if (problem) {
    logger.error(
      `[LEDGER] Asiento RECHAZADO por incoherencia: ${problem}. ` +
        `Datos: ${JSON.stringify(input)}`
    )
    return false
  }

  try {
    const service: any = container.resolve(INVENTORY_MOVEMENTS_MODULE)

    await service.createInventoryMovements({
      variant_id: input.variant_id,
      variant_title: input.variant_title ?? null,
      batch_id: input.batch_id ?? null,
      batch_number: input.batch_number ?? null,
      expiration_date: input.expiration_date
        ? new Date(input.expiration_date)
        : null,
      quantity_delta: input.quantity_delta,
      quantity_after: input.quantity_after,
      type: input.type,
      reason: input.reason ?? null,
      reference_type: input.reference_type ?? null,
      reference_id: input.reference_id ?? null,
      user_id: input.user_id ?? null,
      user_email: input.user_email ?? null,
      unit_cost: input.unit_cost ?? null,
      notes: input.notes ?? null,
    })

    return true
  } catch (err: any) {
    // Se vuelca el input completo: es lo que permite reconstruir el asiento.
    logger.error(
      `[LEDGER] NO se pudo asentar el movimiento. El stock YA cambió, ` +
        `así que el kardex quedó descuadrado y hay que asentarlo a mano. ` +
        `Error: ${err?.message}. Datos: ${JSON.stringify(input)}`
    )
    return false
  }
}

/**
 * Asienta varios movimientos. Devuelve cuántos fallaron.
 * Se usa desde el FEFO, donde una sola venta toca varios lotes.
 */
export async function recordInventoryMovements(
  container: MedusaContainer,
  inputs: RecordMovementInput[]
): Promise<number> {
  let failed = 0
  for (const input of inputs) {
    const ok = await recordInventoryMovement(container, input)
    if (!ok) {
      failed++
    }
  }
  return failed
}
