import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { CLAVE_BLOQUEADA, estaBloqueado } from "../../../../../lib/personal";
import { aUsuario } from "../../../../../lib/usuarios";

/**
 * POST /admin/staff/:id/unblock — reactivar una cuenta bloqueada.
 * Vuelve a entrar con la misma contraseña; no se toca nada más.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
    const { id } = req.params;
    const userModuleService = req.scope.resolve(Modules.USER);

    try {
        const [user] = await userModuleService.listUsers({ id });
        if (!user) {
            return res.status(404).json({ message: "Usuario no encontrado." });
        }
        if (!estaBloqueado(user)) {
            return res.status(400).json({ message: "Esta cuenta no está bloqueada." });
        }

        // El módulo de usuarios FUSIONA el metadata al actualizar: omitir una
        // clave no la borra. Para quitarla hay que mandarla en null.
        const [updated] = await userModuleService.updateUsers([
            {
                id,
                metadata: {
                    ...((user.metadata as Record<string, unknown>) ?? {}),
                    [CLAVE_BLOQUEADA]: null,
                    blocked_at: null,
                    blocked_by: null,
                    blocked_reason: null,
                },
            },
        ]);

        res.json({ user: updated, username: aUsuario(user.email), blocked: false });
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
}
