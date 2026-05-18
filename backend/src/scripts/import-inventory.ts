import { MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { createProductsWorkflow } from "@medusajs/core-flows";
import * as fs from "fs";

export default async function importInventory({ container }: { container: MedusaContainer }) {
    const logger = container.resolve("logger");
    const productModuleService = container.resolve(Modules.PRODUCT);
    const medicalInventoryService = container.resolve("medical_inventory");

    const filePath = "C:\\Users\\diego garcía\\Downloads\\ALMACEN-INVENTARIO-ABRIL-2026.csv";
    
    if (!fs.existsSync(filePath)) {
        logger.error(`File not found: ${filePath}`);
        return;
    }

    const fileContent = fs.readFileSync(filePath, "utf-8");
    const lines = fileContent.split(/\r?\n/).filter(line => line.trim().length > 0);
    
    let startIndex = 0;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("MEDICAMENTO") && lines[i].includes("LABORATORIO")) {
            startIndex = i + 1;
            break;
        }
    }

    logger.info(`Starting import from line ${startIndex}...`);

    // Fetch all existing products
    const existingProducts = await productModuleService.listProducts({});
    const productsMap = new Map();
    for (const p of existingProducts) {
        productsMap.set(p.title.toLowerCase().trim(), p);
    }

    let createdProducts = 0;
    let createdBatches = 0;

    for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i];
        
        // Very simple CSV parsing that handles basic quoted fields
        const row = line.split('","').map(c => c.replace(/^"|"$/g, ''));
        
        // Also handle the case where the whole line isn't perfectly comma-quote separated, fallback to split(',')
        let cols = row.length > 1 ? row : line.split(',').map(c => c.replace(/^"|"$/g, ''));

        const medicamento = cols[0]?.trim();
        const laboratorio = cols[1]?.trim();
        const lote = cols[2]?.trim();
        const caducidadStr = cols[3]?.trim();
        const factura = cols[4]?.trim();
        const existencia = parseInt(cols[5]?.trim() || "0");
        
        // Skip empty or purely header/summary rows like "TOTAL", "", "0"
        if (!medicamento || medicamento === 'TOTAL' || medicamento === '0' || medicamento === '') continue;

        let product = productsMap.get(medicamento.toLowerCase());
        
        if (!product) {
            logger.info(`Creating new product: ${medicamento}`);
            try {
                const { result } = await createProductsWorkflow(container).run({
                    input: {
                        products: [
                            {
                                title: medicamento,
                                options: [{ title: "Default Option", values: ["Default"] }],
                                variants: [
                                    {
                                        title: "Default Variant",
                                        options: { "Default Option": "Default" },
                                        manage_inventory: true
                                    }
                                ],
                                metadata: {
                                    proveedor: laboratorio,
                                    nombre_comercial: medicamento,
                                    factura_compra: factura,
                                    is_pharmaceutical: true,
                                }
                            }
                        ]
                    }
                });
                
                product = result[0];
                productsMap.set(medicamento.toLowerCase(), product);
                createdProducts++;
            } catch (e) {
                logger.error(`Error creating product ${medicamento}: ${e}`);
                continue;
            }
        }
        
        if (lote && product) {
            try {
                // Fetch variant to ensure we have the variant_id
                const variants = await productModuleService.listProductVariants({
                    product_id: product.id
                });
                
                if (!variants || variants.length === 0) continue;
                const variantId = variants[0].id;

                let caducidadDate = new Date();
                if (caducidadStr) {
                   let parts = caducidadStr.split('/');
                   if (parts.length === 2) {
                       caducidadDate = new Date(`20${parts[1]}-${parts[0]}-01`);
                   } else {
                       caducidadDate = new Date(caducidadStr);
                   }
                   if (isNaN(caducidadDate.getTime())) {
                       caducidadDate = new Date();
                   }
                }

                await medicalInventoryService.createMedicalBatches({
                    batch_number: lote,
                    expiration_date: caducidadDate,
                    quantity: existencia,
                    variant_id: variantId
                });
                createdBatches++;
                logger.info(`Created batch ${lote} for ${medicamento}`);
            } catch (e) {
                logger.error(`Error creating batch ${lote} for ${medicamento}: ${e}`);
            }
        }
    }
    
    logger.info(`Import completed! Created ${createdProducts} products and ${createdBatches} batches.`);
}
