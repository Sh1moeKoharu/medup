import sys

with open('src/scripts/seed.ts', 'r', encoding='utf-8') as f:
    text = f.read()

start_str = '  const { result: categoryResult } = await createProductCategoriesWorkflow('
end_str = '  logger.info("Finished seeding product data.");'
start_idx = text.find(start_str)
end_idx = text.find(end_str)

if start_idx == -1 or end_idx == -1:
    print("Could not find replacement block")
    sys.exit(1)

target = text[start_idx:end_idx]

replacement = """  const { result: categoryResult } = await createProductCategoriesWorkflow(
    container
  ).run({
    input: {
      product_categories: [
        { name: "Analgésicos", is_active: true },
        { name: "Antibióticos", is_active: true },
        { name: "Vitaminas", is_active: true },
        { name: "Primeros Auxilios", is_active: true },
      ],
    },
  });

  await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          title: "Paracetamol 500mg",
          category_ids: [categoryResult.find((cat) => cat.name === "Analgésicos")!.id],
          description: "Analgésico y antipirético para el alivio del dolor leve a moderado y la reducción de la fiebre.",
          handle: "paracetamol-500mg",
          weight: 50,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [{ url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-black-front.png" }],
          options: [{ title: "Presentación", values: ["Caja x 20 tabletas", "Blister x 10 tabletas"] }],
          variants: [
            {
              title: "Caja x 20 tabletas", sku: "PARACETAMOL-500-20", options: { Presentación: "Caja x 20 tabletas" },
              prices: [{ amount: 5, currency_code: "eur" }, { amount: 6, currency_code: "usd" }]
            },
            {
              title: "Blister x 10 tabletas", sku: "PARACETAMOL-500-10", options: { Presentación: "Blister x 10 tabletas" },
              prices: [{ amount: 3, currency_code: "eur" }, { amount: 4, currency_code: "usd" }]
            }
          ],
          sales_channels: [{ id: defaultSalesChannel[0].id }]
        },
        {
          title: "Ibuprofeno 400mg",
          category_ids: [categoryResult.find((cat) => cat.name === "Analgésicos")!.id],
          description: "Antiinflamatorio no esteroideo (AINE) utilizado para aliviar el dolor, la inflamación y la fiebre.",
          handle: "ibuprofeno-400mg",
          weight: 50,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [{ url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-white-front.png" }],
          options: [{ title: "Presentación", values: ["Caja x 20 grageas"] }],
          variants: [
            {
              title: "Caja x 20 grageas", sku: "IBUPROFENO-400-20", options: { Presentación: "Caja x 20 grageas" },
              prices: [{ amount: 8, currency_code: "eur" }, { amount: 9, currency_code: "usd" }]
            }
          ],
          sales_channels: [{ id: defaultSalesChannel[0].id }]
        },
        {
          title: "Amoxicilina 500mg",
          category_ids: [categoryResult.find((cat) => cat.name === "Antibióticos")!.id],
          description: "Antibiótico de amplio espectro para el tratamiento de infecciones bacterianas.",
          handle: "amoxicilina-500mg",
          weight: 60,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [{ url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/sweatshirt-vintage-front.png" }],
          options: [{ title: "Presentación", values: ["Caja x 12 cápsulas"] }],
          variants: [
            {
              title: "Caja x 12 cápsulas", sku: "AMOXICILINA-500-12", options: { Presentación: "Caja x 12 cápsulas" },
              prices: [{ amount: 12, currency_code: "eur" }, { amount: 14, currency_code: "usd" }]
            }
          ],
          sales_channels: [{ id: defaultSalesChannel[0].id }]
        },
        {
          title: "Vitamina C 1000mg",
          category_ids: [categoryResult.find((cat) => cat.name === "Vitaminas")!.id],
          description: "Suplemento vitamínico que ayuda a fortalecer el sistema inmunológico.",
          handle: "vitamina-c-1000mg",
          weight: 100,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [{ url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/sweatpants-gray-front.png" }],
          options: [{ title: "Presentación", values: ["Tubo x 10 tabletas efervescentes"] }],
          variants: [
            {
              title: "Tubo x 10 tabletas efervescentes", sku: "VITAMINA-C-1000-10", options: { Presentación: "Tubo x 10 tabletas efervescentes" },
              prices: [{ amount: 6, currency_code: "eur" }, { amount: 7, currency_code: "usd" }]
            }
          ],
          sales_channels: [{ id: defaultSalesChannel[0].id }]
        },
        {
          title: "Alcohol Gel 70%",
          category_ids: [categoryResult.find((cat) => cat.name === "Primeros Auxilios")!.id],
          description: "Desinfectante de manos para eliminar bacterias y virus.",
          handle: "alcohol-gel-70",
          weight: 250,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [{ url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/shorts-vintage-front.png" }],
          options: [{ title: "Presentación", values: ["Frasco 250ml", "Frasco 500ml"] }],
          variants: [
            {
              title: "Frasco 250ml", sku: "ALCOHOL-GEL-250", options: { Presentación: "Frasco 250ml" },
              prices: [{ amount: 4, currency_code: "eur" }, { amount: 5, currency_code: "usd" }]
            },
            {
              title: "Frasco 500ml", sku: "ALCOHOL-GEL-500", options: { Presentación: "Frasco 500ml" },
              prices: [{ amount: 7, currency_code: "eur" }, { amount: 8, currency_code: "usd" }]
            }
          ],
          sales_channels: [{ id: defaultSalesChannel[0].id }]
        }
      ],
    },
  });\n"""

with open('src/scripts/seed.ts', 'w', encoding='utf-8') as f:
    f.write(text.replace(target, replacement))

print("Successfully replaced products in seed.ts")
