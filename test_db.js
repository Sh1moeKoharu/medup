const { Client } = require('pg');
const client = new Client({
    connectionString: 'postgres://postgres:diegogarcia25@localhost:5432/postgres',
});
client.connect()
    .then(() => {
        console.log('Successfully connected to postgres!');
        client.end();
    })
    .catch((err) => {
        console.error('Connection error', err.stack);
        client.end();
    });
