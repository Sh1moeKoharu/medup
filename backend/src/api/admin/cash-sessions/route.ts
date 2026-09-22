import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { ZONA_CLINICA } from "../../../lib/zona-horaria";
import { resolveRequestActor } from "../../../lib/require-role";

/**
 * GET /admin/cash-sessions
 * Lista todas las sesiones de caja, con filtros opcionales
 * Query params: ?status=open|closed&cashier_id=xxx&from=&to=&limit=20&offset=0
 */
export async function GET(
    req: MedusaRequest,
    res: MedusaResponse
) {
    try {
        const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
        const { status, cashier_id, from, to, limit = "20", offset = "0" } = req.query as Record<string, string>;

        const filters: Record<string, any> = {};
        if (status) filters.status = status;
        if (cashier_id) filters.cashier_id = cashier_id;
        // Rango sobre la apertura: es la fecha del turno.
        if (from || to) {
            filters.opened_at = {};
            if (from) filters.opened_at.$gte = new Date(from).toISOString();
            if (to) filters.opened_at.$lte = new Date(to).toISOString();
        }

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

        // UNA sola caja abierta en toda la clínica. Antes era un turno por
        // cajero y dos cajas podían trabajar a la vez; la clínica pidió que no
        // se abra caja hasta que la anterior esté cerrada, para que cada corte
        // cuadre contra un solo cajón. La base lo refuerza con un índice único
        // parcial (Migration20260914120000).
        const { data: openSessions } = await query.graph({
            entity: "cash_session",
            fields: ["id", "cashier_id", "cashier_name", "opened_at"],
            filters: { status: "open" },
        });

        const abierta = openSessions?.[0];
        if (abierta) {
            if (abierta.cashier_id === actor.id) {
                return res.status(400).json({
                    message: "Ya tienes un turno de caja abierto. Ciérralo antes de abrir otro.",
                    existing_session_id: abierta.id,
                });
            }
            return res.status(409).json({
                type: "caja_ocupada",
                message: `La caja está abierta por ${abierta.cashier_name} desde ${horaDeLaClinica(abierta.opened_at)}. Debe cerrarse antes de abrir otra.`,
                open_session: { id: abierta.id, cashier_name: abierta.cashier_name, opened_at: abierta.opened_at },
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
        // Dos aperturas en el mismo instante: la segunda choca con el índice.
        // Medusa traduce la violación de unicidad a «Cash session with … already exists».
        if (String(error?.code ?? error?.cause?.code) === "23505" || /IDX_cash_session_una_abierta|already exists/.test(String(error?.message))) {
            return res.status(409).json({ type: "caja_ocupada", message: "Otra persona acaba de abrir la caja. Debe cerrarse antes de abrir otra." });
        }
        res.status(400).json({ message: error.message });
    }
}

/** "hoy a las 09:12" o "el 13/09 a las 18:40", en hora de la clínica. */
function horaDeLaClinica(fecha: string | Date): string {
    const d = new Date(fecha);
    const zona = { timeZone: ZONA_CLINICA } as const;
    const dia = (x: Date) => x.toLocaleDateString("es-MX", { ...zona, day: "2-digit", month: "2-digit" });
    const hora = d.toLocaleTimeString("es-MX", { ...zona, hour: "2-digit", minute: "2-digit", hour12: false });
    return dia(d) === dia(new Date()) ? `hoy a las ${hora}` : `el ${dia(d)} a las ${hora}`;
}
