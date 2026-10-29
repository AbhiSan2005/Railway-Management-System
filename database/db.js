require('dotenv').config();
const mysql = require('mysql2/promise');

let pool = null;
let useMock = false;

// Sample fallback store initialized from seed data
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
    trains: [
        { train_id: 1, train_number: '12952', train_name: 'Mumbai Rajdhani Express', train_type: 'Rajdhani Express', total_coaches: 16, route_id: 1, source_station_id: 1, dest_station_id: 2, source_station: 'New Delhi Railway Station', destination_station: 'Mumbai Central', distance_km: 1384.00, duration_hours: 16.50 },
        { train_id: 2, train_number: '12951', train_name: 'New Delhi Rajdhani Express', train_type: 'Rajdhani Express', total_coaches: 16, route_id: 2, source_station_id: 2, dest_station_id: 1, source_station: 'Mumbai Central', destination_station: 'New Delhi Railway Station', distance_km: 1384.00, duration_hours: 16.50 },
        { train_id: 3, train_number: '22692', train_name: 'Bengaluru Rajdhani Express', train_type: 'Rajdhani Express', total_coaches: 18, route_id: 3, source_station_id: 1, dest_station_id: 3, source_station: 'New Delhi Railway Station', destination_station: 'KSR Bengaluru City', distance_km: 2365.00, duration_hours: 34.00 },
        { train_id: 4, train_number: '12302', train_name: 'Howrah Rajdhani Express', train_type: 'Rajdhani Express', total_coaches: 18, route_id: 4, source_station_id: 1, dest_station_id: 5, source_station: 'New Delhi Railway Station', destination_station: 'Howrah Junction', distance_km: 1447.00, duration_hours: 17.25 },
        { train_id: 5, train_number: '20607', train_name: 'Vande Bharat Express', train_type: 'Vande Bharat', total_coaches: 8, route_id: 5, source_station_id: 4, dest_station_id: 3, source_station: 'Chennai Central', destination_station: 'KSR Bengaluru City', distance_km: 359.00, duration_hours: 4.75 }
    ],
    schedules: [
        { schedule_id: 1, train_id: 1, station_id: 1, station_name: 'New Delhi Railway Station', station_code: 'NDLS', stop_sequence: 1, arrival_time: null, departure_time: '16:55:00', platform_no: 3 },
        { schedule_id: 2, train_id: 1, station_id: 7, station_name: 'Kanpur Central', station_code: 'CNB', stop_sequence: 2, arrival_time: '21:35:00', departure_time: '21:40:00', platform_no: 1 },
        { schedule_id: 3, train_id: 1, station_id: 6, station_name: 'Bhopal Junction', station_code: 'BPL', stop_sequence: 3, arrival_time: '02:00:00', departure_time: '02:05:00', platform_no: 2 },
        { schedule_id: 4, train_id: 1, station_id: 8, station_name: 'Surat Junction', station_code: 'ST', stop_sequence: 4, arrival_time: '05:30:00', departure_time: '05:35:00', platform_no: 1 },
        { schedule_id: 5, train_id: 1, station_id: 2, station_name: 'Mumbai Central', station_code: 'MMCT', stop_sequence: 5, arrival_time: '08:35:00', departure_time: null, platform_no: 1 },
        { schedule_id: 6, train_id: 5, station_id: 4, station_name: 'Chennai Central', station_code: 'MAS', stop_sequence: 1, arrival_time: null, departure_time: '05:50:00', platform_no: 2 },
        { schedule_id: 7, train_id: 5, station_id: 3, station_name: 'KSR Bengaluru City', station_code: 'SBC', stop_sequence: 2, arrival_time: '10:20:00', departure_time: null, platform_no: 1 }
    ],
    coaches: [
        { coach_id: 1, train_id: 1, coach_code: 'H1', coach_type: '1A', capacity: 24, base_fare: 3500 },
        { coach_id: 2, train_id: 1, coach_code: 'A1', coach_type: '2A', capacity: 48, base_fare: 2800 },
        { coach_id: 3, train_id: 1, coach_code: 'B1', coach_type: '3A', capacity: 64, base_fare: 2150 },
        { coach_id: 4, train_id: 1, coach_code: 'B2', coach_type: '3A', capacity: 64, base_fare: 2150 },
        { coach_id: 5, train_id: 1, coach_code: 'S1', coach_type: 'SL', capacity: 72, base_fare: 650 },
        { coach_id: 6, train_id: 5, coach_code: 'C1', coach_type: 'CC', capacity: 78, base_fare: 1250 },
        { coach_id: 7, train_id: 5, coach_code: 'E1', coach_type: '1A', capacity: 52, base_fare: 2350 }
    ],
    passengers: [
        { passenger_id: 1, name: 'Rahul Sharma', dob: '1995-04-15', age: 31, gender: 'Male', primary_phone: '9876543210', email: 'rahul.sharma@example.com', street: '42 MG Road', city: 'New Delhi', state: 'Delhi', pincode: '110001' },
        { passenger_id: 2, name: 'Priya Patel', dob: '1998-08-22', age: 28, gender: 'Female', primary_phone: '9812345678', email: 'priya.patel@example.com', street: '15 Marine Drive', city: 'Mumbai', state: 'Maharashtra', pincode: '400020' },
        { passenger_id: 3, name: 'Amit Verma', dob: '1987-11-03', age: 38, gender: 'Male', primary_phone: '9723456789', email: 'amit.verma@example.com', street: '88 Brigade Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560025' },
        { passenger_id: 4, name: 'Sneha Mukherjee', dob: '2001-02-14', age: 25, gender: 'Female', primary_phone: '9634567890', email: 'sneha.m@example.com', street: '12 Park Street', city: 'Kolkata', state: 'West Bengal', pincode: '700016' }
    ],
    tickets: [
        { ticket_id: 1, pnr_number: 'PNR849201', passenger_id: 1, passenger_name: 'Rahul Sharma', primary_phone: '9876543210', train_id: 1, train_number: '12952', train_name: 'Mumbai Rajdhani Express', coach_id: 3, coach_code: 'B1', coach_type: '3A', seat_number: 1, journey_date: '2026-11-15', booking_date: '2026-10-25 14:30:00', fare: 2150.00, status: 'CONFIRMED' },
        { ticket_id: 2, pnr_number: 'PNR552190', passenger_id: 2, passenger_name: 'Priya Patel', primary_phone: '9812345678', train_id: 1, train_number: '12952', train_name: 'Mumbai Rajdhani Express', coach_id: 3, coach_code: 'B1', coach_type: '3A', seat_number: 2, journey_date: '2026-11-15', booking_date: '2026-10-26 09:15:00', fare: 2150.00, status: 'CONFIRMED' },
        { ticket_id: 3, pnr_number: 'PNR339182', passenger_id: 3, passenger_name: 'Amit Verma', primary_phone: '9723456789', train_id: 5, train_number: '20607', train_name: 'Vande Bharat Express', coach_id: 6, coach_code: 'C1', coach_type: 'CC', seat_number: 1, journey_date: '2026-11-18', booking_date: '2026-10-27 18:40:00', fare: 1250.00, status: 'CONFIRMED' }
    ]
};

async function initDatabase() {
    try {
        const connectionConfig = {
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'railway_db',
            port: parseInt(process.env.DB_PORT || '3306')
        };

        pool = mysql.createPool(connectionConfig);
        const connection = await pool.getConnection();
        await connection.ping();
        connection.release();
        console.log('✅ Connected successfully to MySQL Database: ' + connectionConfig.database);
        useMock = false;
    } catch (err) {
        console.warn('⚠️  Could not connect to live MySQL Server (' + err.message + ').');
        console.warn('💡 Operating in Standalone In-Memory Mode with rich seed data.');
        console.warn('👉 To connect to your MySQL database, create a .env file with DB_PASSWORD=<your_mysql_password>.');
        useMock = true;
    }
}

async function query(sql, params = []) {
    if (!useMock && pool) {
        try {
            const [rows] = await pool.execute(sql, params);
            return rows;
        } catch (error) {
            console.error('MySQL query error:', error.message);
            throw error;
        }
    }
    return null;
}

module.exports = {
    initDatabase,
    query,
    isMock: () => useMock,
    mockDb
};

