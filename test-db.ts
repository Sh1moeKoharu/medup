import { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

export default async function queryJob({ container }: { container: MedusaContainer }) {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const { data } = await query.graph({ entity: "medical_batch", fields: ["*"] });
    console.log(JSON.stringify(data, null, 2));
}
