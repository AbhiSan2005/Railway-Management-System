require('dotenv').config();
const mysql = require('mysql2/promise');
const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');

let pool = null;
let useMock = true;
let lastQueryDuration = 0;

// Default bcrypt hash for 'password123'
const DEFAULT_PASSWORD_HASH = '$2b$10$i6fKWalPuNlN8L4k.nNlcO40SN.qrabe4JzLXq7Xp/e1UwLW.xM1m';

// In-Memory Fallback Database conforming strictly to 3NF/BCNF schema
const mockDb = {
    stations: [
        { station_id: 1, station_code: 'NDLS', station_name: 'New Delhi Railway Station', city: 'New Delhi', zone: 'Northern Railway' },
        { station_id: 2, station_code: 'MMCT', station_name: 'Mumbai Central', city: 'Mumbai', zone: 'Western Railway' },
        { station_id: 3, station_code: 'SBC',  station_name: 'KSR Bengaluru City', city: 'Bengaluru', zone: 'South Western Railway' },
        { station_id: 4, station_code: 'MAS',  station_name: 'Chennai Central', city: 'Chennai', zone: 'Southern Railway' },
        { station_id: 5, station_code: 'HWH',  station_name: 'Howrah Junction', city: 'Kolkata', zone: 'Eastern Railway' },
        { station_id: 6, station_code: 'BPL',  station_name: 'Bhopal Junction', city: 'Bhopal', zone: 'West Central Railway' },
        { station_id: 7, station_code: 'CNB',  station_name: 'Kanpur Central', city: 'Kanpur', zone: 'North Central Railway' },
        { station_id: 8, station_code: 'ST',   station_name: 'Surat Junction', city: 'Surat', zone: 'Western Railway' }
    ],
    routes: [
        { route_id: 1, source_station_id: 1, destination_station_id: 2, distance_km: 1384.00, duration_hours: 16.50 },
        { route_id: 2, source_station_id: 2, destination_station_id: 1, distance_km: 1384.00, duration_hours: 16.50 },
        { route_id: 3, source_station_id: 1, destination_station_id: 3, distance_km: 2365.00, duration_hours: 34.00 },
        { route_id: 4, source_station_id: 1, destination_station_id: 5, distance_km: 1447.00, duration_hours: 17.25 },
        { route_id: 5, source_station_id: 4, destination_station_id: 3, distance_km: 359.00,  duration_hours: 4.75 }
    ],
    trains: [
        { train_id: 1, train_number: '12952', train_name: 'Mumbai Rajdhani Express', train_type: 'Rajdhani Express', total_coaches: 16, route_id: 1 },
        { train_id: 2, train_number: '12951', train_name: 'New Delhi Rajdhani Express', train_type: 'Rajdhani Express', total_coaches: 16, route_id: 2 },
        { train_id: 3, train_number: '22692', train_name: 'Bengaluru Rajdhani Express', train_type: 'Rajdhani Express', total_coaches: 18, route_id: 3 },
        { train_id: 4, train_number: '12302', train_name: 'Howrah Rajdhani Express', train_type: 'Rajdhani Express', total_coaches: 18, route_id: 4 },
        { train_id: 5, train_number: '20607', train_name: 'Vande Bharat Express', train_type: 'Vande Bharat', total_coaches: 8, route_id: 5 }
    ],
    coaches: [
        { coach_id: 1, train_id: 1, coach_number: 'H1', coach_type: '1A', capacity: 24, base_fare: 3800.00 },
        { coach_id: 2, train_id: 1, coach_number: 'A1', coach_type: '2A', capacity: 48, base_fare: 2900.00 },
        { coach_id: 3, train_id: 1, coach_number: 'B1', coach_type: '3A', capacity: 64, base_fare: 2150.00 },
        { coach_id: 4, train_id: 1, coach_number: 'B2', coach_type: '3A', capacity: 64, base_fare: 2150.00 },
        { coach_id: 5, train_id: 1, coach_number: 'S1', coach_type: 'SL', capacity: 72, base_fare: 650.00 },
        { coach_id: 6, train_id: 5, coach_number: 'C1', coach_type: 'CC', capacity: 78, base_fare: 1250.00 },
        { coach_id: 7, train_id: 5, coach_number: 'E1', coach_type: '1A', capacity: 52, base_fare: 2450.00 }
    ],
    seats: [
        // Coach B1 (coach_id: 3, 3A)
        { coach_id: 3, seat_number: 1, berth_type: 'LOWER', status: 'BOOKED' },
        { coach_id: 3, seat_number: 2, berth_type: 'MIDDLE', status: 'BOOKED' },
        { coach_id: 3, seat_number: 3, berth_type: 'UPPER', status: 'AVAILABLE' },
        { coach_id: 3, seat_number: 4, berth_type: 'SIDE LOWER', status: 'AVAILABLE' },
        { coach_id: 3, seat_number: 5, berth_type: 'SIDE UPPER', status: 'AVAILABLE' },
        { coach_id: 3, seat_number: 6, berth_type: 'LOWER', status: 'AVAILABLE' },
        { coach_id: 3, seat_number: 7, berth_type: 'MIDDLE', status: 'AVAILABLE' },
        { coach_id: 3, seat_number: 8, berth_type: 'UPPER', status: 'AVAILABLE' },
        { coach_id: 3, seat_number: 9, berth_type: 'SIDE LOWER', status: 'AVAILABLE' },
        { coach_id: 3, seat_number: 10, berth_type: 'SIDE UPPER', status: 'AVAILABLE' },
        { coach_id: 3, seat_number: 11, berth_type: 'LOWER', status: 'AVAILABLE' },
        { coach_id: 3, seat_number: 12, berth_type: 'MIDDLE', status: 'AVAILABLE' },
        { coach_id: 3, seat_number: 13, berth_type: 'UPPER', status: 'AVAILABLE' },
        { coach_id: 3, seat_number: 14, berth_type: 'SIDE LOWER', status: 'AVAILABLE' },
        { coach_id: 3, seat_number: 15, berth_type: 'SIDE UPPER', status: 'AVAILABLE' },
        { coach_id: 3, seat_number: 16, berth_type: 'LOWER', status: 'AVAILABLE' },

        // Coach S1 (coach_id: 5, SL)
        { coach_id: 5, seat_number: 1, berth_type: 'LOWER', status: 'AVAILABLE' },
        { coach_id: 5, seat_number: 2, berth_type: 'MIDDLE', status: 'AVAILABLE' },
        { coach_id: 5, seat_number: 3, berth_type: 'UPPER', status: 'AVAILABLE' },
        { coach_id: 5, seat_number: 4, berth_type: 'SIDE LOWER', status: 'AVAILABLE' },
        { coach_id: 5, seat_number: 5, berth_type: 'SIDE UPPER', status: 'AVAILABLE' },
        { coach_id: 5, seat_number: 6, berth_type: 'LOWER', status: 'AVAILABLE' },
        { coach_id: 5, seat_number: 7, berth_type: 'MIDDLE', status: 'AVAILABLE' },
        { coach_id: 5, seat_number: 8, berth_type: 'UPPER', status: 'AVAILABLE' },

        // Coach C1 (coach_id: 6, CC)
        { coach_id: 6, seat_number: 1, berth_type: 'WINDOW', status: 'BOOKED' },
        { coach_id: 6, seat_number: 2, berth_type: 'MIDDLE', status: 'AVAILABLE' },
        { coach_id: 6, seat_number: 3, berth_type: 'WINDOW', status: 'AVAILABLE' },
        { coach_id: 6, seat_number: 4, berth_type: 'WINDOW', status: 'AVAILABLE' },
        { coach_id: 6, seat_number: 5, berth_type: 'MIDDLE', status: 'AVAILABLE' },
        { coach_id: 6, seat_number: 6, berth_type: 'WINDOW', status: 'AVAILABLE' },
        { coach_id: 6, seat_number: 7, berth_type: 'MIDDLE', status: 'AVAILABLE' },
        { coach_id: 6, seat_number: 8, berth_type: 'WINDOW', status: 'AVAILABLE' }
    ],
    schedules: [
        { schedule_id: 1, train_id: 1, station_id: 1, stop_sequence: 1, arrival_time: null, departure_time: '16:55:00', platform_no: 3 },
        { schedule_id: 2, train_id: 1, station_id: 7, stop_sequence: 2, arrival_time: '21:35:00', departure_time: '21:40:00', platform_no: 1 },
        { schedule_id: 3, train_id: 1, station_id: 6, stop_sequence: 3, arrival_time: '02:00:00', departure_time: '02:05:00', platform_no: 2 },
        { schedule_id: 4, train_id: 1, station_id: 8, stop_sequence: 4, arrival_time: '05:30:00', departure_time: '05:35:00', platform_no: 1 },
        { schedule_id: 5, train_id: 1, station_id: 2, stop_sequence: 5, arrival_time: '08:35:00', departure_time: null, platform_no: 1 },
        { schedule_id: 6, train_id: 5, station_id: 4, stop_sequence: 1, arrival_time: null, departure_time: '05:50:00', platform_no: 2 },
        { schedule_id: 7, train_id: 5, station_id: 3, stop_sequence: 2, arrival_time: '10:20:00', departure_time: null, platform_no: 1 }
    ],
    passengers: [
        { passenger_id: 1, name: 'Rahul Sharma', dob: '1995-04-15', age: 31, gender: 'Male', primary_phone: '9876543210', email: 'rahul@example.com', password_hash: DEFAULT_PASSWORD_HASH, street: '42 MG Road', city: 'New Delhi', state: 'Delhi', pincode: '110001' },
        { passenger_id: 2, name: 'Priya Patel', dob: '1998-08-22', age: 28, gender: 'Female', primary_phone: '9812345678', email: 'priya@example.com', password_hash: DEFAULT_PASSWORD_HASH, street: '15 Marine Drive', city: 'Mumbai', state: 'Maharashtra', pincode: '400020' },
        { passenger_id: 3, name: 'Amit Verma', dob: '1987-11-03', age: 38, gender: 'Male', primary_phone: '9723456789', email: 'amit@example.com', password_hash: DEFAULT_PASSWORD_HASH, street: '88 Brigade Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560025' },
        { passenger_id: 4, name: 'Sneha Mukherjee', dob: '2001-02-14', age: 25, gender: 'Female', primary_phone: '9634567890', email: 'sneha@example.com', password_hash: DEFAULT_PASSWORD_HASH, street: '12 Park Street', city: 'Kolkata', state: 'West Bengal', pincode: '700016' }
    ],
    passenger_phones: [
        { passenger_id: 1, phone_number: '9876543210', phone_type: 'Mobile' },
        { passenger_id: 1, phone_number: '0112345678', phone_type: 'Home/Landline' },
        { passenger_id: 2, phone_number: '9812345678', phone_type: 'Mobile' },
        { passenger_id: 3, phone_number: '9723456789', phone_type: 'Mobile' },
        { passenger_id: 4, phone_number: '9634567890', phone_type: 'Mobile' }
    ],
    next_of_kin: [
        { passenger_id: 1, kin_name: 'Vikram Sharma', relation: 'Father', phone_number: '9899001122' },
        { passenger_id: 1, kin_name: 'Sunita Sharma', relation: 'Mother', phone_number: '9899001133' },
        { passenger_id: 2, kin_name: 'Sunita Patel', relation: 'Mother', phone_number: '9822113344' },
        { passenger_id: 3, kin_name: 'Meera Verma', relation: 'Spouse', phone_number: '9733445566' },
        { passenger_id: 4, kin_name: 'Ananya Mukherjee', relation: 'Sister', phone_number: '9633221100' }
    ],
    employees: [
        { employee_id: 1, name: 'Rajesh Kumar', salary: 75000.00, designation: 'Station Master', email: 'rajesh.admin@railtransit.gov.in', password_hash: DEFAULT_PASSWORD_HASH, assigned_station_id: 1, assigned_train_id: null, role_on_train: null },
        { employee_id: 2, name: 'Sunil Yadav', salary: 58000.00, designation: 'Loco Pilot', email: 'sunil.pilot@railtransit.gov.in', password_hash: DEFAULT_PASSWORD_HASH, assigned_station_id: null, assigned_train_id: 1, role_on_train: 'Chief Driver' },
        { employee_id: 3, name: 'Kavita Iyer', salary: 42000.00, designation: 'Train Ticket Examiner (TTE)', email: 'kavita.tte@railtransit.gov.in', password_hash: DEFAULT_PASSWORD_HASH, assigned_station_id: null, assigned_train_id: 1, role_on_train: 'Ticket Inspector' },
        { employee_id: 4, name: 'Manoj Tiwari', salary: 45000.00, designation: 'Station Supervisor', email: 'manoj.supervisor@railtransit.gov.in', password_hash: DEFAULT_PASSWORD_HASH, assigned_station_id: 2, assigned_train_id: null, role_on_train: null }
    ],
    employee_phones: [
        { employee_id: 1, phone_number: '9811002233' },
        { employee_id: 1, phone_number: '0112334455' },
        { employee_id: 2, phone_number: '9822003344' },
        { employee_id: 3, phone_number: '9833004455' },
        { employee_id: 4, phone_number: '9844005566' }
    ],
    tickets: [
        { ticket_id: 1, pnr_no: 'PNR849201', passenger_id: 1, train_id: 1, coach_id: 3, seat_number: 1, journey_date: '2026-11-15', booking_date: '2026-10-25 14:30:00', fare: 2150.00, status: 'CONFIRMED' },
        { ticket_id: 2, pnr_no: 'PNR552190', passenger_id: 2, train_id: 1, coach_id: 3, seat_number: 2, journey_date: '2026-11-15', booking_date: '2026-10-26 09:15:00', fare: 2150.00, status: 'CONFIRMED' },
        { ticket_id: 3, pnr_no: 'PNR339182', passenger_id: 3, train_id: 5, coach_id: 6, seat_number: 1, journey_date: '2026-11-18', booking_date: '2026-10-27 18:40:00', fare: 1250.00, status: 'CONFIRMED' }
    ]
};

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
                // If warning on drop if not exists, ignore
            }
        }
    }
}

