const { Client } = require('pg');

async function main() {
    const client = new Client({
        connectionString: 'postgres://postgres:diegogarcia25@localhost:5432/medusa_db'
    });
    
    await client.connect();
    
    const res = await client.query(`
        SELECT p.title, v.sku, v.barcode, p.metadata
        FROM product p
        JOIN product_variant v ON v.product_id = p.id
        WHERE p.title LIKE '%GUANTES%' OR p.title LIKE '%VENDA ELASTICA 5CM%'
        ORDER BY p.title;
    `);
    
    console.log("Matching products:");
    for (const row of res.rows) {
        console.log(`- Title: ${row.title} | SKU: ${row.sku} | Barcode: ${row.barcode} | Meta: ${JSON.stringify(row.metadata)}`);
    }
    
    await client.end();
}

main().catch(console.error);
