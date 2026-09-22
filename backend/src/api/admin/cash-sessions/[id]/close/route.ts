import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { LARGO_MINIMO_MOTIVO, limpiarMotivo } from "../../../../../lib/ajustes-de-orden";
import { resolveRequestActor } from "../../../../../lib/require-role";
import { ROLES } from "../../../../../lib/roles";

/**
 * POST /admin/cash-sessions/:id/close
 * Cierra una sesión de caja
 * Body: { actual_closing_amount, notes?, motivo? }
 *
 * La cierra quien la abrió. Como en la clínica hay UNA sola caja, una que se
 * quedó abierta bloquea a todos: Administración puede cerrarla por la persona,
 * con motivo, y el corte dice quién la cerró y por qué.
 */
export async function POST(
    req: MedusaRequest,
    res: MedusaResponse
) {
    try {
        const { id } = req.params;
        const { actual_closing_amount, notes, motivo } = req.body as any;
        const actor = await resolveRequestActor(req);
        if (!actor) {
            return res.status(401).json({ message: "Vuelve a iniciar sesión." });
        }
        const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
        const cashSessionService = req.scope.resolve("cash_session");

        // Verificar que la sesión existe y está abierta
        const { data: sessions } = await query.graph({
            entity: "cash_session",
            fields: ["id", "status", "opening_amount", "cashier_id", "cashier_name"],
            filters: { id },
        });

        if (!sessions || sessions.length === 0) {
            return res.status(404).json({ message: "Sesión de caja no encontrada" });
        }

        if (sessions[0].status === "closed") {
            return res.status(400).json({ message: "Esta sesión de caja ya está cerrada" });
        }

        const esAjena = sessions[0].cashier_id !== actor.id;
        let selloDeCierre: string | null = null;
        if (esAjena) {
            if (actor.role !== ROLES.ADMIN) {
                return res.status(403).json({
                    message: `Esta caja la abrió ${sessions[0].cashier_name ?? "otra persona"}; sólo esa persona o Administración pueden cerrarla.`,
                });
            }
            const razon = limpiarMotivo(motivo);
            if (razon.length < LARGO_MINIMO_MOTIVO) {
                return res.status(400).json({
                    message: `Para cerrar la caja de otra persona escribe el motivo (al menos ${LARGO_MINIMO_MOTIVO} caracteres).`,
                });
            }
            selloDeCierre = `[Cerrada por ${actor.name ?? actor.email} (Administración) en lugar de ${sessions[0].cashier_name ?? "quien la abrió"}: ${razon}]`;
        }

        // Calcular el monto esperado basado en movimientos
        const { data: movements } = await query.graph({
            entity: "cash_movement",
            fields: ["type", "payment_method", "amount"],
            filters: { session_id: id },
        });

        const openingAmount = Number(sessions[0].opening_amount) || 0;

        // Solo efectivo afecta el total en caja física
        let cashInRegister = openingAmount;
        for (const mov of (movements || [])) {
            const amount = Number(mov.amount) || 0;
            if (mov.payment_method === "cash") {
                if (mov.type === "sale" || mov.type === "cash_in") {
                    cashInRegister += amount;
                } else if (mov.type === "refund" || mov.type === "cash_out") {
                    cashInRegister -= amount;
                }
            }
        }

        const actualAmount = Number(actual_closing_amount) || 0;
        const difference = actualAmount - cashInRegister;

        // Actualizar la sesión
        const updatedSession = await cashSessionService.updateCashSessions({
            id,
            closed_at: new Date(),
            expected_closing_amount: cashInRegister,
            actual_closing_amount: actualAmount,
            difference,
            status: "closed",
            notes: [selloDeCierre, notes].filter(Boolean).join("\n") || null,
        });

        res.json({
            session: updatedSession,
            summary: {
                opening_amount: openingAmount,
                expected_cash: cashInRegister,
                actual_cash: actualAmount,
                difference,
                difference_label: difference > 0 ? "Sobrante" : difference < 0 ? "Faltante" : "Cuadrado",
            },
        });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
}
