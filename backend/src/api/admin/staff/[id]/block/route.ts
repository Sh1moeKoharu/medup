import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { CLAVE_BLOQUEADA, estaBloqueado } from "../../../../../lib/personal";
import { resolveRequestActor } from "../../../../../lib/require-role";
import { aUsuario } from "../../../../../lib/usuarios";

/**
 * POST /admin/staff/:id/block — bloqueo REVERSIBLE de una cuenta.
 *
 * Body: { reason? }
 *
 * ── BLOQUEAR NO ES DAR DE BAJA ──────────────────────────────────────────────
 * La baja (DELETE /admin/staff/:id) retira la credencial: la cuenta no puede
 * volver a entrar ni reactivarse, y es lo correcto para quien se va. Para una
 * incapacidad, unas vacaciones o una sospecha que hay que revisar, hace falta
 * cerrar la puerta SIN destruir la llave: eso es esto. La cuenta queda marcada
 * (`metadata.blocked`), no entra (ver el guard en middlewares.ts) y, si ya
 * tenía un token, éste deja de servir porque la resolución de identidad la
 * trata como sin rol. Desbloquear la deja como estaba, con la misma
 * contraseña.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
    const { id } = req.params;
    const { reason } = (req.body ?? {}) as any;
    const userModuleService = req.scope.resolve(Modules.USER);

    try {
        const actor = await resolveRequestActor(req);
        if (actor?.id === id) {
            return res.status(400).json({ message: "No puedes bloquear tu propia cuenta." });
        }

        const [user] = await userModuleService.listUsers({ id });
        if (!user) {
            return res.status(404).json({ message: "Usuario no encontrado." });
        }
        if (estaBloqueado(user)) {
            return res.status(400).json({ message: "Esta cuenta ya estaba bloqueada." });
        }

        const [updated] = await userModuleService.updateUsers([
            {
                id,
                metadata: {
                    ...((user.metadata as Record<string, unknown>) ?? {}),
                    [CLAVE_BLOQUEADA]: true,
                    blocked_at: new Date().toISOString(),
                    blocked_by: actor?.name ?? actor?.id ?? null,
                    blocked_reason: reason ? String(reason).trim() : null,
                },
            },
        ]);

        res.json({ user: updated, username: aUsuario(user.email), blocked: true });
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
}
