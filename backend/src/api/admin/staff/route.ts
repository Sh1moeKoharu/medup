import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { ALL_ROLES, normalizeRole } from "../../../lib/roles";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { email, password, first_name, last_name, role } = req.body as any;

  if (!email || !password || !role) {
    return res.status(400).json({ message: "email, password y role son requeridos" });
  }

  // El rol se persiste ya normalizado: la BD nunca debe guardar un valor
  // fuera del vocabulario canónico (era la causa del desajuste enfermero/nurse).
  const canonicalRole = normalizeRole(role);
  if (!canonicalRole) {
    return res.status(400).json({
      message: `Rol inválido: "${role}". Roles válidos: ${ALL_ROLES.join(", ")}.`,
    });
  }

  const userModuleService = req.scope.resolve(Modules.USER);
  const authModuleService = req.scope.resolve(Modules.AUTH);

  try {
    const existing = await userModuleService.listUsers({ email });
    if (existing.length > 0) {
      return res.status(400).json({ message: "El usuario ya existe en el sistema" });
    }

    // 1. Crear el Auth Identity usando el API local (evita hashes manuales)
    // Usamos el hostname de la petición para llamar a nosotros mismos internamente
    const port = process.env.PORT || 9000;
    const authUrl = `http://localhost:${port}/auth/user/emailpass/register`;
    
    const tokenRes = await fetch(authUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    if (!tokenRes.ok) {
        const errorText = await tokenRes.text();
        console.error("Auth register failed", errorText);
        return res.status(400).json({ message: "El registro de autenticación falló. Revisa los requisitos de contraseña." });
    }

    // 2. Localizar el AuthIdentity recién creado
    const authIdentities = await authModuleService.listAuthIdentities({ 
      provider_identities: { entity_id: email }
    });

    if (authIdentities.length === 0) {
        return res.status(500).json({ message: "No se pudo generar la identidad en el sistema." });
    }

    const authIdentity = authIdentities[0];

    // 3. Crear el Perfil del Usuario y Asignarle el Id
    const user = await userModuleService.createUsers([{
      email,
      first_name,
      last_name,
      metadata: { role: canonicalRole }
    }]);

    // 4. Vincular el Identity con el Usuario
    await authModuleService.updateAuthIdentities([{
        id: authIdentity.id,
        app_metadata: { user_id: user[0].id }
    }]);

    return res.status(200).json({ user: user[0] });
  } catch (error: any) {
    console.error("Error creating staff account:", error);
    return res.status(500).json({ message: error.message || "Error interno de servidor" });
  }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
    const userModuleService = req.scope.resolve(Modules.USER);
    try {
        const users = await userModuleService.listUsers({}, { take: 100 });
        return res.status(200).json({ users });
    } catch (error: any) {
        return res.status(500).json({ message: error.message });
    }
}
