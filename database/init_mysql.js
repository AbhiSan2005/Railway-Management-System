require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function executeSchema(connection, schemaSql) {
    const parts = schemaSql.split(/DELIMITER\s+\$\$/i);
    const ddlPart = parts[0];
    await connection.query(ddlPart);

    for (let i = 1; i < parts.length; i++) {
        let block = parts[i];
        block = block.replace(/DELIMITER\s*;/i, '');
        const statements = block.split(/\$\$/).map(s => s.trim()).filter(s => s.length > 0);
        for (const stmt of statements) {
            try {
                await connection.query(stmt);
            } catch (err) {
                // Ignore warning on drop if not exists
            }
        }
    }
}

async function setupMySQL() {
    console.log('========================================================');
    console.log('INITIALIZING LIVE MYSQL DATABASE: rms_db');
    console.log('========================================================\n');

    const config = {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        port: parseInt(process.env.DB_PORT || '3306'),
        multipleStatements: true
    };

    console.log(`Connecting to MySQL on ${config.host}:${config.port} as '${config.user}'...`);

    let connection;
    try {
        connection = await mysql.createConnection(config);
        console.log('MySQL server connection established successfully.\n');
    } catch (err) {
        console.error('Connection failed:', err.message);
        console.error('\nPlease verify your credentials in .env:');
        console.error('1. DB_PASSWORD: Set your MySQL root password');
        console.error('2. Make sure the MySQL80 service is running.\n');
        process.exit(1);
    }

    try {
        // 1. Execute schema.sql
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        console.log('Executing database/schema.sql (Creating tables, views, triggers & procedures)...');
        await executeSchema(connection, schemaSql);
        console.log('Schema created and normalized to 3NF/BCNF.\n');

        // 2. Execute seed_data.sql
        const seedPath = path.join(__dirname, 'seed_data.sql');
        const seedSql = fs.readFileSync(seedPath, 'utf8');
        console.log('Executing database/seed_data.sql (Populating sample stations, trains, coaches, passengers)...');
        await connection.query(seedSql);
        console.log('Sample seed data inserted successfully.\n');

        console.log('========================================================');
        console.log('DATABASE SETUP COMPLETE! You can now start the server:');
        console.log('   npm start');
        console.log('========================================================');
    } catch (err) {
        console.error('Error executing SQL scripts:', err.message);
    } finally {
        if (connection) await connection.end();
    }
}

setupMySQL();
