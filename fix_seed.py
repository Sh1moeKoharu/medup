import sys

with open('src/scripts/seed.ts', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Skip region creation if exists
region_target = """  logger.info("Seeding region data...");
  const { result: regionResult } = await createRegionsWorkflow(container).run({
    input: {
      regions: [
        {
          name: "Europe",
          currency_code: "eur",
          countries,
          payment_providers: ["pp_system_default"],
        },
      ],
    },
  });
  const region = regionResult[0];
  logger.info("Finished seeding regions.");

  logger.info("Seeding tax regions...");
  await createTaxRegionsWorkflow(container).run({
    input: countries.map((country_code) => ({
      country_code,
      provider_id: "tp_system",
    })),
  });
  logger.info("Finished seeding tax regions.");"""

region_replacement = """  logger.info("Seeding region data...");
  const { data: regions } = await query.graph({ entity: "region", fields: ["id"] });
  let region = regions[0];

  if (!region) {
    const { result: regionResult } = await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: "Europe",
            currency_code: "eur",
            countries,
            payment_providers: ["pp_system_default"],
          },
        ],
      },
    });
    region = regionResult[0];
    
    await createTaxRegionsWorkflow(container).run({
      input: countries.map((country_code) => ({
        country_code,
        provider_id: "tp_system",
      })),
    });
  }
  logger.info("Finished seeding regions.");"""

# 2. Skip stock location creation if exists
stock_target = """  logger.info("Seeding stock location data...");
  const { result: stockLocationResult } = await createStockLocationsWorkflow(
    container
  ).run({
    input: {
      locations: [
        {
          name: "European Warehouse",
          address: {
            city: "Copenhagen",
            country_code: "DK",
            address_1: "",
          },
        },
      ],
    },
  });
  const stockLocation = stockLocationResult[0];"""

stock_replacement = """  logger.info("Seeding stock location data...");
  const { data: locations } = await query.graph({ entity: "stock_location", fields: ["id"] });
  let stockLocation = locations[0];

  if (!stockLocation) {
      const { result: stockLocationResult } = await createStockLocationsWorkflow(
        container
      ).run({
        input: {
          locations: [
            {
              name: "European Warehouse",
              address: {
                city: "Copenhagen",
                country_code: "DK",
                address_1: "",
              },
            },
          ],
        },
      });
      stockLocation = stockLocationResult[0];
  }"""

# 3. Skip publishable API key creation
api_target = """  if (!publishableApiKey) {
    const {
      result: [publishableApiKeyResult],
    } = await createApiKeysWorkflow(container).run({
      input: {
        api_keys: [
          {
            title: "Webshop",
            type: "publishable",
            created_by: "",
          },
        ],
      },
    });

    publishableApiKey = publishableApiKeyResult as ApiKey;
  }

  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: {
      id: publishableApiKey.id,
      add: [defaultSalesChannel[0].id],
    },
  });"""

api_replacement = """  if (!publishableApiKey) {
    const {
      result: [publishableApiKeyResult],
    } = await createApiKeysWorkflow(container).run({
      input: {
        api_keys: [
          {
            title: "Webshop",
            type: "publishable",
            created_by: "",
          },
        ],
      },
    });

    publishableApiKey = publishableApiKeyResult as ApiKey;
    
    await linkSalesChannelsToApiKeyWorkflow(container).run({
      input: {
        id: publishableApiKey.id,
        add: [defaultSalesChannel[0].id],
      },
    });
  }
"""

text = text.replace(region_target, region_replacement)
text = text.replace(stock_target, stock_replacement)
text = text.replace(api_target, api_replacement)

# Ignore missing categoryResult (we replaced categories with Collections).
categories_err_fix = text.replace('categoryResult.find', '// categoryResult.find')
text = categories_err_fix

with open('src/scripts/seed.ts', 'w', encoding='utf-8') as f:
    f.write(text)

print("Successfully wrapped seed elements in existence checks")
