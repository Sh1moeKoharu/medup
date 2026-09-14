import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { recordInventoryMovement } from "../../../lib/inventory-ledger";
import { AREAS, nombresDeAlmacenes, resolverAlmacen } from "../../../lib/almacenes";
import { resolveRequestActor } from "../../../lib/require-role";
import { ROLES } from "../../../lib/roles";
import { costoPorUnidadDeVenta, revisarFactor, unidadesDeVenta } from "../../../lib/unidades";
import { precioConMargen, revisarMargen } from "../../../lib/margen";
import { fetchVariantLabels } from "../../../lib/variant-titles";
import { actualizarPrecioDeVariante, precioActualDeVariante } from "../../../lib/precios";

/**
 * Lotes: consulta y alta.
 *
 * ── POR ALMACÉN ─────────────────────────────────────────────────────────────
 * Cada lote pertenece a un almacén (`stock_location_id`, ver lib/almacenes.ts).
 * La consulta acepta `?stock_location_id=` y devuelve el nombre del almacén
 * en cada fila; el alta lo exige, y si no viene usa el de Farmacia, que es
 * donde entra la compra.
 *
 * ── UNIDADES ────────────────────────────────────────────────────────────────
 * Se puede dar de alta como viene en la factura: `purchase_quantity` unidades
 * de compra por `units_per_purchase` unidades de venta cada una. La existencia
 * se guarda SIEMPRE en unidades de venta (ver lib/unidades.ts). Si se manda
 * `quantity` directamente, se toma tal cual.
 *
 * ── MARGEN ──────────────────────────────────────────────────────────────────
 * Si viene `unit_cost` y el producto tiene `margen_automatico`, el precio de
 * venta de la variante se recalcula y se escribe (ver lib/margen.ts). Con
 * `apply_margin: false` se registra el costo sin tocar el precio. La
 * respuesta dice qué precio quedó.
 */
