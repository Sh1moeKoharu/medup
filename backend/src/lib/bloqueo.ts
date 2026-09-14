import { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { estaBloqueado } from "./personal"
import { aIdentificador } from "./usuarios"

/**
 * Rechaza el inicio de sesión de una cuenta bloqueada ANTES de que el
 * proveedor emita un token.
 *
 * El bloqueo es reversible (ver /admin/staff/:id/block): la credencial sigue
 * existiendo, así que el proveedor la aceptaría. Aquí se mira el perfil antes
 * de dejarlo pasar. Si no viene correo en el cuerpo, se deja seguir: el
 * proveedor responderá lo suyo.
 */
export function rejectBlockedLogin() {
  return async function rejectBlockedLoginMiddleware(
    req: MedusaRequest,
    res: MedusaResponse,
    next: MedusaNextFunction
  ) {
    try {
      const correo = String((req.body as any)?.email ?? "").trim().toLowerCase()
      if (!correo) return next()

      const usuarios: any = req.scope.resolve(Modules.USER)
      const [user] = await usuarios.listUsers({ email: aIdentificador(correo) })
      if (user && estaBloqueado(user)) {
        return res.status(401).json({
          type: "blocked",
          message: "Esta cuenta está bloqueada. Habla con Administración.",
        })
      }
    } catch {
      // Ante cualquier duda, que decida el proveedor de autenticación.
    }
    return next()
  }
}
