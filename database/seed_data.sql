-- ============================================================================
-- SAMPLE SEED DATA FOR RAILWAY MANAGEMENT SYSTEM
-- Compatible with Normalized 3NF/BCNF Schema
-- Default password for all sample users and staff is: password123
-- ============================================================================

USE rms_db;

-- 1. Insert Stations
INSERT IGNORE INTO stations (station_id, station_code, station_name, city, zone) VALUES
(1, 'NDLS', 'New Delhi Railway Station', 'New Delhi', 'Northern Railway'),
(2, 'MMCT', 'Mumbai Central', 'Mumbai', 'Western Railway'),
(3, 'SBC',  'KSR Bengaluru City', 'Bengaluru', 'South Western Railway'),
(4, 'MAS',  'Chennai Central', 'Chennai', 'Southern Railway'),
(5, 'HWH',  'Howrah Junction', 'Kolkata', 'Eastern Railway'),
(6, 'BPL',  'Bhopal Junction', 'Bhopal', 'West Central Railway'),
(7, 'CNB',  'Kanpur Central', 'Kanpur', 'North Central Railway'),
(8, 'ST',   'Surat Junction', 'Surat', 'Western Railway');

-- 2. Insert Routes
INSERT IGNORE INTO routes (route_id, source_station_id, destination_station_id, distance_km, duration_hours) VALUES
(1, 1, 2, 1384.00, 16.50), -- New Delhi -> Mumbai Central
(2, 2, 1, 1384.00, 16.50), -- Mumbai Central -> New Delhi
(3, 1, 3, 2365.00, 34.00), -- New Delhi -> Bengaluru
(4, 1, 5, 1447.00, 17.25), -- New Delhi -> Howrah
(5, 4, 3, 359.00,  4.75);  -- Chennai -> Bengaluru

-- 3. Insert Trains (Normalized: routes define source & destination)
INSERT IGNORE INTO trains (train_id, train_number, train_name, train_type, total_coaches, route_id) VALUES
(1, '12952', 'Mumbai Rajdhani Express', 'Rajdhani Express', 16, 1),
(2, '12951', 'New Delhi Rajdhani Express', 'Rajdhani Express', 16, 2),
(3, '22692', 'Bengaluru Rajdhani Express', 'Rajdhani Express', 18, 3),
(4, '12302', 'Howrah Rajdhani Express', 'Rajdhani Express', 18, 4),
(5, '20607', 'Vande Bharat Express', 'Vande Bharat', 8, 5);

-- 4. Insert Schedules (Halts along the route)
INSERT IGNORE INTO schedules (schedule_id, train_id, station_id, stop_sequence, arrival_time, departure_time, platform_no) VALUES
-- Train 12952 (NDLS -> MMCT)
(1, 1, 1, 1, NULL, '16:55:00', 3),        -- New Delhi (Source)
(2, 1, 7, 2, '21:35:00', '21:40:00', 1),  -- Kanpur Central
(3, 1, 6, 3, '02:00:00', '02:05:00', 2),  -- Bhopal Junction
(4, 1, 8, 4, '05:30:00', '05:35:00', 1),  -- Surat
(5, 1, 2, 5, '08:35:00', NULL, 1),        -- Mumbai Central (Dest)

-- Train 20607 (MAS -> SBC Vande Bharat)
(6, 5, 4, 1, NULL, '05:50:00', 2),        -- Chennai Central (Source)
(7, 5, 3, 2, '10:20:00', NULL, 1),        -- Bengaluru (Dest)
(8, 2, 2, 1, NULL, '16:55:00', 3),
(9, 2, 1, 2, '08:35:00', NULL, 1),
(10, 3, 1, 1, NULL, '20:00:00', 3),
(11, 3, 3, 2, '06:00:00', NULL, 1),
(12, 4, 1, 1, NULL, '16:55:00', 3),
(13, 4, 5, 2, '10:00:00', NULL, 1);

