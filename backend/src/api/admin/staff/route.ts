import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { ALL_ROLES, normalizeRole } from "../../../lib/roles";
import { aIdentificador, aUsuario, revisarUsuario } from "../../../lib/usuarios";
import {
    CLAVE_CORREO_AVISO,
    CLAVE_NUMERO_EMPLEADO,
    normalizarNumeroDeEmpleado,
    revisarCorreoDeAviso,
    revisarNumeroDeEmpleado,
} from "../../../lib/personal";
import { quienTieneElNumero } from "../../../lib/personal-servidor";

/**
 * Alta y consulta de personal.
 *
 * ── EL ALTA YA NO PASA POR HTTP ─────────────────────────────────────────────
 * Antes esta ruta creaba la identidad de acceso llamándose a sí misma:
 *
 *     fetch(`http://localhost:${PORT}/auth/user/emailpass/register`, …)
 *
 * Funcionaba, pero obligaba a dejar ABIERTA una ruta pública de registro —
 * cualquiera en la red podía crear identidades de autenticación sin estar
 * autenticado— y ataba el alta de personal a que el servidor pudiera hacerse
 * peticiones a sí mismo por el puerto correcto.
 *
 * Ahora se usa el módulo de autenticación directamente, igual que hace
 * `scripts/crear-admin.ts` desde la línea de comandos. Eso permite cerrar la
 * ruta pública (ver `blockRoute` sobre /auth/user/emailpass/register en
 * middlewares.ts) sin romper nada.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  // Se acepta `username`, que es lo que manda el panel. `email` se sigue
  // admitiendo para no romper a nadie que llamara a esta ruta antes del cambio;
  // `aIdentificador` deja igual lo que ya trae arroba.
  const {
    username,
    email,
    password,
    first_name,
    last_name,
    role,
    employee_number,
    notification_email,
  } = req.body as any;

  const tecleado: string = (username ?? email ?? "").trim();

  if (!tecleado || !password || !role) {
    return res.status(400).json({ message: "usuario, contraseña y rol son requeridos" });
  }

  // Sólo se valida la forma cuando viene un usuario nuevo. Un correo completo
  // pasa de largo: puede ser una cuenta antigua que todavía entra con el suyo.
  if (!tecleado.includes("@")) {
    const problema = revisarUsuario(tecleado);
    if (problema) {
      return res.status(400).json({ message: problema });
    }
  }

  const identificador = aIdentificador(tecleado);

  // El rol se persiste ya normalizado: la BD nunca debe guardar un valor
  // fuera del vocabulario canónico (era la causa del desajuste enfermero/nurse).
  const canonicalRole = normalizeRole(role);
  if (!canonicalRole) {
    return res.status(400).json({
      message: `Rol inválido: "${role}". Roles válidos: ${ALL_ROLES.join(", ")}.`,
    });
  }

  // Número de empleado y correo de aviso: opcionales, pero si vienen, válidos.
  // Qué son y por qué existen está en lib/personal.ts.
  const numeroEmpleado = employee_number ? normalizarNumeroDeEmpleado(employee_number) : null;
  if (numeroEmpleado) {
    const problema = revisarNumeroDeEmpleado(numeroEmpleado);
    if (problema) {
      return res.status(400).json({ message: problema });
    }
  }

  const correoAviso = String(notification_email ?? "").trim().toLowerCase() || null;
  const problemaCorreo = revisarCorreoDeAviso(correoAviso);
  if (problemaCorreo) {
    return res.status(400).json({ message: problemaCorreo });
  }

  const userModuleService = req.scope.resolve(Modules.USER);
  const authModuleService: any = req.scope.resolve(Modules.AUTH);

  try {
    const existing = await userModuleService.listUsers({ email: identificador });
    if (existing.length > 0) {
      return res.status(400).json({
        message: `El usuario "${aUsuario(identificador)}" ya existe en el sistema.`,
      });
    }

    if (numeroEmpleado) {
      const dueño = await quienTieneElNumero(req.scope, numeroEmpleado);
      if (dueño) {
        return res.status(400).json({
          message: `El número de empleado ${numeroEmpleado} ya lo tiene ${aUsuario(dueño)}.`,
        });
      }
    }

    // 1. Identidad de acceso, por el módulo (no por HTTP).
    const { success, error } = await authModuleService.register("emailpass", {
      body: { email: identificador, password },
    });

    if (!success) {
      return res.status(400).json({
        message:
          `No se pudo registrar la identidad de acceso: ${error ?? "motivo desconocido"}. ` +
          `Revisa los requisitos de contraseña.`,
      });
    }

    // 2. Localizar la identidad recién creada.
    const authIdentities = await authModuleService.listAuthIdentities({
      provider_identities: { entity_id: identificador },
    });

    if (!authIdentities.length) {
      return res.status(500).json({
        message:
          "Se registró la identidad pero no se pudo localizar. " +
          "Revisa el estado antes de continuar: la cuenta puede haber quedado a medias.",
      });
    }

    // 3. Perfil del usuario, con su rol.
    const user = await userModuleService.createUsers([
      {
        email: identificador,
        first_name,
        last_name,
        metadata: {
          role: canonicalRole,
          ...(numeroEmpleado ? { [CLAVE_NUMERO_EMPLEADO]: numeroEmpleado } : {}),
          ...(correoAviso ? { [CLAVE_CORREO_AVISO]: correoAviso } : {}),
        },
      },
    ]);

    // 4. Vincular identidad y usuario. Sin esto la cuenta autentica pero no
    //    resuelve a ningún usuario, así que no tiene acceso a nada.
    await authModuleService.updateAuthIdentities([
      {
        id: authIdentities[0].id,
        app_metadata: { user_id: user[0].id },
      },
    ]);

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
