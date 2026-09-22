import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { HONORARIOS_MODULE } from "../../../../../../modules/honorarios";
import { LARGO_MINIMO_MOTIVO, limpiarMotivo } from "../../../../../../lib/ajustes-de-orden";
import { resolveRequestActor } from "../../../../../../lib/require-role";
import { ROLES } from "../../../../../../lib/roles";

/**
 * POST /admin/payroll/payments/:id/anular { motivo }
 *
 * Un pago registrado por error (a la persona equivocada, el periodo mal, la
 * referencia de otra transferencia) se ANULA, no se borra: queda con su
 * motivo y quién lo anuló, fuera de la lista de pagos y del candado de
 * "periodo ya pagado", para poder registrar el correcto.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
    try {
        const { id } = req.params;
        const { motivo } = (req.body ?? {}) as any;

        const actor = await resolveRequestActor(req);
        if (!actor) {
            return res.status(401).json({ message: "Vuelve a iniciar sesión." });
        }
        if (actor.role !== ROLES.ADMIN && actor.role !== ROLES.HR) {
            return res.status(403).json({ message: "Los pagos los anulan RH y Administración." });
        }
        const razon = limpiarMotivo(motivo);
        if (razon.length < LARGO_MINIMO_MOTIVO) {
            return res.status(400).json({ message: `Escribe por qué se anula el pago (al menos ${LARGO_MINIMO_MOTIVO} caracteres).` });
        }

        const honorarios: any = req.scope.resolve(HONORARIOS_MODULE);
        const [pago] = await honorarios.listStaffPayments({ id });
        if (!pago) {
            return res.status(404).json({ message: "Pago no encontrado (o ya anulado)." });
        }

        const sello = `[Anulado por ${actor.name ?? actor.email} el ${new Date().toISOString().slice(0, 16).replace("T", " ")}: ${razon}]`;
        await honorarios.updateStaffPayments({ id, notes: [pago.notes, sello].filter(Boolean).join("\n") });
        await honorarios.softDeleteStaffPayments([id]);

        res.json({ anulado: { id, user_name: pago.user_name, amount: Number(pago.amount) }, motivo: razon });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
}