-- 5. Insert Coaches
INSERT IGNORE INTO coaches (coach_id, train_id, coach_number, coach_type, capacity, base_fare) VALUES
(1, 1, 'H1', '1A', 24, 3800.00),
(2, 1, 'A1', '2A', 48, 2900.00),
(3, 1, 'B1', '3A', 64, 2150.00),
(4, 1, 'B2', '3A', 64, 2150.00),
(5, 1, 'S1', 'SL', 72, 650.00),
(6, 5, 'C1', 'CC', 78, 1250.00),
(7, 5, 'E1', '1A', 52, 2450.00),
(8, 2, 'A1', '2A', 48, 2900.00),
(9, 2, 'B1', '3A', 64, 2150.00),
(10, 3, 'A1', '2A', 48, 3000.00),
(11, 3, 'B1', '3A', 64, 2300.00),
(12, 3, 'S1', 'SL', 72, 750.00),
(13, 4, 'A1', '2A', 48, 2850.00),
(14, 4, 'B1', '3A', 64, 2100.00);

-- Complete each consist up to trains.total_coaches; generated coaches use the 3A class.
INSERT IGNORE INTO coaches (train_id, coach_number, coach_type, capacity, base_fare)
SELECT t.train_id, CONCAT('G', numbers.coach_number), '3A', 64, 2150.00
FROM trains t
JOIN (
    SELECT ones.n + tens.n * 10 + 1 AS coach_number
    FROM (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
          UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) ones
    CROSS JOIN (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
                UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) tens
) numbers
WHERE numbers.coach_number > (
    SELECT COUNT(*) FROM coaches existing WHERE existing.train_id = t.train_id
)
  AND numbers.coach_number <= t.total_coaches
  AND NOT EXISTS (
      SELECT 1 FROM coaches existing
      WHERE existing.train_id = t.train_id
        AND existing.coach_number = CONCAT('G', numbers.coach_number)
  );

-- 6. Insert Physical Seats for Coach 3 (B1 - 3A) and Coach 6 (C1 - CC)
INSERT IGNORE INTO seats (coach_id, seat_number, berth_type, status) VALUES
-- Coach B1 (3A)
(3, 1, 'LOWER', 'BOOKED'),
(3, 2, 'MIDDLE', 'BOOKED'),
(3, 3, 'UPPER', 'AVAILABLE'),
(3, 4, 'SIDE LOWER', 'AVAILABLE'),
(3, 5, 'SIDE UPPER', 'AVAILABLE'),
(3, 6, 'LOWER', 'AVAILABLE'),
(3, 7, 'MIDDLE', 'AVAILABLE'),
(3, 8, 'UPPER', 'AVAILABLE'),
(3, 9, 'SIDE LOWER', 'AVAILABLE'),
(3, 10, 'SIDE UPPER', 'AVAILABLE'),
(3, 11, 'LOWER', 'AVAILABLE'),
(3, 12, 'MIDDLE', 'AVAILABLE'),
(3, 13, 'UPPER', 'AVAILABLE'),
(3, 14, 'SIDE LOWER', 'AVAILABLE'),
(3, 15, 'SIDE UPPER', 'AVAILABLE'),
(3, 16, 'LOWER', 'AVAILABLE'),

-- Coach S1 (SL)
(5, 1, 'LOWER', 'AVAILABLE'),
(5, 2, 'MIDDLE', 'AVAILABLE'),
(5, 3, 'UPPER', 'AVAILABLE'),
(5, 4, 'SIDE LOWER', 'AVAILABLE'),
(5, 5, 'SIDE UPPER', 'AVAILABLE'),
(5, 6, 'LOWER', 'AVAILABLE'),
(5, 7, 'MIDDLE', 'AVAILABLE'),
(5, 8, 'UPPER', 'AVAILABLE'),

