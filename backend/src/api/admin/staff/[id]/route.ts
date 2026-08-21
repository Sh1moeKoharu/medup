import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { ALL_ROLES, normalizeRole } from "../../../../lib/roles";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params;
  const { first_name, last_name, role } = req.body as any;

  const userModuleService = req.scope.resolve(Modules.USER);

  try {
    const dataToUpdate: any = { id };

    if (first_name !== undefined) dataToUpdate.first_name = first_name;
    if (last_name !== undefined) dataToUpdate.last_name = last_name;

    if (role !== undefined) {
      const canonicalRole = normalizeRole(role);
      if (!canonicalRole) {
        return res.status(400).json({
          message: `Rol inválido: "${role}". Roles válidos: ${ALL_ROLES.join(", ")}.`,
        });
      }

      // Se fusiona con el metadata existente en lugar de reemplazarlo: la
      // versión anterior escribía `{ role }` y borraba cualquier otra clave.
      const [existing] = await userModuleService.listUsers({ id });
      dataToUpdate.metadata = {
        ...((existing?.metadata as Record<string, unknown>) ?? {}),
        role: canonicalRole,
      };
    }

    const result = await userModuleService.updateUsers([dataToUpdate]);

    return res.status(200).json({ user: result[0] });
  } catch (error: any) {
    console.error("Error updating staff:", error);
    return res.status(500).json({ message: error.message || "Error interno" });
  }
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
   const { id } = req.params;
   const userModuleService = req.scope.resolve(Modules.USER);
   try {
       await userModuleService.softDeleteUsers([id]); // Usar softDelete fomenta persistencia relacional
       return res.status(200).json({ success: true, message: "Usuario deshabilitado exitosamente" });
   } catch (e: any) {
       return res.status(500).json({ message: e.message });
   }
}
