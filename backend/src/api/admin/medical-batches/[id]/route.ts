import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { LARGO_MINIMO_MOTIVO, limpiarMotivo } from "../../../../lib/ajustes-de-orden";
import { resolveRequestActor } from "../../../../lib/require-role";
import { ROLES } from "../../../../lib/roles";

/**
 * POST /admin/medical-batches/:id { batch_number?, expiration_date?, shelf_location?, motivo }
 *
 * Corregir los DATOS de un lote: el número que se capturó mal, la caducidad
 * que se leyó mal de la caja, el estante donde está. La cantidad NO se corrige
 * aquí: eso es un conteo (inventory-counts) o una baja (write-off), que dejan
 * movimiento en el kardex.
 *
 * Cambiar la caducidad cambia el orden FEFO, así que exige motivo (queda en la
 * bitácora, donde el motivo no se redacta) y sólo lo hacen Almacén y
 * Administración.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
    try {
        const { id } = req.params;
        const { batch_number, expiration_date, shelf_location, motivo } = (req.body ?? {}) as any;

        const actor = await resolveRequestActor(req);
        if (!actor) {
            return res.status(401).json({ message: "Vuelve a iniciar sesión." });
        }
        if (actor.role !== ROLES.ADMIN && actor.role !== ROLES.WAREHOUSE) {
            return res.status(403).json({ message: "Los datos de un lote los corrigen Almacén y Administración." });
        }
        const razon = limpiarMotivo(motivo);
        if (razon.length < LARGO_MINIMO_MOTIVO) {
            return res.status(400).json({ message: `Escribe por qué se corrige el lote (al menos ${LARGO_MINIMO_MOTIVO} caracteres).` });
        }

        const inventario: any = req.scope.resolve("medical_inventory");
        const [batch] = await inventario.listMedicalBatches({ id });
        if (!batch) {
            return res.status(404).json({ message: "Lote no encontrado." });
        }
        if (batch.status === "destroyed") {
            return res.status(400).json({ message: "Un lote destruido ya no se corrige." });
        }

        const cambios: Record<string, { antes: unknown; despues: unknown }> = {};
        const datos: Record<string, unknown> = { id };

        if (batch_number !== undefined) {
            const n = String(batch_number).trim();
            if (!n) return res.status(400).json({ message: "El número de lote no puede quedar vacío." });
            if (n !== batch.batch_number) {
                cambios.batch_number = { antes: batch.batch_number, despues: n };
                datos.batch_number = n;
            }
        }
        if (expiration_date !== undefined) {
            const d = /^\d{4}-\d{2}-\d{2}$/.test(String(expiration_date)) ? new Date(`${expiration_date}T12:00:00Z`) : new Date(expiration_date);
            if (Number.isNaN(d.getTime())) return res.status(400).json({ message: "La caducidad debe ir como 2027-03-31." });
            const antes = new Date(batch.expiration_date);
            if (d.toISOString().slice(0, 10) !== antes.toISOString().slice(0, 10)) {
                cambios.expiration_date = { antes: antes.toISOString().slice(0, 10), despues: d.toISOString().slice(0, 10) };
                datos.expiration_date = d;
            }
        }
        if (shelf_location !== undefined) {
            const e = String(shelf_location ?? "").trim() || null;
            if (e !== (batch.shelf_location ?? null)) {
                cambios.shelf_location = { antes: batch.shelf_location ?? null, despues: e };
                datos.shelf_location = e;
            }
        }

        if (!Object.keys(cambios).length) {
            return res.status(400).json({ message: "No hay nada que cambiar: los datos son los mismos." });
        }

        const actualizado = await inventario.updateMedicalBatches(datos);
        res.json({ batch: actualizado, cambios, motivo: razon, corregido_por: actor.name });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
}
