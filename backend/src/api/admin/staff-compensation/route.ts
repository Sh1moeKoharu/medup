import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { HONORARIOS_MODULE } from "../../../modules/honorarios";
import { revisarEsquema } from "../../../lib/nomina";
import { esquemasDePago } from "../../../lib/nomina-servidor";
import { numeroDeEmpleado } from "../../../lib/personal";
import { normalizeRole } from "../../../lib/roles";

/**
 * Esquema de pago de cada persona.
 *
 *   GET  /admin/staff-compensation   — todo el personal, con su esquema (o null)
 *   POST /admin/staff-compensation   { user_id, fixed_per_shift, hourly_rate,
 *                                      default_percent, notes?, reglas: [{ label?, days, start_time, end_time, percent }] }
 *
 * Las reglas se SUSTITUYEN completas en cada guardado: la pantalla manda la
 * lista entera como la dejó quien la editó. Ver lib/nomina.ts.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
    try {
        const usuarios: any[] = await (req.scope.resolve(Modules.USER) as any).listUsers({}, { take: 1000 });
        const esquemas = await esquemasDePago(req.scope as any);
        const personal = usuarios
            .map((u) => ({
                user_id: u.id,
                nombre: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email,
                usuario: String(u.email ?? "").replace(/@sigh\.local$/, ""),
                rol: normalizeRole(u.metadata?.role),
                numero_empleado: numeroDeEmpleado(u),
                esquema: esquemas.get(u.id) ?? null,
            }))
            .filter((p) => p.rol)
            .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
        res.json({ personal });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
    try {
        const honorarios: any = req.scope.resolve(HONORARIOS_MODULE);
        const { user_id, fixed_per_shift, hourly_rate, default_percent, notes, reglas } = (req.body ?? {}) as any;

        if (!user_id) {
            return res.status(400).json({ message: "Falta la persona (user_id)." });
        }
        const lista = Array.isArray(reglas) ? reglas : [];
        const esquema = {
            fixed_per_shift: Number(fixed_per_shift ?? 0),
            hourly_rate: Number(hourly_rate ?? 0),
            default_percent: Number(default_percent ?? 0),
            reglas: lista.map((r: any) => ({
                label: r?.label ? String(r.label).trim().slice(0, 60) : null,
                days: String(r?.days ?? "").replace(/\s+/g, ""),
                start_time: String(r?.start_time ?? ""),
                end_time: String(r?.end_time ?? ""),
                percent: Number(r?.percent),
            })),
        };
        const problema = revisarEsquema(esquema);
        if (problema) {
            return res.status(400).json({ message: problema });
        }

        const [persona] = await (req.scope.resolve(Modules.USER) as any).listUsers({ id: user_id });
        if (!persona) {
            return res.status(404).json({ message: "La persona no existe." });
        }
        const nombre = [persona.first_name, persona.last_name].filter(Boolean).join(" ") || persona.email;
        const rol = normalizeRole(persona.metadata?.role);

        const datos = {
            user_name: nombre,
            role: rol,
            fixed_per_shift: esquema.fixed_per_shift,
            hourly_rate: esquema.hourly_rate,
            default_percent: esquema.default_percent,
            notes: notes ?? null,
        };
        const [existente] = await honorarios.listStaffCompensations({ user_id });
        const guardado = existente
            ? await honorarios.updateStaffCompensations({ id: existente.id, ...datos })
            : await honorarios.createStaffCompensations({ user_id, ...datos });

        const anteriores = await honorarios.listStaffCommissionRules({ user_id });
        if (anteriores.length) await honorarios.deleteStaffCommissionRules(anteriores.map((r: any) => r.id));
        if (esquema.reglas.length) await honorarios.createStaffCommissionRules(esquema.reglas.map((r: any) => ({ ...r, user_id })));

        // El reporte de honorarios médicos lee el porcentaje de `doctor_commission`:
        // se mantiene al día para que las dos vistas no discrepen.
        const [comision] = await honorarios.listDoctorCommissions({ doctor_id: user_id });
        if (comision) {
            await honorarios.updateDoctorCommissions({ id: comision.id, percent: esquema.default_percent, doctor_name: nombre });
        } else if (rol === "doctor") {
            await honorarios.createDoctorCommissions({ doctor_id: user_id, doctor_name: nombre, percent: esquema.default_percent });
        }

        res.json({ esquema: { ...guardado, reglas: await honorarios.listStaffCommissionRules({ user_id }) } });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
}
