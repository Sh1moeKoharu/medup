import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { recordInventoryMovement } from "../../../../../lib/inventory-ledger";
import { resolveRequestActor } from "../../../../../lib/require-role";
import { ROLES } from "../../../../../lib/roles";
import { almacenDeEnfermeria, nombresDeAlmacenes } from "../../../../../lib/almacenes";
import { destinatariosPorRol } from "../../../../../lib/personal-servidor";
import { revisarMotivo } from "../../../../../lib/requisiciones";

/**
 * POST /admin/medical-batches/:id/write-off — Baja directa de un lote.
 *
 * Body: { quantity, reason, notes?, type? }   type: exit_damage (omisión) | exit_adjustment
 *
 * ── PARA QUÉ ────────────────────────────────────────────────────────────────
 * Un frasco que se rompe, una ampolleta que se contamina, una diferencia que
 * aparece al contar. Sale del inventario con su MOTIVO —obligatorio— y queda
 * asentado como `exit_damage` o `exit_adjustment`; los dos tipos existían en
 * el libro mayor y nadie los escribía.
 *
 * ── QUIÉN ───────────────────────────────────────────────────────────────────
 * Enfermería SÓLO sobre su almacén; Farmacia y Administración sobre cualquiera.
 * La política de la API deja pasar a los tres hasta aquí; la comprobación de
 * almacén es de esta ruta.
 *
 * ── AVISO ───────────────────────────────────────────────────────────────────
 * Cada baja se notifica a Administración por rol (ver personal-servidor.ts):
 * es existencia que desaparece por decisión de una persona, y alguien más
 * debe enterarse el mismo día. Lo caducado NO va por aquí: eso es cuarentena
 * y destrucción sanitaria (/destroy), con su propio expediente.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
    try {
        const { id } = req.params;
        const { quantity, reason, notes, type } = (req.body ?? {}) as any;

        const actor = await resolveRequestActor(req);
        if (!actor) {
            return res.status(401).json({ message: "No se pudo identificar a quien da de baja. Vuelve a iniciar sesión." });
        }

        const problemaMotivo = revisarMotivo(reason);
        if (problemaMotivo) {
            return res.status(400).json({ message: problemaMotivo });
        }

        const cantidad = Number(quantity);
        if (!Number.isInteger(cantidad) || cantidad <= 0) {
            return res.status(400).json({ message: `La cantidad a dar de baja debe ser un entero mayor que 0 (recibido: ${quantity}).` });
        }

        const tipo = type ?? "exit_damage";
        if (tipo !== "exit_damage" && tipo !== "exit_adjustment") {
            return res.status(400).json({ message: `Tipo de baja inválido: "${type}". Válidos: exit_damage, exit_adjustment.` });
        }

        const inventario: any = req.scope.resolve("medical_inventory");
        const [batch] = await inventario.listMedicalBatches({ id });
        if (!batch) {
            return res.status(404).json({ message: "Lote no encontrado." });
        }
        if (batch.status !== "active") {
            return res.status(400).json({
                message:
                    batch.status === "quarantined"
                        ? "Este lote está en cuarentena por caducidad: su salida es la destrucción sanitaria, no una baja."
                        : "Este lote ya fue destruido.",
            });
        }
        if (cantidad > Number(batch.quantity)) {
            return res.status(400).json({
                message: `El lote ${batch.batch_number} sólo tiene ${batch.quantity} unidades; no se pueden dar de baja ${cantidad}.`,
            });
        }

        // Enfermería sólo toca su almacén.
        if (actor.role === ROLES.NURSE) {
            const enfermeria = await almacenDeEnfermeria(req.scope as any);
            if (!enfermeria || batch.stock_location_id !== enfermeria.id) {
                return res.status(403).json({
                    message: "Enfermería sólo puede dar de baja lotes de su propio almacén.",
                });
            }
        }

        const saldo = Number(batch.quantity) - cantidad;
        await inventario.updateMedicalBatches({ id, quantity: saldo });

        const recorded = await recordInventoryMovement(req.scope as any, {
            variant_id: batch.variant_id,
            stock_location_id: batch.stock_location_id,
            batch_id: batch.id,
            batch_number: batch.batch_number ?? null,
            expiration_date: batch.expiration_date ?? null,
            quantity_delta: -cantidad,
            quantity_after: saldo,
            type: tipo,
            reason: String(reason).trim(),
            reference_type: "write_off",
            reference_id: batch.id,
            user_id: actor.id,
            user_email: actor.email,
            notes: notes ?? null,
        });

        // ── Aviso a Administración ──────────────────────────────────────────
        const nombres = await nombresDeAlmacenes(req.scope as any);
        const almacen = nombres.get(batch.stock_location_id) ?? batch.stock_location_id ?? "almacén";
        const logger: any = req.scope.resolve("logger");
        let avisados: string[] = [];
        try {
            avisados = await destinatariosPorRol(req.scope as any, [ROLES.ADMIN], process.env.ALERTAS_EMAIL);
            if (avisados.length) {
                const notificaciones: any = req.scope.resolve(Modules.NOTIFICATION);
                for (const destinatario of avisados) {
                    await notificaciones.createNotifications({
                        to: destinatario,
                        channel: "email",
                        template: "inventory-write-off",
                        data: {
                            subject: `Altus: baja de ${cantidad} unidad(es) en ${almacen}`,
                            html:
                                `<p><b>${actor.name}</b> dio de baja <b>${cantidad}</b> unidad(es) del lote ` +
                                `<b>${batch.batch_number}</b> en <b>${almacen}</b>.</p>` +
                                `<p>Motivo: ${String(reason).trim()}</p>` +
                                (notes ? `<p>Notas: ${notes}</p>` : "") +
                                `<p>Saldo del lote: ${saldo}.</p>`,
                        },
                    });
                }
            } else {
                logger.warn(
                    `[BAJA] ${actor.email ?? actor.id} dio de baja ${cantidad} del lote ${batch.batch_number} en ` +
                        `${almacen} (${String(reason).trim()}), pero ninguna cuenta de Administración tiene correo de aviso.`
                );
            }
        } catch (e: any) {
            logger.error(`[BAJA] No se pudo enviar el aviso de la baja del lote ${batch.batch_number}: ${e?.message ?? e}`);
        }

        res.json({
            batch_id: batch.id,
            batch_number: batch.batch_number,
            stock_location_name: nombres.get(batch.stock_location_id) ?? null,
            written_off: cantidad,
            quantity_after: saldo,
            type: tipo,
            reason: String(reason).trim(),
            by: actor.email ?? actor.id,
            ledger_recorded: recorded,
            notified: avisados,
        });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
}