async function initDatabase() {
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbUser = process.env.DB_USER || 'root';
    const dbPassword = process.env.DB_PASSWORD || '';
    const dbName = process.env.DB_NAME || 'rms_db';
    const dbPort = parseInt(process.env.DB_PORT || '3306');

    try {
        // Step 1: Connect to server without database to auto-create database if not exists
        const serverConn = await mysql.createConnection({
            host: dbHost,
            user: dbUser,
            password: dbPassword,
            port: dbPort
        });
        await serverConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
        await serverConn.end();

        // Step 2: Create connection pool with database and multipleStatements enabled
        const connectionConfig = {
            host: dbHost,
            user: dbUser,
            password: dbPassword,
            database: dbName,
            port: dbPort,
            multipleStatements: true
        };

        pool = mysql.createPool(connectionConfig);
        const connection = await pool.getConnection();
        await connection.ping();

        // Step 3: Check if tables exist, auto-create schema and seed if missing
        const [tables] = await connection.query(`SHOW TABLES LIKE 'stations'`);
        if (tables.length === 0) {
            console.log(`Database '${dbName}' is missing tables. Auto-migrating schema...`);
            const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
            await executeSchema(connection, schemaSql);
            console.log(`Schema created successfully (3NF/BCNF).`);

            console.log(`Auto-seeding initial sample data into '${dbName}'...`);
            const seedSql = fs.readFileSync(path.join(__dirname, 'seed_data.sql'), 'utf8');
            await connection.query(seedSql);
            console.log(`Sample data seeded successfully.`);
        } else {
            // Check if tables have records
            const [rows] = await connection.query(`SELECT COUNT(*) as cnt FROM stations`);
            if (rows[0].cnt === 0) {
                console.log(`Tables exist but are empty. Auto-seeding initial sample data into '${dbName}'...`);
                const seedSql = fs.readFileSync(path.join(__dirname, 'seed_data.sql'), 'utf8');
                await connection.query(seedSql);
                console.log(`Sample data seeded successfully.`);
            } else {
                console.log(`Database '${dbName}' verified with active tables and data.`);
            }
        }

        connection.release();
        console.log('Connected successfully to MySQL Database: ' + dbName);
        useMock = false;
    } catch (err) {
        console.warn('Could not connect to live MySQL Server (' + err.message + ').');
        console.warn('Operating in Standalone In-Memory Mode with rich 3NF/BCNF seed data.');
        useMock = true;
    }
}

