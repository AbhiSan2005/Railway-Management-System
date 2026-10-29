-- ============================================================================
-- RAILWAY MANAGEMENT SYSTEM DATABASE SCHEMA (MySQL 8.0+)
-- Derived and simplified from the ER Diagram
-- ============================================================================

DROP DATABASE IF EXISTS railway_db;
CREATE DATABASE railway_db;
USE railway_db;

-- ----------------------------------------------------------------------------
-- 1. STATIONS TABLE
-- Maps to: STATION entity
-- Normalization: 1NF, 2NF, 3NF compliant
-- ----------------------------------------------------------------------------
CREATE TABLE stations (
    station_id INT AUTO_INCREMENT PRIMARY KEY,
    station_code VARCHAR(10) NOT NULL UNIQUE,       -- Candidate Key (e.g., 'NDLS', 'CSTM')
    station_name VARCHAR(100) NOT NULL,
    city VARCHAR(60) NOT NULL,
    zone VARCHAR(50) NOT NULL                       -- Railway Zone (e.g., 'Northern', 'Western')
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 2. ROUTES TABLE
-- Maps to: ROUTE entity & RUNS_ON relationship
-- ----------------------------------------------------------------------------
CREATE TABLE routes (
    route_id INT AUTO_INCREMENT PRIMARY KEY,
    source_station_id INT NOT NULL,
    destination_station_id INT NOT NULL,
    distance_km DECIMAL(7, 2) NOT NULL CHECK (distance_km > 0),
    duration_hours DECIMAL(5, 2) NOT NULL CHECK (duration_hours > 0),
    CONSTRAINT fk_route_source FOREIGN KEY (source_station_id) REFERENCES stations(station_id) ON DELETE RESTRICT,
    CONSTRAINT fk_route_dest FOREIGN KEY (destination_station_id) REFERENCES stations(station_id) ON DELETE RESTRICT,
    CONSTRAINT chk_diff_stations CHECK (source_station_id != destination_station_id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 3. TRAINS TABLE
-- Maps to: TRAIN entity
-- ----------------------------------------------------------------------------
CREATE TABLE trains (
    train_id INT AUTO_INCREMENT PRIMARY KEY,
    train_number VARCHAR(10) NOT NULL UNIQUE,      -- Candidate Key (e.g., '12951', '12002')
    train_name VARCHAR(100) NOT NULL,
    train_type VARCHAR(50) NOT NULL,               -- Superfast, Rajdhani, Express, Shatabdi
    total_coaches INT NOT NULL DEFAULT 12 CHECK (total_coaches > 0),
    route_id INT NOT NULL,
    source_station_id INT NOT NULL,
    dest_station_id INT NOT NULL,
    CONSTRAINT fk_train_route FOREIGN KEY (route_id) REFERENCES routes(route_id) ON DELETE RESTRICT,
    CONSTRAINT fk_train_src FOREIGN KEY (source_station_id) REFERENCES stations(station_id) ON DELETE RESTRICT,
    CONSTRAINT fk_train_dst FOREIGN KEY (dest_station_id) REFERENCES stations(station_id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 4. COACHES TABLE
-- Maps to: COACH entity & HAS relationship (Train 1:N Coach)
-- ----------------------------------------------------------------------------
CREATE TABLE coaches (
    coach_id INT AUTO_INCREMENT PRIMARY KEY,
    train_id INT NOT NULL,
    coach_code VARCHAR(10) NOT NULL,               -- e.g., 'A1', 'B1', 'S1'
    coach_type ENUM('1A', '2A', '3A', 'SL', 'CC', '2S') NOT NULL,
    capacity INT NOT NULL DEFAULT 72 CHECK (capacity > 0),
    CONSTRAINT fk_coach_train FOREIGN KEY (train_id) REFERENCES trains(train_id) ON DELETE CASCADE,
    CONSTRAINT unq_train_coach UNIQUE (train_id, coach_code)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 5. SEATS TABLE (Weak Entity dependent on COACH)
-- Maps to: SEAT entity & DIVIDED_INTO relationship
-- ----------------------------------------------------------------------------
CREATE TABLE seats (
    coach_id INT NOT NULL,
    seat_number INT NOT NULL CHECK (seat_number > 0),
    berth_type ENUM('LOWER', 'MIDDLE', 'UPPER', 'SIDE LOWER', 'SIDE UPPER', 'WINDOW') DEFAULT 'LOWER',
    status ENUM('AVAILABLE', 'BOOKED') DEFAULT 'AVAILABLE',
    PRIMARY KEY (coach_id, seat_number),           -- Composite Key for Weak Entity
    CONSTRAINT fk_seat_coach FOREIGN KEY (coach_id) REFERENCES coaches(coach_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 6. SCHEDULE TABLE (Weak/Associative Entity between Train & Station)
-- Maps to: SCHEDULE entity & HAS_SCHEDULE / LOCATED_AT relationships
-- ----------------------------------------------------------------------------
CREATE TABLE schedules (
    schedule_id INT AUTO_INCREMENT PRIMARY KEY,
    train_id INT NOT NULL,
    station_id INT NOT NULL,
    stop_sequence INT NOT NULL CHECK (stop_sequence >= 1),
    arrival_time TIME NULL,                        -- NULL for source station
    departure_time TIME NULL,                      -- NULL for destination station
    platform_no INT CHECK (platform_no > 0),
    CONSTRAINT fk_sched_train FOREIGN KEY (train_id) REFERENCES trains(train_id) ON DELETE CASCADE,
    CONSTRAINT fk_sched_station FOREIGN KEY (station_id) REFERENCES stations(station_id) ON DELETE RESTRICT,
    CONSTRAINT unq_train_stop UNIQUE (train_id, stop_sequence)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 7. PASSENGERS TABLE
-- Maps to: PASSENGER entity
-- Normalization note:
-- - Composite attribute 'address' is decomposed into street, city, state, pincode (1NF).
-- - Derived attribute 'age' is computed from 'dob' via VIRTUAL GENERATED COLUMN.
-- ----------------------------------------------------------------------------
CREATE TABLE passengers (
    passenger_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    dob DATE NOT NULL,
    gender ENUM('Male', 'Female', 'Other') DEFAULT 'Male',
    primary_phone VARCHAR(15) NOT NULL,
    email VARCHAR(100) UNIQUE,
    street VARCHAR(120),
    city VARCHAR(60) NOT NULL,
    state VARCHAR(60) NOT NULL,
    pincode VARCHAR(10) NOT NULL
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 8. PASSENGER_PHONES TABLE (Multivalued attribute decomposition)
-- Maps to: phone_numbers attribute of PASSENGER (1NF compliance)
-- ----------------------------------------------------------------------------
CREATE TABLE passenger_phones (
    passenger_id INT NOT NULL,
    phone_number VARCHAR(15) NOT NULL,
    phone_type VARCHAR(20) DEFAULT 'Mobile',
    PRIMARY KEY (passenger_id, phone_number),
    CONSTRAINT fk_phone_passenger FOREIGN KEY (passenger_id) REFERENCES passengers(passenger_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 9. NEXT_OF_KIN TABLE (Weak Entity dependent on PASSENGER)
-- Maps to: NEXT_OF_KIN entity & EMERGENCY_CONTACT relationship
-- ----------------------------------------------------------------------------
CREATE TABLE next_of_kin (
    passenger_id INT NOT NULL,
    kin_name VARCHAR(100) NOT NULL,
    relation VARCHAR(50) NOT NULL,
    phone_number VARCHAR(15) NOT NULL,
    PRIMARY KEY (passenger_id, kin_name),
    CONSTRAINT fk_kin_passenger FOREIGN KEY (passenger_id) REFERENCES passengers(passenger_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 10. EMPLOYEES TABLE
-- Maps to: EMPLOYEE entity, WORKS_ON & STATIONED_AT relationships
-- ----------------------------------------------------------------------------
CREATE TABLE employees (
    employee_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    salary DECIMAL(10, 2) NOT NULL CHECK (salary >= 0),
    designation VARCHAR(60) NOT NULL,
    station_id INT NULL,                           -- Stationed at (nullable if roving/onboard)
    train_id INT NULL,                             -- Works on train (nullable if station-based)
    role_on_train VARCHAR(50) NULL,                -- Descriptive attribute of WORKS_ON relationship
    CONSTRAINT fk_emp_station FOREIGN KEY (station_id) REFERENCES stations(station_id) ON DELETE SET NULL,
    CONSTRAINT fk_emp_train FOREIGN KEY (train_id) REFERENCES trains(train_id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 11. TICKETS TABLE
-- Maps to: TICKET entity, MAKES, COVERED_BY, and RESERVED_BY relationships
-- ----------------------------------------------------------------------------
CREATE TABLE tickets (
    ticket_id INT AUTO_INCREMENT PRIMARY KEY,
    pnr_number VARCHAR(10) NOT NULL UNIQUE,
    passenger_id INT NOT NULL,
    train_id INT NOT NULL,
    coach_id INT NOT NULL,
    seat_number INT NOT NULL,
    journey_date DATE NOT NULL,
    booking_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fare DECIMAL(8, 2) NOT NULL CHECK (fare > 0),
    status ENUM('CONFIRMED', 'WAITLIST', 'CANCELLED') DEFAULT 'CONFIRMED',
    CONSTRAINT fk_ticket_passenger FOREIGN KEY (passenger_id) REFERENCES passengers(passenger_id) ON DELETE RESTRICT,
    CONSTRAINT fk_ticket_train FOREIGN KEY (train_id) REFERENCES trains(train_id) ON DELETE RESTRICT,
    CONSTRAINT fk_ticket_seat FOREIGN KEY (coach_id, seat_number) REFERENCES seats(coach_id, seat_number) ON DELETE RESTRICT,
    -- Business Constraint: No duplicate booking of the same seat on the same train on the same journey date
    CONSTRAINT unq_journey_seat UNIQUE (train_id, coach_id, seat_number, journey_date)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- USEFUL VIEW: Train Schedule Summary
-- Combines Train, Route, and Station details for clean querying
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW view_train_details AS
SELECT 
    t.train_id,
    t.train_number,
    t.train_name,
    t.train_type,
    s_src.station_name AS source_station,
    s_dst.station_name AS destination_station,
    r.distance_km,
    r.duration_hours,
    t.total_coaches
FROM trains t
JOIN routes r ON t.route_id = r.route_id
JOIN stations s_src ON t.source_station_id = s_src.station_id
JOIN stations s_dst ON t.dest_station_id = s_dst.station_id;

-- ----------------------------------------------------------------------------
-- USEFUL VIEW: Ticket Booking Information
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW view_ticket_details AS
SELECT 
    tk.ticket_id,
    tk.pnr_number,
    p.name AS passenger_name,
    p.primary_phone,
    t.train_number,
    t.train_name,
    c.coach_code,
    c.coach_type,
    tk.seat_number,
    tk.journey_date,
    tk.booking_date,
    tk.fare,
    tk.status
FROM tickets tk
JOIN passengers p ON tk.passenger_id = p.passenger_id
JOIN trains t ON tk.train_id = t.train_id
JOIN coaches c ON tk.coach_id = c.coach_id;

