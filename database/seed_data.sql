-- ============================================================================
-- SAMPLE SEED DATA FOR RAILWAY MANAGEMENT SYSTEM
-- ============================================================================

USE railway_db;

-- 1. Insert Stations
INSERT INTO stations (station_id, station_code, station_name, city, zone) VALUES
(1, 'NDLS', 'New Delhi Railway Station', 'New Delhi', 'Northern Railway'),
(2, 'MMCT', 'Mumbai Central', 'Mumbai', 'Western Railway'),
(3, 'SBC',  'KSR Bengaluru City', 'Bengaluru', 'South Western Railway'),
(4, 'MAS',  'Chennai Central', 'Chennai', 'Southern Railway'),
(5, 'HWH',  'Howrah Junction', 'Kolkata', 'Eastern Railway'),
(6, 'BPL',  'Bhopal Junction', 'Bhopal', 'West Central Railway'),
(7, 'CNB',  'Kanpur Central', 'Kanpur', 'North Central Railway'),
(8, 'ST',   'Surat Junction', 'Surat', 'Western Railway');

-- 2. Insert Routes
INSERT INTO routes (route_id, source_station_id, destination_station_id, distance_km, duration_hours) VALUES
(1, 1, 2, 1384.00, 16.50), -- New Delhi -> Mumbai Central
(2, 2, 1, 1384.00, 16.50), -- Mumbai Central -> New Delhi
(3, 1, 3, 2365.00, 34.00), -- New Delhi -> Bengaluru
(4, 1, 5, 1447.00, 17.25), -- New Delhi -> Howrah
(5, 4, 3, 359.00,  4.75);  -- Chennai -> Bengaluru

-- 3. Insert Trains
INSERT INTO trains (train_id, train_number, train_name, train_type, total_coaches, route_id, source_station_id, dest_station_id) VALUES
(1, '12952', 'Mumbai Rajdhani Express', 'Rajdhani Express', 16, 1, 1, 2),
(2, '12951', 'New Delhi Rajdhani Express', 'Rajdhani Express', 16, 2, 2, 1),
(3, '22692', 'Bengaluru Rajdhani Express', 'Rajdhani Express', 18, 3, 1, 3),
(4, '12302', 'Howrah Rajdhani Express', 'Rajdhani Express', 18, 4, 1, 5),
(5, '20607', 'Vande Bharat Express', 'Vande Bharat', 8, 5, 4, 3);

-- 4. Insert Schedules (Stops along the journey)
INSERT INTO schedules (train_id, station_id, stop_sequence, arrival_time, departure_time, platform_no) VALUES
-- Train 12952 (NDLS -> MMCT)
(1, 1, 1, NULL, '16:55:00', 3),        -- New Delhi (Source)
(1, 7, 2, '21:35:00', '21:40:00', 1),  -- Kanpur Central
(1, 6, 3, '02:00:00', '02:05:00', 2),  -- Bhopal Junction
(1, 8, 4, '05:30:00', '05:35:00', 1),  -- Surat
(1, 2, 5, '08:35:00', NULL, 1),        -- Mumbai Central (Dest)

-- Train 20607 (MAS -> SBC Vande Bharat)
(5, 4, 1, NULL, '05:50:00', 2),        -- Chennai Central (Source)
(5, 3, 2, '10:20:00', NULL, 1);        -- Bengaluru (Dest)

-- 5. Insert Coaches
INSERT INTO coaches (coach_id, train_id, coach_code, coach_type, capacity) VALUES
(1, 1, 'H1', '1A', 24),
(2, 1, 'A1', '2A', 48),
(3, 1, 'B1', '3A', 64),
(4, 1, 'B2', '3A', 64),
(5, 1, 'S1', 'SL', 72),
(6, 5, 'C1', 'CC', 78),
(7, 5, 'E1', '1A', 52);

