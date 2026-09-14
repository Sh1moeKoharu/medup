import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MEDICAL_INVENTORY_MODULE } from "../../../modules/medical-inventory";
import { estadoDePoliticas } from "../../../lib/existencias";
import { resolverAlmacen } from "../../../lib/almacenes";

/**
 * Mínimos y máximos por presentación y almacén.
 *
 *   GET  /admin/stock-policies?stock_location_id=&variant_id=&only_below=1
 *        Cada política con su existencia actual y si está bajo mínimo.
 *   POST /admin/stock-policies  { variant_id, stock_location_id, min_quantity, max_quantity }
 *        Crea o actualiza la política de esa presentación en ese almacén.
 *
 * Borrar: DELETE /admin/stock-policies/:id.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
    try {
        const { stock_location_id, variant_id, only_below } = req.query as Record<string, string>;

        let items = await estadoDePoliticas(req.scope as any, { stock_location_id, variant_id });
        if (only_below === "1" || only_below === "true") {
            items = items.filter((i) => i.below_min);
        }

        res.json({
            stock_policies: items,
            count: items.length,
            below_min: items.filter((i) => i.below_min).length,
        });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
    try {
        const { variant_id, stock_location_id, min_quantity, max_quantity } = (req.body ?? {}) as any;

        if (!variant_id) {
            return res.status(400).json({ message: "Falta la presentación (variant_id)." });
        }

        const { almacen, error } = await resolverAlmacen(req.scope as any, stock_location_id);
        if (!almacen) {
            return res.status(400).json({ message: error });
        }

        const min = min_quantity === undefined || min_quantity === null || min_quantity === "" ? 0 : Number(min_quantity);
        if (!Number.isInteger(min) || min < 0) {
            return res.status(400).json({ message: `El mínimo debe ser un entero mayor o igual a 0 (recibido: ${min_quantity}).` });
        }

        let max: number | null = null;
        if (max_quantity !== undefined && max_quantity !== null && max_quantity !== "") {
            max = Number(max_quantity);
            if (!Number.isInteger(max) || max < 0) {
                return res.status(400).json({ message: `El máximo debe ser un entero mayor o igual a 0 (recibido: ${max_quantity}).` });
            }
            if (max < min) {
                return res.status(400).json({ message: `El máximo (${max}) no puede ser menor que el mínimo (${min}).` });
            }
        }

        const service: any = req.scope.resolve(MEDICAL_INVENTORY_MODULE);
        const [existente] = await service.listStockPolicies({ variant_id, stock_location_id: almacen.id });

        const politica = existente
            ? await service.updateStockPolicies({ id: existente.id, min_quantity: min, max_quantity: max })
            : await service.createStockPolicies({ variant_id, stock_location_id: almacen.id, min_quantity: min, max_quantity: max });

        const [estado] = await estadoDePoliticas(req.scope as any, { variant_id, stock_location_id: almacen.id });

        res.json({ stock_policy: estado ?? politica, created: !existente });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
}
