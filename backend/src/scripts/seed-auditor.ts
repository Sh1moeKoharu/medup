import { MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

export default async function createAuditor({ container }: { container: MedusaContainer }) {
  const userModuleService = container.resolve(Modules.USER);
  const authModuleService = container.resolve(Modules.AUTH);
  
  const email = "auditoria@pos.com";
  const password = "Password123#!";
  
  console.log(`Creando usuario auditor con email: ${email}`);

  const existing = await userModuleService.listUsers({ email });
  if (existing.length > 0) {
    console.log("El usuario auditor ya existe.");
    return;
  }

  // Nos registramos a través del modulo local de Auth para que haga el hashing
  const authUrl = `http://localhost:9000/auth/user/emailpass/register`;
  const tokenRes = await fetch(authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });

  if (!tokenRes.ok) {
     const text = await tokenRes.text();
     console.error("Fallo al registrar la contraseña en auth:", text);
     return;
  }

  const authIdentities = await authModuleService.listAuthIdentities({ 
    // @ts-ignore
    provider_identities: { entity_id: email }
  });

  if (authIdentities.length === 0) {
      console.error("No se pudo generar la identidad en el sistema.");
      return;
  }

  const authIdentity = authIdentities[0];

  const user = await userModuleService.createUsers([{
    email,
    first_name: "Usuario",
    last_name: "Auditor",
    metadata: { role: "auditor" }
  }]);

  await authModuleService.updateAuthIdentities([{
      id: authIdentity.id,
      app_metadata: { user_id: user[0].id }
  }]);

  console.log(`Usuario auditor creado exitosamente.`);
  console.log(`-----------------------------------`);
  console.log(`Correo: ${email}`);
  console.log(`Clave:  ${password}`);
  console.log(`-----------------------------------`);
}
