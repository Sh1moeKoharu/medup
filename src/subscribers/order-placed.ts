import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"

export default async function orderPlacedHandler({
    event: { data },
    container,
}: SubscriberArgs<{ id: string }>) {
    const notificationModuleService = container.resolve(Modules.NOTIFICATION)

    // We mock fetching the customer email here for simplicity
    const customerEmail = "test@example.com" // You would normally fetch the order and its email here

    console.log(`Sending order confirmation email for Order ID: ${data.id}`)

    await notificationModuleService.createNotifications({
        to: customerEmail,
        channel: "email",
        template: "order-confirmation",
        data: {
            subject: `Your order ${data.id} has been placed!`,
            html: `
        <h1>Thank you for your purchase!</h1>
        <p>Your receipt for order <strong>${data.id}</strong> has been confirmed at the POS terminal.</p>
        <p><br/>Powered by AGILO POS & MedusaJS</p>
      `,
        },
    })
}

export const config: SubscriberConfig = {
    event: "order.placed",
}
