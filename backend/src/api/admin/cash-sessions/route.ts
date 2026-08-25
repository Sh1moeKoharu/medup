import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { resolveRequestActor } from "../../../lib/require-role";

/**
 * GET /admin/cash-sessions
 * Lista todas las sesiones de caja, con filtros opcionales
 * Query params: ?status=open|closed&cashier_id=xxx&limit=20&offset=0
 */
export async function GET(
    req: MedusaRequest,
    res: MedusaResponse
) {
    try {
        const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
        const { status, cashier_id, limit = "20", offset = "0" } = req.query as Record<string, string>;

        const filters: Record<string, any> = {};
        if (status) filters.status = status;
        if (cashier_id) filters.cashier_id = cashier_id;

        const { data: sessions } = await query.graph({
            entity: "cash_session",
            fields: [
                "id",
                "opened_at",
                "closed_at",
                "opening_amount",
                "expected_closing_amount",
                "actual_closing_amount",
                "difference",
                "cashier_id",
                "cashier_name",
                "sales_channel_id",
                "status",
                "notes",
            ],
            filters,
            pagination: {
                take: Number(limit),
                skip: Number(offset),
                order: { opened_at: "DESC" },
            },
        });

        res.json({ sessions: sessions || [] });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
}

/**
 * POST /admin/cash-sessions
 * Abre una nueva sesión (turno) de caja
 * Body: { opening_amount, sales_channel_id? }
 *
 * ── QUIÉN ABRE LA CAJA NO SE PREGUNTA, SE SABE ──────────────────────────────
 * Antes el nombre del cajero venía en el cuerpo de la petición: la pantalla
 * pedía "Nombre del cajero" como texto libre y aquí se guardaba tal cual. El
 * registro quedaba contradiciéndose a sí mismo — `cashier_id` era el usuario
 * real de la sesión, pero `cashier_name`, que es lo que se muestra en pantalla
 * y en el corte, era lo que alguien hubiera tecleado.
 *
 * Con eso, quien entrara como caja@… podía escribir cualquier nombre y el corte
 * de caja, con su sobrante o su faltante, quedaba atribuido a esa persona. Un
 * registro contable que no identifica a quien respondió por el dinero no sirve
 * para lo que existe, y es justo lo que la NOM-024-SSA3-2012 §6.6.1 llama no
 * repudio.
 *
 * Ahora la identidad se resuelve desde la SESIÓN, igual que ya se hace en la
 * bitácora y en la identidad del prescriptor. Lo que venga en el cuerpo se
 * ignora.
 */
export async function POST(
    req: MedusaRequest,
    res: MedusaResponse
) {
    try {
        const cashSessionService = req.scope.resolve("cash_session");
        const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

        const {
            opening_amount,
            sales_channel_id,
        } = req.body as any;

        // Verificar que no haya una sesión abierta ya
        const { data: openSessions } = await query.graph({
            entity: "cash_session",
            fields: ["id"],
            filters: { status: "open" },
        });

        if (openSessions && openSessions.length > 0) {
            return res.status(400).json({
                message: "Ya existe una sesión de caja abierta. Ciérrala antes de abrir una nueva.",
                existing_session_id: openSessions[0].id,
            });
        }

        // Identidad del cajero: de la sesión, nunca del cuerpo.
        const actor = await resolveRequestActor(req);

        if (!actor) {
            // Antes se caía a "unknown" / "Cajero" y la caja se abría igual,
            // dejando un turno sin responsable. Es preferible no abrirla.
            return res.status(401).json({
                message:
                    "No se pudo identificar al usuario. Vuelve a iniciar sesión para abrir la caja.",
            });
        }

        const session = await cashSessionService.createCashSessions({
            opened_at: new Date(),
            opening_amount: Number(opening_amount) || 0,
            cashier_id: actor.id,
            cashier_name: actor.name,
            sales_channel_id: sales_channel_id || null,
            status: "open",
        });

        res.status(201).json({ session });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
}
