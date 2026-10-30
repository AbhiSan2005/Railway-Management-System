require('dotenv').config();
const mysql = require('mysql2/promise');
const db = require('./db');

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
    const dbName = process.env.DB_NAME || 'rms_db';
    if (!/^[A-Za-z0-9_]+$/.test(dbName)) {
        throw new Error('DB_NAME may contain only letters, numbers, and underscores.');
    }
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
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        await connection.changeUser({ database: dbName });
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
        const [existingTables] = await connection.query(`SHOW TABLES LIKE 'stations'`);
        if (existingTables.length) {
            await db.migrateLegacySchema(connection, dbName);
        }
        const schemaSql = db.loadDatabaseScript('schema.sql', dbName);
        console.log('Executing database/schema.sql (Creating tables, views, triggers & procedures)...');
        await executeSchema(connection, schemaSql);
        console.log('Schema created and normalized to 3NF/BCNF.\n');

        const [ticketColumns] = await connection.query(
            `SELECT COLUMN_NAME FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tickets'
               AND COLUMN_NAME IN ('start_sequence', 'end_sequence')`
            , [dbName]
        );
        const existingTicketColumns = new Set(ticketColumns.map(column => column.COLUMN_NAME));
        if (!existingTicketColumns.has('start_sequence')) {
            await connection.query('ALTER TABLE tickets ADD COLUMN start_sequence INT NOT NULL DEFAULT 1');
        }
        if (!existingTicketColumns.has('end_sequence')) {
            await connection.query('ALTER TABLE tickets ADD COLUMN end_sequence INT NOT NULL DEFAULT 9999');
        }
        const [segmentIndexes] = await connection.query(
            `SELECT INDEX_NAME FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tickets'
               AND INDEX_NAME = 'idx_ticket_seat_journey_segments'`,
            [dbName]
        );
        if (!segmentIndexes.length) {
            await connection.query(
                `CREATE INDEX idx_ticket_seat_journey_segments
                 ON tickets (train_id, coach_id, seat_number, journey_date, start_sequence, end_sequence)`
            );
        }
        const [legacyIndexes] = await connection.query(
            `SELECT INDEX_NAME FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tickets'
               AND INDEX_NAME = 'unq_journey_seat'`,
            [dbName]
        );
        if (legacyIndexes.length) {
            await connection.query('ALTER TABLE tickets DROP INDEX unq_journey_seat');
        }

        // 2. Execute seed_data.sql
        const seedSql = db.loadDatabaseScript('seed_data.sql', dbName);
        console.log('Executing database/seed_data.sql (Populating sample stations, trains, coaches, passengers)...');
        await connection.query(seedSql);
        await connection.query(
            `UPDATE tickets ticket
             SET ticket.end_sequence = (
                 SELECT MAX(schedule.stop_sequence) FROM schedules schedule
                 WHERE schedule.train_id = ticket.train_id
             )
             WHERE ticket.end_sequence = 9999
               AND EXISTS (SELECT 1 FROM schedules schedule WHERE schedule.train_id = ticket.train_id)`
        );
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
