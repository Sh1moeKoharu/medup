import sys

with open('src/scripts/seed.ts', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Add createCollectionsWorkflow import
if 'createCollectionsWorkflow' not in text:
    text = text.replace('  createProductCategoriesWorkflow,', '  createCollectionsWorkflow,\n  createProductCategoriesWorkflow,')

# 2. Add collection creation logic
collection_creation = """
  logger.info("Seeding collections (Regulaciones)...");
  const { result: collectionResult } = await createCollectionsWorkflow(container).run({
    input: {
      collections: [
        { title: "Libre Venta", handle: "libre-venta" },
        { title: "Restringido", handle: "restringido" }
      ]
    }
  });
"""

if 'Seeding collections (Regulaciones)' not in text:
    target_pos = text.find('const { result: categoryResult }')
    text = text[:target_pos] + collection_creation + '\n  ' + text[target_pos:]

# 3. Add collection_id to products
def add_collection_id(product_title, collection_name):
    global text
    idx = text.find(f'title: "{product_title}"')
    if idx != -1:
        insert_idx = text.find('category_ids:', idx)
        if insert_idx != -1:
             insertion = f'collection_id: collectionResult.find((c) => c.title === "{collection_name}")!.id,\n          '
             text = text[:insert_idx] + insertion + text[insert_idx:]

add_collection_id("Paracetamol 500mg", "Libre Venta")
add_collection_id("Ibuprofeno 400mg", "Libre Venta")
add_collection_id("Amoxicilina 500mg", "Restringido")
add_collection_id("Vitamina C 1000mg", "Libre Venta")
add_collection_id("Alcohol Gel 70%", "Libre Venta")

with open('src/scripts/seed.ts', 'w', encoding='utf-8') as f:
    f.write(text)

print("Successfully injected collections into seed.ts")
