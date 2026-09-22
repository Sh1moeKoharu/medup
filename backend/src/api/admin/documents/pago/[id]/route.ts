import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { HONORARIOS_MODULE } from "../../../../../modules/honorarios";
import { htmlPago } from "../../../../../lib/documentos";
import { membreteDeLaClinica } from "../../../../../lib/membrete";
import { resolveRequestRole } from "../../../../../lib/require-role";
import { ROLES, Role, roleLabel } from "../../../../../lib/roles";

/** Quién imprime un recibo de pago: quien paga y quien audita. */
const PUEDEN_VER_PAGOS: Role[] = [ROLES.ADMIN, ROLES.HR, ROLES.AUDITOR];

/** GET /admin/documents/pago/:id — recibo de un pago de honorarios o nómina. */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const rol = await resolveRequestRole(req);
        if (!rol || !PUEDEN_VER_PAGOS.includes(rol)) {
            return res.status(403).json({ message: "Los recibos de pago no corresponden a tu perfil." });
        }
        const honorarios: any = req.scope.resolve(HONORARIOS_MODULE);
        const [pago] = await honorarios.listStaffPayments({ id: req.params.id });
        if (!pago) {
            return res.status(404).json({ message: "Pago no encontrado." });
        }
        const folio = String(pago.id).slice(-8).toUpperCase();
        const html = htmlPago({
            membrete: await membreteDeLaClinica(req.scope as any),
            folio,
            persona: pago.user_name ?? pago.user_id,
            rol: roleLabel(pago.role),
            numero_empleado: pago.breakdown?.numero_empleado ?? null,
            desde: pago.period_from,
            hasta: pago.period_to,
            pagado_en: pago.paid_at,
            pagado_por: pago.paid_by_name ?? pago.paid_by_id,
            referencia: pago.reference,
            notas: pago.notes,
            desglose: pago.breakdown,
        });
        if (!html) {
            return res.status(400).json({ message: "El pago no tiene desglose que imprimir." });
        }
        res.json({ html, title: `Recibo de pago ${folio}` });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