-- 6. Insert Sample Seats for Coach 3 (B1 - 3A) and Coach 6 (C1 - CC)
INSERT INTO seats (coach_id, seat_number, berth_type, status) VALUES
(3, 1, 'LOWER', 'AVAILABLE'),
(3, 2, 'MIDDLE', 'AVAILABLE'),
(3, 3, 'UPPER', 'AVAILABLE'),
(3, 4, 'SIDE LOWER', 'AVAILABLE'),
(3, 5, 'SIDE UPPER', 'AVAILABLE'),
(3, 6, 'LOWER', 'AVAILABLE'),
(3, 7, 'MIDDLE', 'AVAILABLE'),
(3, 8, 'UPPER', 'AVAILABLE'),
(6, 1, 'WINDOW', 'AVAILABLE'),
(6, 2, 'MIDDLE', 'AVAILABLE'),
(6, 3, 'WINDOW', 'AVAILABLE'),
(6, 4, 'WINDOW', 'AVAILABLE');

-- 7. Insert Passengers
INSERT INTO passengers (passenger_id, name, dob, gender, primary_phone, email, street, city, state, pincode) VALUES
(1, 'Rahul Sharma', '1995-04-15', 'Male', '9876543210', 'rahul.sharma@example.com', '42 MG Road', 'New Delhi', 'Delhi', '110001'),
(2, 'Priya Patel', '1998-08-22', 'Female', '9812345678', 'priya.patel@example.com', '15 Marine Drive', 'Mumbai', 'Maharashtra', '400020'),
(3, 'Amit Verma', '1987-11-03', 'Male', '9723456789', 'amit.verma@example.com', '88 Brigade Road', 'Bengaluru', 'Karnataka', '560025'),
(4, 'Sneha Mukherjee', '2001-02-14', 'Female', '9634567890', 'sneha.m@example.com', '12 Park Street', 'Kolkata', 'West Bengal', '700016');

-- 8. Insert Multivalued Phone Numbers
INSERT INTO passenger_phones (passenger_id, phone_number, phone_type) VALUES
(1, '9876543210', 'Mobile'),
(1, '0112345678', 'Home/Landline'),
(2, '9812345678', 'Mobile'),
(3, '9723456789', 'Mobile');

-- 9. Insert Next of Kin (Emergency Contacts)
INSERT INTO next_of_kin (passenger_id, kin_name, relation, phone_number) VALUES
(1, 'Vikram Sharma', 'Father', '9899001122'),
(2, 'Sunita Patel', 'Mother', '9822113344'),
(3, 'Meera Verma', 'Spouse', '9733445566');

-- 10. Insert Employees
INSERT INTO employees (employee_id, name, salary, designation, station_id, train_id, role_on_train) VALUES
(1, 'Rajesh Kumar', 75000.00, 'Station Master', 1, NULL, NULL),
(2, 'Sunil Yadav', 58000.00, 'Loco Pilot', NULL, 1, 'Chief Driver'),
(3, 'Kavita Iyer', 42000.00, 'Train Ticket Examiner (TTE)', NULL, 1, 'Ticket Checking Inspector'),
(4, 'Manoj Tiwari', 45000.00, 'Station Supervisor', 2, NULL, NULL);

-- 11. Insert Sample Tickets
INSERT INTO tickets (ticket_id, pnr_number, passenger_id, train_id, coach_id, seat_number, journey_date, fare, status) VALUES
(1, 'PNR849201', 1, 1, 3, 1, '2026-11-15', 2150.00, 'CONFIRMED'),
(2, 'PNR552190', 2, 1, 3, 2, '2026-11-15', 2150.00, 'CONFIRMED'),
(3, 'PNR339182', 3, 5, 6, 1, '2026-11-18', 1250.00, 'CONFIRMED');

-- Update seat status for booked seats
UPDATE seats SET status = 'BOOKED' WHERE coach_id = 3 AND seat_number IN (1, 2);
UPDATE seats SET status = 'BOOKED' WHERE coach_id = 6 AND seat_number = 1;