-- Coach C1 (CC)
(6, 1, 'WINDOW', 'BOOKED'),
(6, 2, 'MIDDLE', 'AVAILABLE'),
(6, 3, 'WINDOW', 'AVAILABLE'),
(6, 4, 'WINDOW', 'AVAILABLE'),
(6, 5, 'MIDDLE', 'AVAILABLE'),
(6, 6, 'WINDOW', 'AVAILABLE'),
(6, 7, 'MIDDLE', 'AVAILABLE'),
(6, 8, 'WINDOW', 'AVAILABLE');

-- Ensure every physical coach has a complete seat inventory (not only the displayed sample seats).
INSERT IGNORE INTO seats (coach_id, seat_number, berth_type, status)
SELECT c.coach_id, numbers.seat_number,
       CASE
           WHEN numbers.seat_number % 6 = 1 THEN 'LOWER'
           WHEN numbers.seat_number % 6 = 2 THEN 'MIDDLE'
           WHEN numbers.seat_number % 6 = 3 THEN 'UPPER'
           WHEN numbers.seat_number % 6 = 4 THEN 'SIDE LOWER'
           WHEN numbers.seat_number % 6 = 5 THEN 'SIDE UPPER'
           ELSE 'LOWER'
       END,
       'AVAILABLE'
FROM coaches c
CROSS JOIN (
    SELECT ones.n + tens.n * 10 + 1 AS seat_number
    FROM (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
          UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) ones
    CROSS JOIN (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
                UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) tens
) numbers
WHERE numbers.seat_number <= c.capacity;

-- 7. Insert Passengers (Password: password123)
INSERT IGNORE INTO passengers (passenger_id, name, dob, age, gender, primary_phone, email, password_hash, street, city, state, pincode) VALUES
(1, 'Rahul Sharma', '1995-04-15', 31, 'Male', '9876543210', 'rahul@example.com', '$2b$10$i6fKWalPuNlN8L4k.nNlcO40SN.qrabe4JzLXq7Xp/e1UwLW.xM1m', '42 MG Road', 'New Delhi', 'Delhi', '110001'),
(2, 'Priya Patel', '1998-08-22', 28, 'Female', '9812345678', 'priya@example.com', '$2b$10$i6fKWalPuNlN8L4k.nNlcO40SN.qrabe4JzLXq7Xp/e1UwLW.xM1m', '15 Marine Drive', 'Mumbai', 'Maharashtra', '400020'),
(3, 'Amit Verma', '1987-11-03', 38, 'Male', '9723456789', 'amit@example.com', '$2b$10$i6fKWalPuNlN8L4k.nNlcO40SN.qrabe4JzLXq7Xp/e1UwLW.xM1m', '88 Brigade Road', 'Bengaluru', 'Karnataka', '560025'),
(4, 'Sneha Mukherjee', '2001-02-14', 25, 'Female', '9634567890', 'sneha@example.com', '$2b$10$i6fKWalPuNlN8L4k.nNlcO40SN.qrabe4JzLXq7Xp/e1UwLW.xM1m', '12 Park Street', 'Kolkata', 'West Bengal', '700016');

-- 8. Insert Multivalued Passenger Phone Numbers
INSERT IGNORE INTO passenger_phones (passenger_id, phone_number, phone_type) VALUES
(1, '9876543210', 'Mobile'),
(1, '0112345678', 'Home/Landline'),
(2, '9812345678', 'Mobile'),
(3, '9723456789', 'Mobile'),
(4, '9634567890', 'Mobile');

-- 9. Insert Next of Kin (Emergency Contacts)
INSERT IGNORE INTO next_of_kin (passenger_id, kin_name, relation, phone_number) VALUES
(1, 'Vikram Sharma', 'Father', '9899001122'),
(1, 'Sunita Sharma', 'Mother', '9899001133'),
(2, 'Sunita Patel', 'Mother', '9822113344'),
(3, 'Meera Verma', 'Spouse', '9733445566'),
(4, 'Ananya Mukherjee', 'Sister', '9633221100');

