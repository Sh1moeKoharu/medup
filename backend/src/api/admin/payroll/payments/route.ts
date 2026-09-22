import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { HONORARIOS_MODULE } from "../../../../modules/honorarios";
import { conDiasDelPeriodo } from "../../../../lib/nomina";

/** GET /admin/payroll/payments?user_id= — pagos realizados, los más recientes primero. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
    try {
        const honorarios: any = req.scope.resolve(HONORARIOS_MODULE);
        const { user_id } = req.query as Record<string, string>;
        const pagos = await honorarios.listStaffPayments(user_id ? { user_id } : {}, { take: 500, order: { paid_at: "DESC" } });
        res.json({ pagos: pagos.map(conDiasDelPeriodo) });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
}
