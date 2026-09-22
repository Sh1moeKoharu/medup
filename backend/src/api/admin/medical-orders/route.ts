import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ROLES, isMedicalOrderCreatorRole } from "../../../lib/roles";
import { fechaDeAtencion, revisarNota } from "../../../lib/notas-clinicas";
import { escribirNota } from "../../../lib/notas-clinicas-servidor";
import { revisarRenglonesDeReceta } from "../../../lib/receta";
import { existenciasPorArea, renglonesSinExistencia } from "../../../lib/existencias-por-area";
import { resolveRequestActor } from "../../../lib/require-role";
import { MEDICAL_ORDERS_MODULE } from "../../../modules/medical-orders";
import MedicalOrdersModuleService from "../../../modules/medical-orders/service";

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const medicalOrdersModuleService: MedicalOrdersModuleService = req.scope.resolve(MEDICAL_ORDERS_MODULE);
        
        // Obtenemos los filtros de la query (ej. status=pending, o customer_id=123)
        const filters: any = {};
        if (req.query.status) filters.status = req.query.status;
        if (req.query.customer_id) filters.customer_id = req.query.customer_id;
        if (req.query.creator_id) filters.creator_id = req.query.creator_id;
        if (req.query.recipient_area) filters.recipient_area = req.query.recipient_area;

        const orders = await medicalOrdersModuleService.listMedicalOrders(filters, {
            relations: ["items"],
            order: { created_at: "DESC" },
        });

        // Los ajustes con su motivo viajan con cada orden: la bandeja, «Mis
        // recetas» y el panel enseñan quién quitó qué y por qué.
        const ids = orders.map((o: any) => o.id);
        const ajustes = ids.length
            ? await medicalOrdersModuleService.listMedicalOrderAdjustments({ order_id: ids }, { order: { created_at: "ASC" } })
            : [];
        const porOrden = new Map<string, any[]>();
        for (const a of ajustes) porOrden.set(a.order_id, [...(porOrden.get(a.order_id) ?? []), a]);

        res.json({ medical_orders: orders.map((o: any) => ({ ...o, ajustes: porOrden.get(o.id) ?? [] })) });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const medicalOrdersModuleService: MedicalOrdersModuleService = req.scope.resolve(MEDICAL_ORDERS_MODULE);
        
        // Sólo se toman del cuerpo los datos del PACIENTE y de la receta.
        // La identidad de quien prescribe NO se acepta del cliente (ver abajo).
        const { customer_id, customer_name, notes, items, recipient_area, nota_de_atencion } = req.body as any;

        // A quién va: Enfermería (consulta) por omisión, o Farmacia (mostrador).
        // Decide la bandeja y el almacén; ver el modelo.
        const destinatario = recipient_area ?? "nursing";
        if (destinatario !== "nursing" && destinatario !== "pharmacy") {
            return res.status(400).json({
                error: `Destinatario inválido: "${recipient_area}". Válidos: nursing (Enfermería), pharmacy (Farmacia).`,
            });
        }

        /**
         * IDENTIDAD DEL PRESCRIPTOR — SIEMPRE DESDE LA SESIÓN.
         *
         * Antes esto era `creator_id: creator_id || "unknown"`, tomado del
         * cuerpo de la petición. Es decir: cualquier usuario autenticado podía
         * emitir una receta atribuyéndosela a otro médico, y una orden sin ese
         * campo quedaba firmada como "unknown". Para un registro de receta
         * electrónica eso lo invalida, y contradice el no repudio que exige la
         * NOM-024-SSA3-2012 §6.6.1.
         *
         * Si el cuerpo trae `creator_*`, se ignora deliberadamente.
         */
        const actor = await resolveRequestActor(req);

        if (!actor) {
            return res.status(401).json({
                error: "No se pudo identificar al prescriptor. Una orden médica no puede emitirse de forma anónima.",
            });
        }

        // `medical_order.creator_role` tiene un check-constraint en BD limitado a
        // ('doctor','nurse','admin'). Se valida contra el rol REAL del usuario.
        if (!isMedicalOrderCreatorRole(actor.role)) {
            return res.status(403).json({
                error: `Tu rol (${actor.role ?? "sin rol"}) no puede emitir órdenes médicas.`,
            });
        }

        if (!customer_id || !items || !Array.isArray(items) || !items.length) {
            return res.status(400).json({ error: "La receta necesita paciente y al menos un medicamento." });
        }

        const esMedico = actor.role === ROLES.DOCTOR;

        // El médico siempre envía a Enfermería (lo pidió la clínica): Farmacia
        // surte lo que pide Enfermería por requisición, no recetas del médico.
        if (esMedico && destinatario !== "nursing") {
            return res.status(400).json({ error: "El médico envía sus recetas a Enfermería." });
        }

        // Ningún medicamento recetado por el médico va sin indicaciones.
        const problemaRenglones = revisarRenglonesDeReceta(items, { exigirIndicaciones: esMedico });
        if (problemaRenglones) {
            return res.status(400).json({ error: problemaRenglones });
        }

        // Sólo se receta lo que hay (punto 19): entre Enfermería y Farmacia, porque
        // lo que falte en Enfermería se le pide a Farmacia. Al aplicar se vuelve a
        // comprobar: la existencia puede cambiar entre recetar y aplicar.
        if (esMedico) {
            const existencias = await existenciasPorArea(req.scope as any, items.map((i: any) => i.variant_id));
            const faltan = renglonesSinExistencia(items, existencias);
            if (faltan.length) {
                return res.status(409).json({
                    type: "sin_existencia",
                    error: faltan
                        .map((f) => `${f.product_title ?? "Un medicamento"}: se recetan ${f.solicitado} y hay ${f.disponible} entre Enfermería y Farmacia`)
                        .join(". ") + ".",
                    detalle: faltan,
                });
            }
        }

        // La nota de atención de la consulta, si viene, se revisa ANTES de crear
        // nada: una receta sin su nota a medias es peor que un error claro.
        if (nota_de_atencion) {
            const problemaNota = revisarNota({ findings: nota_de_atencion.findings, procedures: nota_de_atencion.procedures });
            const problemaFecha = fechaDeAtencion(nota_de_atencion.attended_at).error;
            if (problemaNota || problemaFecha) {
                return res.status(400).json({ error: problemaNota ?? problemaFecha });
            }
        }

        // Crear la orden
        const order = await medicalOrdersModuleService.createMedicalOrders({
            status: "pending",
            customer_id,
            customer_name,
            notes,
            creator_id: actor.id,
            creator_name: actor.name,
            creator_role: actor.role,
            recipient_area: destinatario,
        } as any);

        // Crear items
        const itemCreates = items.map(item => ({
            order_id: order.id,
            variant_id: item.variant_id,
            product_title: item.product_title,
            quantity: Number(item.quantity),
            instructions: typeof item.instructions === "string" ? item.instructions.trim() || null : null,
        }));

        await medicalOrdersModuleService.createMedicalOrderItems(itemCreates);

        let notaCreada = null;
        if (nota_de_atencion) {
            const { nota, error } = await escribirNota(req.scope as any, actor, {
                customer_id,
                medical_order_id: order.id,
                findings: nota_de_atencion.findings,
                procedures: nota_de_atencion.procedures,
                attended_at: nota_de_atencion.attended_at,
            });
            if (error) {
                // Ya validada arriba: si falla aquí es la base. La receta existe.
                return res.status(500).json({ error: `La receta se emitió, pero la nota de atención no se guardó: ${error}` });
            }
            notaCreada = nota;
        }

        // Fetch de la orden completa
        const completeOrder = await medicalOrdersModuleService.retrieveMedicalOrder(order.id, {
            relations: ["items"]
        });

        res.json({ medical_order: completeOrder, clinical_note: notaCreada });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
