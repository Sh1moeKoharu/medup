import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

export const GET = async (
    req: MedusaRequest,
    res: MedusaResponse
) => {
    const query = req.scope.resolve("query");

    // Query medical-inventory module items attached to product generic variants
    const { data: medicalInventories } = await query.graph({
        entity: "medical_inventory",
        fields: ["id", "expiration_date", "shelf_location", "product_variant.*"],
        filters: {
            expiration_date: {
                $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // expiring within 30 days
            }
        }
    });

    const formattedItems = medicalInventories.map(inv => ({
        title: inv.product_variant?.title || "Unknown Variant",
        expiration_date: inv.expiration_date,
        shelf_location: inv.shelf_location,
    }));

    res.json({
        items: formattedItems
    });
};
