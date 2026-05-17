import { MedusaContainer } from "@medusajs/framework/types";
import blockExpiredBatchesJob from "../jobs/block-expired-batches";

export default async function run({ container }: { container: MedusaContainer }) {
    console.log("Starting manual execution of block-expired-batches job...");
    try {
        await blockExpiredBatchesJob(container);
        console.log("Finished manual execution of block-expired-batches job.");
    } catch (e) {
        console.error("Error executing job:", e);
    }
}
