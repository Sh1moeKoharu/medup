import { defineLink } from "@medusajs/framework/utils";
import ProductModule from "@medusajs/medusa/product";
import MedicalInventoryModule from "../modules/medical-inventory";

export default defineLink(
    ProductModule.linkable.productVariant,
    {
        linkable: MedicalInventoryModule.linkable.medicalBatch,
        isList: true
    }
);
