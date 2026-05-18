import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params;
  const { first_name, last_name, role } = req.body as any;

  const userModuleService = req.scope.resolve(Modules.USER);

  try {
    // Para no sobrescribir metadata existente por completo, hay que obtenerla primero
    // Sin embargo, para este caso de uso base, asignarlo directamente es suficiente.
    const dataToUpdate: any = { id };
    
    if (first_name !== undefined) dataToUpdate.first_name = first_name;
    if (last_name !== undefined) dataToUpdate.last_name = last_name;
    if (role !== undefined) dataToUpdate.metadata = { role };

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
