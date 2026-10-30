-- ============================================================================
-- RAILWAY MANAGEMENT SYSTEM DATABASE SCHEMA (MySQL 8.0+)
-- Fully Normalized to 3NF & BCNF (Boyce-Codd Normal Form)
-- ============================================================================

CREATE DATABASE IF NOT EXISTS rms_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE rms_db;

-- ----------------------------------------------------------------------------
-- 1. STATIONS TABLE
-- Maps to: STATION entity
-- Normalization: 1NF, 2NF, 3NF, BCNF compliant
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stations (
    station_id INT AUTO_INCREMENT PRIMARY KEY,
    station_code VARCHAR(10) NOT NULL UNIQUE,       -- Candidate Key (e.g., 'NDLS', 'CSTM')
    station_name VARCHAR(100) NOT NULL,
    city VARCHAR(60) NOT NULL,
    zone VARCHAR(50) NOT NULL                       -- Railway Zone (e.g., 'Northern Railway')
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 2. ROUTES TABLE
-- Maps to: ROUTE entity
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS routes (
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
-- Maps to: TRAIN entity & RUNS_ON relationship
-- Source & Destination are derived strictly via routes (3NF/BCNF compliant)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trains (
    train_id INT AUTO_INCREMENT PRIMARY KEY,
    train_number VARCHAR(10) NOT NULL UNIQUE,      -- Candidate Key (e.g., '12951', '12002')
    train_name VARCHAR(100) NOT NULL,
    train_type VARCHAR(50) NOT NULL,               -- Superfast, Rajdhani, Express, Vande Bharat
    total_coaches INT NOT NULL DEFAULT 12 CHECK (total_coaches > 0),
    route_id INT NOT NULL,
    CONSTRAINT fk_train_route FOREIGN KEY (route_id) REFERENCES routes(route_id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 4. COACHES TABLE
-- Maps to: COACH entity & HAS relationship (Train 1:N Coach)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coaches (
    coach_id INT AUTO_INCREMENT PRIMARY KEY,
    train_id INT NOT NULL,
    coach_number VARCHAR(10) NOT NULL,             -- e.g., 'H1', 'A1', 'B1', 'S1'
    coach_type ENUM('1A', '2A', '3A', 'SL', 'CC', '2S') NOT NULL,
    capacity INT NOT NULL DEFAULT 72 CHECK (capacity > 0),
    base_fare DECIMAL(8, 2) NOT NULL DEFAULT 1000.00 CHECK (base_fare >= 0),
    CONSTRAINT fk_coach_train FOREIGN KEY (train_id) REFERENCES trains(train_id) ON DELETE CASCADE,
    CONSTRAINT unq_train_coach UNIQUE (train_id, coach_number)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 5. SEATS TABLE (Weak Entity dependent on COACH)
-- Maps to: SEAT entity & DIVIDED_INTO relationship
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS seats (
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
CREATE TABLE IF NOT EXISTS schedules (
    schedule_id INT AUTO_INCREMENT PRIMARY KEY,
    train_id INT NOT NULL,
    station_id INT NOT NULL,
    stop_sequence INT NOT NULL CHECK (stop_sequence >= 1),
    arrival_time TIME NULL,                        -- NULL for journey origin
    departure_time TIME NULL,                      -- NULL for final destination
    platform_no INT CHECK (platform_no > 0),
    CONSTRAINT fk_sched_train FOREIGN KEY (train_id) REFERENCES trains(train_id) ON DELETE CASCADE,
    CONSTRAINT fk_sched_station FOREIGN KEY (station_id) REFERENCES stations(station_id) ON DELETE RESTRICT,
    CONSTRAINT unq_train_stop UNIQUE (train_id, stop_sequence)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 7. PASSENGERS TABLE
-- Maps to: PASSENGER entity
-- Address is decomposed into street, city, state, pincode (1NF compliant).
-- Age is calculated via trigger / virtual computation.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS passengers (
    passenger_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    dob DATE NOT NULL,
    age INT NULL,                                  -- Maintained via Trigger trg_calculate_age
    gender ENUM('Male', 'Female', 'Other') DEFAULT 'Male',
    primary_phone VARCHAR(15) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,            -- Credentials & login
    password_hash VARCHAR(255) NOT NULL,           -- bcrypt hashed
    street VARCHAR(150),
    city VARCHAR(60) NOT NULL,
    state VARCHAR(60) NOT NULL,
    pincode VARCHAR(10) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 8. PASSENGER_PHONES TABLE (Multivalued Attribute Decomposition)
-- Maps to: phone_numbers attribute of PASSENGER (1NF compliance)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS passenger_phones (
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
CREATE TABLE IF NOT EXISTS next_of_kin (
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
-- Supports station postings and onboard train assignments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employees (
    employee_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    salary DECIMAL(10, 2) NOT NULL CHECK (salary >= 0),
    designation VARCHAR(60) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,            -- Staff authentication email
    password_hash VARCHAR(255) NOT NULL,           -- bcrypt hashed
    assigned_station_id INT NULL,                  -- Stationed at
    assigned_train_id INT NULL,                    -- Works on train
    role_on_train VARCHAR(50) NULL,                -- Role (e.g. Loco Pilot, TTE, Conductor)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_emp_station FOREIGN KEY (assigned_station_id) REFERENCES stations(station_id) ON DELETE SET NULL,
    CONSTRAINT fk_emp_train FOREIGN KEY (assigned_train_id) REFERENCES trains(train_id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 11. EMPLOYEE_PHONES TABLE (Multivalued Attribute Decomposition)
-- Maps to: phone_numbers attribute of EMPLOYEE (1NF compliance)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employee_phones (
    employee_id INT NOT NULL,
    phone_number VARCHAR(15) NOT NULL,
    PRIMARY KEY (employee_id, phone_number),
    CONSTRAINT fk_phone_employee FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 12. TICKETS TABLE
-- Maps to: TICKET entity, MAKES, COVERED_BY, and RESERVED_BY relationships
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tickets (
    ticket_id INT AUTO_INCREMENT PRIMARY KEY,
    pnr_no VARCHAR(12) NOT NULL UNIQUE,
    passenger_id INT NOT NULL,
    train_id INT NOT NULL,
    coach_id INT NOT NULL,
    seat_number INT NOT NULL,
    journey_date DATE NOT NULL,
    booking_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fare DECIMAL(8, 2) NOT NULL CHECK (fare > 0),
    status ENUM('CONFIRMED', 'CANCELLED', 'WAITLIST') DEFAULT 'CONFIRMED',
    CONSTRAINT fk_ticket_passenger FOREIGN KEY (passenger_id) REFERENCES passengers(passenger_id) ON DELETE RESTRICT,
    CONSTRAINT fk_ticket_train FOREIGN KEY (train_id) REFERENCES trains(train_id) ON DELETE RESTRICT,
    CONSTRAINT fk_ticket_seat FOREIGN KEY (coach_id, seat_number) REFERENCES seats(coach_id, seat_number) ON DELETE RESTRICT,
    CONSTRAINT unq_journey_seat UNIQUE (train_id, coach_id, seat_number, journey_date)
) ENGINE=InnoDB;

-- ============================================================================
-- ADMINISTRATIVE VIEWS
-- ============================================================================

-- View 1: Complete Train Schedule & Route Timetable
CREATE OR REPLACE VIEW vw_train_schedules AS
SELECT 
    t.train_id,
    t.train_number,
    t.train_name,
    t.train_type,
    sc.stop_sequence,
    st.station_code,
    st.station_name,
    st.city,
    sc.arrival_time,
    sc.departure_time,
    sc.platform_no,
    r.distance_km AS total_route_km,
    r.duration_hours AS total_duration_hours
FROM trains t
JOIN schedules sc ON t.train_id = sc.train_id
JOIN stations st ON sc.station_id = st.station_id
JOIN routes r ON t.route_id = r.route_id
ORDER BY t.train_id, sc.stop_sequence ASC;

-- View 2: Coach Capacity & Real-Time Utilization
CREATE OR REPLACE VIEW vw_coach_capacity_utilization AS
SELECT 
    t.train_id,
    t.train_number,
    t.train_name,
    c.coach_id,
    c.coach_number,
    c.coach_type,
    c.capacity,
    COUNT(CASE WHEN s.status = 'BOOKED' THEN 1 END) AS booked_seats,
    (c.capacity - COUNT(CASE WHEN s.status = 'BOOKED' THEN 1 END)) AS available_seats,
    ROUND((COUNT(CASE WHEN s.status = 'BOOKED' THEN 1 END) / c.capacity) * 100, 2) AS utilization_percent
FROM coaches c
JOIN trains t ON c.train_id = t.train_id
LEFT JOIN seats s ON c.coach_id = s.coach_id
GROUP BY t.train_id, t.train_number, t.train_name, c.coach_id, c.coach_number, c.coach_type, c.capacity;

-- View 3: Station Employee Rosters
CREATE OR REPLACE VIEW vw_station_employee_rosters AS
SELECT 
    e.employee_id,
    e.name AS employee_name,
    e.designation,
    e.salary,
    e.email,
    st.station_id,
    st.station_code,
    st.station_name,
    st.city AS station_city,
    st.zone,
    t.train_number AS assigned_train_number,
    t.train_name AS assigned_train_name,
    e.role_on_train
FROM employees e
LEFT JOIN stations st ON e.assigned_station_id = st.station_id
LEFT JOIN trains t ON e.assigned_train_id = t.train_id;

-- ============================================================================
-- DATABASE TRIGGERS
-- ============================================================================

DELIMITER $$

-- Trigger 1: Compute age from dob before insert or update on passengers
DROP TRIGGER IF EXISTS trg_calculate_age_insert$$
CREATE TRIGGER trg_calculate_age_insert
BEFORE INSERT ON passengers
FOR EACH ROW
BEGIN
    SET NEW.age = TIMESTAMPDIFF(YEAR, NEW.dob, CURDATE());
END$$

DROP TRIGGER IF EXISTS trg_calculate_age_update$$
CREATE TRIGGER trg_calculate_age_update
BEFORE UPDATE ON passengers
FOR EACH ROW
BEGIN
    SET NEW.age = TIMESTAMPDIFF(YEAR, NEW.dob, CURDATE());
END$$

-- Trigger 2: Ensure schedule arrival time is before or equal to departure time
DROP TRIGGER IF EXISTS trg_timein_timeout_check$$
CREATE TRIGGER trg_timein_timeout_check
BEFORE INSERT ON schedules
FOR EACH ROW
BEGIN
    IF NEW.arrival_time IS NOT NULL AND NEW.departure_time IS NOT NULL THEN
        IF NEW.arrival_time > NEW.departure_time THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Arrival time cannot be later than departure time at the same station stop.';
        END IF;
    END IF;
END$$

DELIMITER ;

-- ============================================================================
-- STORED PROCEDURE: sp_book_ticket
-- ACID-Compliant Ticket Reservation Procedure
-- ============================================================================

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_book_ticket$$
CREATE PROCEDURE sp_book_ticket(
    IN p_passenger_id INT,
    IN p_train_id INT,
    IN p_coach_id INT,
    IN p_seat_number INT,
    IN p_journey_date DATE,
    IN p_fare DECIMAL(8, 2),
    OUT p_pnr VARCHAR(12),
    OUT p_ticket_id INT,
    OUT p_status_message VARCHAR(255)
)
proc_label: BEGIN
    DECLARE v_existing_count INT DEFAULT 0;
    DECLARE v_generated_pnr VARCHAR(12);

    -- Declare rollback on any SQL exception
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_pnr = NULL;
        SET p_ticket_id = NULL;
        SET p_status_message = 'ERROR: Database transaction failed and was rolled back.';
    END;

    START TRANSACTION;

    -- Check if seat is already booked for this train, coach, seat, and journey date
    SELECT COUNT(*) INTO v_existing_count
    FROM tickets
    WHERE train_id = p_train_id
      AND coach_id = p_coach_id
      AND seat_number = p_seat_number
      AND journey_date = p_journey_date
      AND status = 'CONFIRMED'
    FOR UPDATE;

    IF v_existing_count > 0 THEN
        ROLLBACK;
        SET p_pnr = NULL;
        SET p_ticket_id = NULL;
        SET p_status_message = 'CONFLICT: Seat is already booked for this journey date.';
        LEAVE proc_label;
    END IF;

    -- Generate unique PNR
    SET v_generated_pnr = CONCAT('PNR', FLOOR(100000 + (RAND() * 900000)));

    -- Insert confirmed ticket
    INSERT INTO tickets (pnr_no, passenger_id, train_id, coach_id, seat_number, journey_date, fare, status)
    VALUES (v_generated_pnr, p_passenger_id, p_train_id, p_coach_id, p_seat_number, p_journey_date, p_fare, 'CONFIRMED');

    SET p_ticket_id = LAST_INSERT_ID();
    SET p_pnr = v_generated_pnr;

    -- Mark seat as booked in physical seat catalog
    UPDATE seats
    SET status = 'BOOKED'
    WHERE coach_id = p_coach_id AND seat_number = p_seat_number;

    COMMIT;
    SET p_status_message = 'SUCCESS: Reservation confirmed.';
END$$

DELIMITER ;
