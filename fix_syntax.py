import re

with open('src/scripts/seed.ts', 'r', encoding='utf-8') as f:
    text = f.read()

# Replace all occurrences of `category_ids: [// categoryResult.find...]` with `category_ids: [],`
text = re.sub(r'category_ids:\s*\[// categoryResult\.find[^\]]*\],', 'category_ids: [],', text)

with open('src/scripts/seed.ts', 'w', encoding='utf-8') as f:
    f.write(text)

print("Syntax fixed")
