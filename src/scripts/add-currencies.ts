import { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { updateStoresStep } from "@medusajs/medusa/core-flows";

const updateStoreCurrencies = createWorkflow(
  "update-store-currencies",
  (input: {
    supported_currencies: { currency_code: string; is_default?: boolean }[];
    store_id: string;
  }) => {
    const normalizedInput = transform({ input }, (data) => {
      return {
        selector: { id: data.input.store_id },
        update: {
          supported_currencies: data.input.supported_currencies.map(
            (currency) => {
              return {
                currency_code: currency.currency_code,
                is_default: currency.is_default ?? false,
              };
            }
          ),
        },
      };
    });

    const stores = updateStoresStep(normalizedInput);

    return new WorkflowResponse(stores);
  }
);

export default async function addCurrencies({ container }: ExecArgs) {
  const storeModuleService = container.resolve(Modules.STORE);
  const [store] = await storeModuleService.listStores();

  if (!store) {
    console.error("No se encontró la tienda. ¿Ya corriste las migraciones y el seed inicial?");
    return;
  }

  await updateStoreCurrencies(container).run({
    input: {
      store_id: store.id,
      supported_currencies: [
        { currency_code: "mxn", is_default: true },
        { currency_code: "usd" },
        { currency_code: "eur" }
      ],
    },
  });
  
  console.log("✅ Monedas agregadas exitosamente: MXN (default), USD, EUR.");
}