-- 10. Insert Employees (Staff & Admin, Password: password123)
INSERT IGNORE INTO employees (employee_id, name, salary, designation, email, password_hash, assigned_station_id, assigned_train_id, role_on_train) VALUES
(1, 'Rajesh Kumar', 75000.00, 'Station Master', 'rajesh.admin@railtransit.gov.in', '$2b$10$i6fKWalPuNlN8L4k.nNlcO40SN.qrabe4JzLXq7Xp/e1UwLW.xM1m', 1, NULL, NULL),
(2, 'Sunil Yadav', 58000.00, 'Loco Pilot', 'sunil.pilot@railtransit.gov.in', '$2b$10$i6fKWalPuNlN8L4k.nNlcO40SN.qrabe4JzLXq7Xp/e1UwLW.xM1m', NULL, 1, 'Chief Driver'),
(3, 'Kavita Iyer', 42000.00, 'Train Ticket Examiner (TTE)', 'kavita.tte@railtransit.gov.in', '$2b$10$i6fKWalPuNlN8L4k.nNlcO40SN.qrabe4JzLXq7Xp/e1UwLW.xM1m', NULL, 1, 'Ticket Inspector'),
(4, 'Manoj Tiwari', 45000.00, 'Station Supervisor', 'manoj.supervisor@railtransit.gov.in', '$2b$10$i6fKWalPuNlN8L4k.nNlcO40SN.qrabe4JzLXq7Xp/e1UwLW.xM1m', 2, NULL, NULL);

-- Backfill demo employee logins when older installations already use IDs 1-4.
INSERT IGNORE INTO employees
    (name, salary, designation, email, password_hash, assigned_station_id, assigned_train_id, role_on_train) VALUES
('Rajesh Kumar', 75000.00, 'Station Master', 'rajesh.admin@railtransit.gov.in', '$2b$10$i6fKWalPuNlN8L4k.nNlcO40SN.qrabe4JzLXq7Xp/e1UwLW.xM1m', 1, NULL, NULL),
('Sunil Yadav', 58000.00, 'Loco Pilot', 'sunil.pilot@railtransit.gov.in', '$2b$10$i6fKWalPuNlN8L4k.nNlcO40SN.qrabe4JzLXq7Xp/e1UwLW.xM1m', NULL, 1, 'Chief Driver'),
('Kavita Iyer', 42000.00, 'Train Ticket Examiner (TTE)', 'kavita.tte@railtransit.gov.in', '$2b$10$i6fKWalPuNlN8L4k.nNlcO40SN.qrabe4JzLXq7Xp/e1UwLW.xM1m', NULL, 1, 'Ticket Inspector'),
('Manoj Tiwari', 45000.00, 'Station Supervisor', 'manoj.supervisor@railtransit.gov.in', '$2b$10$i6fKWalPuNlN8L4k.nNlcO40SN.qrabe4JzLXq7Xp/e1UwLW.xM1m', 2, NULL, NULL);

-- 11. Insert Employee Phone Numbers
INSERT IGNORE INTO employee_phones (employee_id, phone_number) VALUES
(1, '9811002233'),
(1, '0112334455'),
(2, '9822003344'),
(3, '9833004455'),
(4, '9844005566');

-- 12. Insert Sample Tickets
INSERT IGNORE INTO tickets
    (ticket_id, pnr_no, passenger_id, train_id, coach_id, seat_number, journey_date, start_sequence, end_sequence, fare, status) VALUES
(1, 'PNR849201', 1, 1, 3, 1, '2026-11-15', 1, 5, 2150.00, 'CONFIRMED'),
(2, 'PNR552190', 2, 1, 3, 2, '2026-11-15', 1, 5, 2150.00, 'CONFIRMED'),
(3, 'PNR339182', 3, 5, 6, 1, '2026-11-18', 1, 2, 1250.00, 'CONFIRMED');
