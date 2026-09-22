import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { membreteDeLaClinica } from "../../../lib/membrete";
import { perfilCompleto, perfilDe } from "../../../lib/perfil-profesional";
import { resolveRequestActor } from "../../../lib/require-role";
import { ROLE_LABELS } from "../../../lib/roles";

/**
 * GET /admin/mi-perfil — quién soy para la receta: nombre, rol, datos
 * profesionales y el membrete de la clínica.
 *
 * El médico no puede leer `/admin/staff` (es la plantilla entera), pero sí
 * necesita ver sus propios datos en su pantalla de inicio y saber si le falta
 * algo para que su receta salga completa. Sólo lectura: los datos los captura
 * Administración.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
    const actor = await resolveRequestActor(req);
    if (!actor) {
        return res.status(401).json({ message: "Vuelve a iniciar sesión." });
    }
    const usuarios: any = req.scope.resolve(Modules.USER);
    const [yo] = await usuarios.listUsers({ id: actor.id });
    const perfil = perfilDe(yo);

    res.json({
        nombre: actor.name,
        rol: actor.role,
        rol_etiqueta: actor.role ? ROLE_LABELS[actor.role] : null,
        numero_empleado: actor.employee_number,
        perfil_profesional: perfil,
        perfil_completo: perfilCompleto(perfil),
        clinica: await membreteDeLaClinica(req.scope as any),
    });
}
