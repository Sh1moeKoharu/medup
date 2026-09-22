import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { calcularResumen } from "../../../../../lib/corte-de-caja";
import { htmlCorte } from "../../../../../lib/documentos";
import { membreteDeLaClinica } from "../../../../../lib/membrete";
import { ROLES, Role } from "../../../../../lib/roles";
import { resolveRequestRole } from "../../../../../lib/require-role";

/** Quién imprime un corte: quien cobra, quien administra y quien audita. */
const PUEDEN_VER_CORTES: Role[] = [ROLES.ADMIN, ROLES.CASHIER, ROLES.AUDITOR, ROLES.HR];

/**
 * GET /admin/documents/corte/:id — el corte de un turno de caja (arqueo).
 * Sirve para el turno abierto (sin conteo) y para uno cerrado (con conteo y
 * diferencia); reimprimible cuantas veces haga falta.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const rol = await resolveRequestRole(req);
        if (!rol || !PUEDEN_VER_CORTES.includes(rol)) {
            return res.status(403).json({ type: "not_allowed", error: "El corte de caja no corresponde a tu rol." });
        }

        const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
        const { data: sesiones } = await query.graph({
            entity: "cash_session",
            fields: ["id", "opened_at", "closed_at", "opening_amount", "actual_closing_amount", "difference", "cashier_name", "status", "notes"],
            filters: { id: req.params.id },
        });
        const sesion: any = sesiones?.[0];
        if (!sesion) {
            return res.status(404).json({ error: "Turno de caja no encontrado." });
        }

        const { data: movimientos } = await query.graph({
            entity: "cash_movement",
            fields: ["type", "payment_method", "amount"],
            filters: { session_id: sesion.id },
        });

        const resumen = calcularResumen(sesion.opening_amount, (movimientos ?? []) as any);

        const html = htmlCorte({
            membrete: await membreteDeLaClinica(req.scope as any),
            folio: sesion.id,
            cajero: sesion.cashier_name,
            abierto: sesion.opened_at,
            cerrado: sesion.closed_at,
            resumen,
            contado: sesion.status === "closed" ? Number(sesion.actual_closing_amount) : null,
            diferencia: sesion.status === "closed" ? Number(sesion.difference) : null,
            notas: sesion.notes,
        });

        if (!html) {
            return res.status(400).json({ error: "El turno no tiene lo necesario para imprimir un corte." });
        }

        res.json({ html, title: `Corte de caja ${sesion.id}`, resumen });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
