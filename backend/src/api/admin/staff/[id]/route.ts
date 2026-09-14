import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { ALL_ROLES, normalizeRole } from "../../../../lib/roles";
import { aUsuario } from "../../../../lib/usuarios";
import {
    CLAVE_CORREO_AVISO,
    CLAVE_NUMERO_EMPLEADO,
    normalizarNumeroDeEmpleado,
    revisarCorreoDeAviso,
    revisarNumeroDeEmpleado,
} from "../../../../lib/personal";
import { quienTieneElNumero } from "../../../../lib/personal-servidor";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params;
  const { first_name, last_name, role, employee_number, notification_email } = req.body as any;

  const userModuleService = req.scope.resolve(Modules.USER);

  try {
    const dataToUpdate: any = { id };

    if (first_name !== undefined) dataToUpdate.first_name = first_name;
    if (last_name !== undefined) dataToUpdate.last_name = last_name;

    // Todo lo que vive en metadata se fusiona sobre lo existente en lugar de
    // reemplazarlo: la versión anterior escribía `{ role }` y borraba cualquier
    // otra clave. Ahora hay más de una.
    const tocaMetadata =
      role !== undefined || employee_number !== undefined || notification_email !== undefined;

    if (tocaMetadata) {
      const [existing] = await userModuleService.listUsers({ id });
      const metadata: Record<string, unknown> = {
        ...((existing?.metadata as Record<string, unknown>) ?? {}),
      };

      if (role !== undefined) {
        const canonicalRole = normalizeRole(role);
        if (!canonicalRole) {
          return res.status(400).json({
            message: `Rol inválido: "${role}". Roles válidos: ${ALL_ROLES.join(", ")}.`,
          });
        }
        metadata.role = canonicalRole;
      }

      // Vacío quita el número; cualquier otra cosa lo valida y comprueba que
      // nadie más lo tenga, incluidas las cuentas dadas de baja.
      if (employee_number !== undefined) {
        const numero = normalizarNumeroDeEmpleado(employee_number);
        if (!numero) {
          // El módulo FUSIONA el metadata: para quitar una clave se manda en null.
          metadata[CLAVE_NUMERO_EMPLEADO] = null;
        } else {
          const problema = revisarNumeroDeEmpleado(numero);
          if (problema) {
            return res.status(400).json({ message: problema });
          }
          const dueño = await quienTieneElNumero(req.scope, numero, id);
          if (dueño) {
            return res.status(400).json({
              message: `El número de empleado ${numero} ya lo tiene ${aUsuario(dueño)}.`,
            });
          }
          metadata[CLAVE_NUMERO_EMPLEADO] = numero;
        }
      }

      if (notification_email !== undefined) {
        const correo = String(notification_email ?? "").trim().toLowerCase();
        if (!correo) {
          metadata[CLAVE_CORREO_AVISO] = null;
        } else {
          const problema = revisarCorreoDeAviso(correo);
          if (problema) {
            return res.status(400).json({ message: problema });
          }
          metadata[CLAVE_CORREO_AVISO] = correo;
        }
      }

      dataToUpdate.metadata = metadata;
    }

    const result = await userModuleService.updateUsers([dataToUpdate]);

    return res.status(200).json({ user: result[0] });
  } catch (error: any) {
    console.error("Error updating staff:", error);
    return res.status(500).json({ message: error.message || "Error interno" });
  }
}

/**
 * Baja de personal.
 *
 * ── LA CREDENCIAL TAMBIÉN SE VA ─────────────────────────────────────────────
 * Antes esto sólo hacía `softDeleteUsers`, que marca el PERFIL como borrado
 * pero deja intacta la identidad de acceso. La persona dada de baja seguía
 * pudiendo autenticarse y obtener un token válido.
 *
 * No llegaba a ser una brecha —`resolveRequestActor` no encuentra al usuario,
 * devuelve rol nulo y los guards deniegan—, pero es una credencial viva de
 * alguien que ya no trabaja aquí, y esa distinción no debería depender de que
 * ningún camino futuro la pase por alto.
 *
 * Se conserva el borrado SUAVE del perfil a propósito: el usuario aparece como
 * autor de órdenes médicas y movimientos de inventario, y borrarlo de verdad
 * dejaría ese historial apuntando a alguien que no existe.
 */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
   const { id } = req.params;
   const userModuleService = req.scope.resolve(Modules.USER);
   const authModuleService: any = req.scope.resolve(Modules.AUTH);

   try {
       const [user] = await userModuleService.listUsers({ id });

       if (!user) {
           return res.status(404).json({ message: "Usuario no encontrado" });
       }

       // 1. El perfil, en borrado suave: conserva la trazabilidad.
       await userModuleService.softDeleteUsers([id]);

       // 2. La identidad de acceso, fuera. Si falla, se avisa en lugar de
       //    dejar creer que la cuenta quedó cerrada del todo.
       let credencialRetirada = false;
       try {
           const identities = await authModuleService.listAuthIdentities({
               provider_identities: { entity_id: user.email },
           });

           if (identities?.length) {
               await authModuleService.deleteAuthIdentities(identities.map((i: any) => i.id));
               credencialRetirada = true;
           } else {
               // Sin identidad no hay nada que retirar: la cuenta ya no podía entrar.
               credencialRetirada = true;
           }
       } catch (authError: any) {
           console.error("No se pudo eliminar la identidad de acceso:", authError);
       }

       return res.status(200).json({
           success: true,
           message: credencialRetirada
               ? "Usuario deshabilitado y credencial retirada."
               : "Usuario deshabilitado, pero NO se pudo retirar su credencial de acceso. " +
                 "Revísalo antes de dar por cerrada la baja.",
           credencial_retirada: credencialRetirada,
       });
   } catch (e: any) {
       return res.status(500).json({ message: e.message });
   }
}
