import {
    IRegionModuleService,
    ISalesChannelModuleService,
    ITaxModuleService,
} from "@medusajs/types"
import {
    Modules,
} from "@medusajs/utils"
import { ExecArgs } from "@medusajs/framework/types"
import * as fs from "fs"

export default async function listData({ container }: ExecArgs) {
    const regionModuleService: IRegionModuleService = container.resolve(
        Modules.REGION
    )
    const salesChannelModuleService: ISalesChannelModuleService = container.resolve(
        Modules.SALES_CHANNEL
    )
    const taxModuleService: ITaxModuleService = container.resolve(
        Modules.TAX
    )

    const regions = await regionModuleService.listRegions()
    let output = "--- REGIONS ---\n"
    regions.forEach(r => {
        output += `${r.id}: ${r.name} (${r.currency_code})\n`
    })

    const salesChannels = await salesChannelModuleService.listSalesChannels()
    output += "\n--- SALES CHANNELS ---\n"
    salesChannels.forEach(sc => {
        output += `${sc.id}: ${sc.name}\n`
    })

    const taxRates = await taxModuleService.listTaxRates()
    output += "\n--- TAX RATES ---\n"
    taxRates.forEach(tr => {
        output += `${tr.id}: ${tr.name} (${tr.rate}%)\n`
    })

    fs.writeFileSync("output_data.txt", output)
    console.log("Data written to output_data.txt")
}