export async function GET(
    req: MedusaRequest,
    res: MedusaResponse
) {
    try {
        const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

        // Filtros opcionales. El widget de destrucción los usa para pedir sólo
        // los lotes en cuarentena de un producto concreto.
        const { variant_id, status, stock_location_id } = req.query as Record<string, string>;
        const filters: Record<string, any> = {};
        if (variant_id) {
            filters.variant_id = variant_id.includes(",")
                ? variant_id.split(",").map((v) => v.trim()).filter(Boolean)
                : variant_id;
        }
        if (status) filters.status = status;
        if (stock_location_id) filters.stock_location_id = stock_location_id;

        const { data: batches } = await query.graph({
            entity: "medical_batch",
            fields: [
                "id",
                "batch_number",
                "expiration_date",
                "quantity",
                "reserved_quantity",
                "variant_id",
                "shelf_location",
                "status",
                "quarantined_at",
                "stock_location_id",
                "purchase_date",
                "purchase_unit",
                "sale_unit",
                "units_per_purchase",
            ],
            filters,
        });

        const nombres = await nombresDeAlmacenes(req.scope as any);
        // El lote sólo guarda el id de la variante. Sin el nombre, la tabla de
        // lotes del panel enseñaba una columna de identificadores que nadie
        // puede leer; se resuelve aquí, igual que hace el kardex.
        const etiquetas = await fetchVariantLabels(req.scope as any, (batches || []).map((b: any) => b.variant_id));
        const filas = (batches || []).map((b: any) => ({
            ...b,
            stock_location_name: b.stock_location_id ? nombres.get(b.stock_location_id) ?? null : null,
            variant_title: etiquetas.get(b.variant_id)?.label ?? null,
        }));

        res.json({ batches: filas });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
}

export async function POST(
    req: MedusaRequest,
    res: MedusaResponse
) {
    try {
        // Obtenemos el servicio custom medical_inventory
        const medicalInventoryService = req.scope.resolve("medical_inventory");

        const {
            batch_number,
            expiration_date,
            quantity,
            purchase_quantity,
            units_per_purchase,
            purchase_unit,
            sale_unit,
            purchase_date,
            variant_id,
            stock_location_id,
            // Tipo de entrada (ver propuesta: compra / devolución / ajuste /
            // traspaso). Por omisión, compra a proveedor.
            entry_type,
            unit_cost,
            apply_margin,
            reason,
            shelf_location,
        } = req.body as any;

        if (!batch_number || !expiration_date || !variant_id) {
            return res.status(400).json({
                message: "Número de lote, fecha de caducidad y presentación son obligatorios.",
            });
        }

        // ── Almacén ─────────────────────────────────────────────────────────
        const { almacen, error: errorAlmacen } = await resolverAlmacen(req.scope as any, stock_location_id);
        if (!almacen) {
            return res.status(400).json({ message: errorAlmacen });
        }

        // Enfermería sólo registra entradas en su propio almacén. La política
        // general la deja escribir en lotes (para sus bajas); el límite es aquí.
        const actor = await resolveRequestActor(req);
        if (actor?.role === ROLES.NURSE && almacen.area !== AREAS.ENFERMERIA) {
            return res.status(403).json({
                message: "Enfermería sólo puede dar de alta lotes en su propio almacén.",
            });
        }

        // ── Unidades ────────────────────────────────────────────────────────
        const factor = units_per_purchase === undefined || units_per_purchase === null || units_per_purchase === ""
            ? 1
            : Number(units_per_purchase);
        const problemaFactor = revisarFactor(factor);
        if (problemaFactor) {
            return res.status(400).json({ message: problemaFactor });
        }

        let parsedQuantity: number;
        if (purchase_quantity !== undefined && purchase_quantity !== null && purchase_quantity !== "") {
            const comprada = Number(purchase_quantity);
            if (!Number.isFinite(comprada) || comprada <= 0) {
                return res.status(400).json({
                    message: `La cantidad comprada debe ser un número mayor a 0 (recibido: ${purchase_quantity}).`,
                });
            }
            parsedQuantity = unidadesDeVenta(comprada, factor);
        } else {
            parsedQuantity = Number(quantity);
        }

        if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
            return res.status(400).json({
                message: `La cantidad debe ser un número mayor a 0 (recibido: ${quantity}).`,
            });
        }

        const ALLOWED_ENTRY_TYPES = [
            "entry_purchase",
            "entry_return",
            "entry_adjustment",
            "entry_transfer",
            "entry_initial",
        ] as const;

        const movementType = entry_type ?? "entry_purchase";
        if (!ALLOWED_ENTRY_TYPES.includes(movementType)) {
            return res.status(400).json({
                message: `Tipo de entrada inválido: "${entry_type}". Válidos: ${ALLOWED_ENTRY_TYPES.join(", ")}.`,
            });
        }

        // ── Costo ───────────────────────────────────────────────────────────
        // `unit_cost` es por unidad de COMPRA cuando el alta viene por compra;
        // el kardex lo guarda por unidad de VENTA.
        let costoVenta: number | null = null;
        if (unit_cost !== undefined && unit_cost !== null && unit_cost !== "") {
            const c = Number(unit_cost);
            if (!Number.isFinite(c) || c < 0) {
                return res.status(400).json({
                    message: `El costo unitario debe ser un número mayor o igual a 0 (recibido: ${unit_cost}).`,
                });
            }
            costoVenta = purchase_quantity !== undefined && purchase_quantity !== null && purchase_quantity !== ""
                ? costoPorUnidadDeVenta(c, factor)
                : c;
        }

        const batch = await medicalInventoryService.createMedicalBatches({
            batch_number,
            expiration_date,
            quantity: parsedQuantity,
            variant_id,
            stock_location_id: almacen.id,
            purchase_date: purchase_date ? new Date(purchase_date) : null,
            purchase_unit: purchase_unit || null,
            sale_unit: sale_unit || null,
            units_per_purchase: factor,
            // El punto de venta lo pide en el alta («Estante») y lo enseña en
            // Existencias, pero esta ruta no lo leía: se capturaba y se perdía.
            shelf_location: typeof shelf_location === "string" && shelf_location.trim() ? shelf_location.trim() : null,
        });

        // Quién dio de alta la entrada: la propuesta lo exige explícitamente
        // ("Quien ingresa") y hasta ahora no se guardaba en ningún lado.
        let userId: string | null = (req as any).auth_context?.actor_id ?? null;
        let userEmail: string | null = null;
        if (userId) {
            try {
                const userModuleService = req.scope.resolve(Modules.USER);
                const [user] = await userModuleService.listUsers({ id: userId });
                userEmail = user?.email ?? null;
            } catch {
                // El correo es informativo; su ausencia no invalida el asiento.
            }
        }

        await recordInventoryMovement(req.scope as any, {
            variant_id,
            stock_location_id: almacen.id,
            batch_id: batch.id,
            batch_number: batch.batch_number ?? null,
            expiration_date: batch.expiration_date ?? null,
            quantity_delta: parsedQuantity,
            quantity_after: parsedQuantity, // lote recién creado: saldo = alta
            type: movementType,
            reason: reason ?? `Alta de lote en ${almacen.name}`,
            reference_type: "manual",
            user_id: userId,
            user_email: userEmail,
            unit_cost: costoVenta,
        });

        // ── Margen automático → precio de venta ─────────────────────────────
        // Se aplica salvo que quien llama lo desactive. Un fallo aquí no
        // deshace el alta (el lote ya está en el anaquel): se informa.
        let precio: { anterior: number | null; nuevo: number; currency_code: string } | null = null;
        let advertenciaPrecio: string | null = null;

        if (costoVenta !== null && apply_margin !== false) {
            try {
                const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
                const { data } = await query.graph({
                    entity: "product_variant",
                    fields: ["id", "product.metadata"],
                    filters: { id: variant_id },
                });
                const margen = (data?.[0] as any)?.product?.metadata?.margen_automatico;
                const problemaMargen = revisarMargen(margen);
                const nuevo = problemaMargen ? null : precioConMargen(costoVenta, margen);

                if (nuevo !== null) {
                    const actual = await precioActualDeVariante(req.scope as any, variant_id);
                    const escrito = await actualizarPrecioDeVariante(
                        req.scope as any,
                        variant_id,
                        nuevo,
                        actual?.currency_code
                    );
                    precio = { anterior: actual?.amount ?? null, nuevo: escrito.amount, currency_code: escrito.currency_code };
                }
            } catch (e: any) {
                advertenciaPrecio =
                    `El lote se registró, pero no se pudo actualizar el precio de venta: ${e?.message ?? e}`;
            }
        }

        res.json({
            batch: { ...batch, stock_location_name: almacen.name },
            precio,
            ...(advertenciaPrecio ? { advertencia: advertenciaPrecio } : {}),
        });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
}
