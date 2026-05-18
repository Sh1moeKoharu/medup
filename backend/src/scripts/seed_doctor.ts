import { MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

export default async function updateDoctorRole({ container }: { container: MedusaContainer }) {
  const userModuleService = container.resolve(Modules.USER);

  console.log("Buscando usuario doctor@pos.com...");

  const users = await userModuleService.listUsers({
    email: "doctor@pos.com"
  });

  if (users.length > 0) {
    const userId = users[0].id;
    console.log("Found user:", userId);
    await userModuleService.updateUsers([{
      id: userId,
      metadata: { role: "doctor" }
    }]);
    console.log(`Usuario ${userId} actualizado con rol de doctor exitosamente.`);
  } else {
    console.log("No se encontró el usuario doctor@pos.com");
  }
}
