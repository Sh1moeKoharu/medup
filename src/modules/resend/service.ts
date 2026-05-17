import { AbstractNotificationProviderService } from "@medusajs/framework/utils"
import { ProviderSendNotificationDTO, ProviderSendNotificationResultsDTO } from "@medusajs/types"
import { Resend } from "resend"

type ResendOptions = {
    api_key: string
    from: string
}

export default class ResendNotificationProviderService extends AbstractNotificationProviderService {
    static identifier = "resend"
    protected resendClient: Resend
    protected options: ResendOptions

    constructor(_, options: ResendOptions) {
        super()
        this.options = options
        this.resendClient = new Resend(options.api_key)
    }

    async send(
        notification: ProviderSendNotificationDTO
    ): Promise<ProviderSendNotificationResultsDTO> {
        try {
            const response = await this.resendClient.emails.send({
                from: this.options.from,
                to: notification.to,
                subject: (notification.data?.subject as string) || "Order Update",
                html: (notification.data?.html as string) || "You have a new update for your order.",
            })

            return {
                id: response.data?.id,
            }
        } catch (error) {
            console.error("Failed to send email via Resend:", error)
            throw error
        }
    }
}
