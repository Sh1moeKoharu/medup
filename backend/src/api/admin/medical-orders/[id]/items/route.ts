import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MEDICAL_ORDERS_MODULE } from "../../../../../modules/medical-orders";
import MedicalOrdersModuleService from "../../../../../modules/medical-orders/service";
import { resolveRequestActor } from "../../../../../lib/require-role";
import { fetchVariantLabels } from "../../../../../lib/variant-titles";
import { LARGO_MINIMO_INDICACIONES } from "../../../../../lib/receta";
import { ROLES } from "../../../../../lib/roles";
import { limpiarMotivo, revisarAjuste, type CambioDeRenglon } from "../../../../../lib/ajustes-de-orden";
import { conCandado } from "../../../../../lib/candado";

/**
 * POST /admin/medical-orders/:id/items — ajustar los renglones de una orden.
 *
 * Body: { items: [{ variant_id, quantity, product_title?, instructions? }], motivo? }
 *
 * Enfermería, al aplicar una orden en consulta, añade lo que hizo falta (una
 * gasa, una jeringa) o corrige una cantidad. Farmacia puede quitar o reducir lo
 * que no va a surtir. Cada renglón enviado SUSTITUYE al de la misma
 * presentación; con `quantity: 0` se quita. Sólo mientras la orden está
 * pendiente: lo surtido ya salió del inventario y ya está en la cuenta.
 *
 * ── REGISTRO ────────────────────────────────────────────────────────────────
 * Cada cambio queda en `medical_order_adjustment` con quién, cuánto había,
 * cuánto quedó y el motivo. Si Enfermería o Farmacia quitan o reducen, el
 * motivo es obligatorio (20+ caracteres, lib/ajustes-de-orden.ts). El motivo
 * va también en la bitácora: no se redacta, porque es justo lo que el auditor
 * necesita leer.
 *
 * Todo se valida ANTES de escribir: o se aplican todos los cambios o ninguno.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const service: MedicalOrdersModuleService = req.scope.resolve(MEDICAL_ORDERS_MODULE);
        const orderId = req.params.id;
        const { items, motivo } = (req.body ?? {}) as any;

        const actor = await resolveRequestActor(req);
        if (!actor) {
            return res.status(401).json({ error: "No se pudo identificar a quien ajusta. Vuelve a iniciar sesión." });
        }

        if (!Array.isArray(items) || !items.length) {
            return res.status(400).json({ error: "Envía al menos un renglón en `items`." });
        }

        return await conCandado(req.scope as any, `medical-order:${orderId}`, async () => {
            const order = await service.retrieveMedicalOrder(orderId, { relations: ["items"] }).catch(() => null);
            if (!order) {
                return res.status(404).json({ error: "Orden médica no encontrada." });
            }
            if (order.status !== "pending") {
                return res.status(400).json({
                    error: `Esta orden está "${order.status}"; sólo se ajustan las pendientes.`,
                });
            }

            const etiquetas = await fetchVariantLabels(req.scope, items.map((i: any) => i?.variant_id).filter(Boolean));

            // ── 1. Validar y planificar ─────────────────────────────────────
            type Paso = { it: any; cantidad: number; existente: any | null; titulo: string | null };
            const pasos: Paso[] = [];
            const cambios: CambioDeRenglon[] = [];

            for (const it of items) {
                const cantidad = Number(it?.quantity);
                if (!it?.variant_id || !Number.isInteger(cantidad) || cantidad < 0) {
                    return res.status(400).json({
                        error: `Cada renglón necesita presentación y una cantidad entera (0 para quitar). Recibido: ${JSON.stringify(it)}`,
                    });
                }
                const existente = (order.items as any[]).find((r) => r.variant_id === it.variant_id) ?? null;
                const titulo = it.product_title ?? existente?.product_title ?? etiquetas.get(it.variant_id)?.label ?? null;
                const antes = existente ? Number(existente.quantity) : 0;

                // Lo que añade el médico es receta, y va con indicaciones. El
                // material que añade Enfermería al aplicar, no.
                if (!existente && cantidad > 0 && actor.role === ROLES.DOCTOR && String(it.instructions ?? "").trim().length < LARGO_MINIMO_INDICACIONES) {
                    return res.status(400).json({ error: `${titulo ?? "El medicamento"} no tiene indicaciones. Escribe cómo y cada cuánto se toma o se aplica.` });
                }

                pasos.push({ it, cantidad, existente, titulo });
                if (antes !== cantidad) cambios.push({ variant_id: it.variant_id, antes, despues: cantidad });
            }

            const problema = revisarAjuste(actor.role, cambios, motivo);
            if (problema) {
                return res.status(400).json({ error: problema });
            }

            // ── 2. Aplicar y registrar ──────────────────────────────────────
            const motivoLimpio = limpiarMotivo(motivo) || null;
            const descripcion: string[] = [];

            for (const { it, cantidad, existente, titulo } of pasos) {
                if (existente) {
                    if (cantidad === 0) {
                        await service.deleteMedicalOrderItems([existente.id]);
                        descripcion.push(`quitó ${titulo}`);
                    } else {
                        await service.updateMedicalOrderItems({
                            id: existente.id,
                            quantity: cantidad,
                            ...(it.instructions !== undefined ? { instructions: it.instructions } : {}),
                        });
                        if (Number(existente.quantity) !== cantidad) {
                            descripcion.push(`${titulo}: ${existente.quantity} → ${cantidad}`);
                        }
                    }
                } else if (cantidad > 0) {
                    await service.createMedicalOrderItems([
                        {
                            order_id: orderId,
                            variant_id: it.variant_id,
                            product_title: titulo,
                            quantity: cantidad,
                            instructions: it.instructions ?? null,
                        },
                    ]);
                    descripcion.push(`añadió ${cantidad} × ${titulo}`);
                }
            }

            if (cambios.length) {
                await service.createMedicalOrderAdjustments(
                    cambios.map((c) => ({
                        order_id: orderId,
                        variant_id: c.variant_id,
                        product_title: pasos.find((p) => p.it.variant_id === c.variant_id)?.titulo ?? null,
                        quantity_before: c.antes,
                        quantity_after: c.despues,
                        reason: motivoLimpio,
                        actor_id: actor.id,
                        actor_name: actor.name,
                        actor_role: actor.role,
                    }))
                );
            }

            const completa = await service.retrieveMedicalOrder(orderId, { relations: ["items"] });
            const ajustes = await service.listMedicalOrderAdjustments({ order_id: orderId }, { order: { created_at: "ASC" } });
            return res.json({ medical_order: { ...completa, ajustes }, cambios: descripcion });
        });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
};
