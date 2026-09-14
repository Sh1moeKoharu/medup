import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { aUsuario } from "../../../../../lib/usuarios";

/**
 * POST /admin/staff/:id/password — Administración cambia la contraseña de
 * una cuenta.
 *
 * Body: { password }
 *
 * Hasta hoy la contraseña sólo se fijaba al crear la cuenta; quien la olvidaba
 * tenía que ser dado de baja y de alta. Se cambia por el proveedor de
 * autenticación (mismo camino que el alta), sin tocar el perfil: rol, número
 * de empleado y correo de aviso siguen iguales. La anterior deja de servir en
 * el acto; los tokens ya emitidos siguen vivos hasta que caducan, que es
 * cosa del propio JWT.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
    const { id } = req.params;
    const { password } = (req.body ?? {}) as any;

    if (!password || typeof password !== "string" || password.length < 8) {
        return res.status(400).json({ message: "La contraseña nueva debe tener al menos 8 caracteres." });
    }

    const userModuleService = req.scope.resolve(Modules.USER);
    const authModuleService: any = req.scope.resolve(Modules.AUTH);

    try {
        const [user] = await userModuleService.listUsers({ id });
        if (!user) {
            return res.status(404).json({ message: "Usuario no encontrado." });
        }

        const { success, error } = await authModuleService.updateProvider("emailpass", {
            entity_id: user.email,
            password,
        });

        if (!success) {
            return res.status(400).json({
                message: `No se pudo cambiar la contraseña: ${error ?? "motivo desconocido"}.`,
            });
        }

        res.json({ id: user.id, username: aUsuario(user.email), password_changed: true });
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
}
