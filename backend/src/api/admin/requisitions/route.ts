import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { REQUISITIONS_MODULE } from "../../../modules/requisitions";
import RequisitionsModuleService from "../../../modules/requisitions/service";
import { resolveRequestActor } from "../../../lib/require-role";
import { ROLES } from "../../../lib/roles";
import { almacenDeEnfermeria, almacenDeFarmacia, nombresDeAlmacenes } from "../../../lib/almacenes";
import { fetchVariantLabels } from "../../../lib/variant-titles";

/**
 * Requisiciones: Enfermería pide medicamento a Farmacia.
 *
 *   GET  /admin/requisitions?status=&requested_by_id=&destination_location_id=
 *   POST /admin/requisitions  { items: [{ variant_id, quantity, product_title? }], notes? }
 *
 * El origen y el destino no se aceptan del cuerpo: una requisición va SIEMPRE
 * de Farmacia a Enfermería. Quien la pide se toma de la sesión, igual que el
 * prescriptor de una orden médica (ver medical-orders/route.ts).
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const service: RequisitionsModuleService = req.scope.resolve(REQUISITIONS_MODULE);

        const filters: any = {};
        const { status, requested_by_id, destination_location_id, source_location_id, medical_order_id } = req.query as Record<string, string>;
        if (medical_order_id) filters.medical_order_id = medical_order_id.includes(",") ? medical_order_id.split(",") : medical_order_id;
        if (status) filters.status = status.includes(",") ? status.split(",") : status;
        if (requested_by_id) filters.requested_by_id = requested_by_id;
        if (destination_location_id) filters.destination_location_id = destination_location_id;
        if (source_location_id) filters.source_location_id = source_location_id;

        const requisiciones = await service.listRequisitions(filters, {
            relations: ["items"],
            order: { created_at: "DESC" },
            take: 500,
        });

        const nombres = await nombresDeAlmacenes(req.scope as any);
        const filas = requisiciones.map((r: any) => ({
            ...r,
            source_location_name: nombres.get(r.source_location_id) ?? null,
            destination_location_name: nombres.get(r.destination_location_id) ?? null,
        }));

        res.json({ requisitions: filas, count: filas.length });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const service: RequisitionsModuleService = req.scope.resolve(REQUISITIONS_MODULE);
        const { items, notes, medical_order_id } = (req.body ?? {}) as any;

        const actor = await resolveRequestActor(req);
        if (!actor) {
            return res.status(401).json({ error: "No se pudo identificar a quien pide. Vuelve a iniciar sesión." });
        }
        if (actor.role !== ROLES.NURSE && actor.role !== ROLES.ADMIN) {
            return res.status(403).json({ error: "Las requisiciones las pide Enfermería." });
        }

        if (!Array.isArray(items) || !items.length) {
            return res.status(400).json({ error: "La requisición necesita al menos un renglón." });
        }

        const renglones: { variant_id: string; quantity: number; product_title?: string }[] = [];
        for (const it of items) {
            const cantidad = Number(it?.quantity);
            if (!it?.variant_id || !Number.isInteger(cantidad) || cantidad <= 0) {
                return res.status(400).json({
                    error: `Cada renglón necesita presentación y una cantidad entera mayor que 0 (recibido: ${JSON.stringify(it)}).`,
                });
            }
            if (renglones.some((r) => r.variant_id === it.variant_id)) {
                return res.status(400).json({ error: "Una presentación viene repetida; súmala en un solo renglón." });
            }
            renglones.push({ variant_id: it.variant_id, quantity: cantidad, product_title: it.product_title });
        }

        const [farmacia, enfermeria] = await Promise.all([
            almacenDeFarmacia(req.scope as any),
            almacenDeEnfermeria(req.scope as any),
        ]);
        if (!farmacia || !enfermeria) {
            return res.status(500).json({
                error: "Faltan los almacenes de Farmacia o Enfermería. Ejecuta preparar-almacenes.ts.",
            });
        }

        // Nombre de cada presentación, para que el renglón se lea solo.
        const etiquetas = await fetchVariantLabels(req.scope, renglones.map((r) => r.variant_id));

        const requisicion = await service.createRequisitions({
            status: "pending",
            source_location_id: farmacia.id,
            destination_location_id: enfermeria.id,
            requested_by_id: actor.id,
            requested_by_name: actor.name,
            notes: notes ?? null,
            // Pedida desde la bandeja para cubrir una orden: queda ligada a ella.
            medical_order_id: typeof medical_order_id === "string" && medical_order_id ? medical_order_id : null,
        });

        await service.createRequisitionItems(
            renglones.map((r) => ({
                requisition_id: requisicion.id,
                variant_id: r.variant_id,
                product_title: r.product_title ?? etiquetas.get(r.variant_id)?.label ?? null,
                quantity_requested: r.quantity,
                quantity_dispatched: 0,
            }))
        );

        const completa = await service.retrieveRequisition(requisicion.id, { relations: ["items"] });

        res.json({
            requisition: {
                ...completa,
                source_location_name: farmacia.name,
                destination_location_name: enfermeria.name,
            },
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