/**
 * Execute SQL query with high-precision latency measurement
 */
async function query(sql, params = [], req = null) {
    if (!useMock && pool) {
        const startTime = performance.now();
        try {
            const [rows] = await pool.execute(sql, params);
            const duration = parseFloat((performance.now() - startTime).toFixed(2));
            lastQueryDuration = duration;

            if (req) {
                req.dbDuration = (req.dbDuration || 0) + duration;
            }
            return rows;
        } catch (error) {
            console.error('MySQL query error:', error.message);
            throw error;
        }
    }

    const simulatedDuration = parseFloat((Math.random() * 0.4 + 0.1).toFixed(2));
    lastQueryDuration = simulatedDuration;
    if (req) {
        req.dbDuration = (req.dbDuration || 0) + simulatedDuration;
    }
    return null;
}

/**
 * Execute an ACID transaction callback
 */
async function transaction(callback) {
    if (!useMock && pool) {
        const connection = await pool.getConnection();
        await connection.beginTransaction();
        try {
            const result = await callback(connection);
            await connection.commit();
            return result;
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } else {
        // In-memory atomic snapshot execution
        const snapshot = JSON.stringify(mockDb);
        try {
            const result = await callback(null);
            return result;
        } catch (err) {
            // Restore snapshot on error (rollback)
            const restored = JSON.parse(snapshot);
            Object.keys(restored).forEach(k => {
                mockDb[k] = restored[k];
            });
            throw err;
        }
    }
}

module.exports = {
    initDatabase,
    query,
    transaction,
    isMock: () => useMock,
    getLastQueryDuration: () => lastQueryDuration,
    mockDb
};
