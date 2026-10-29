# 🚆 Railway Management System (Database & Frontend)

A simplified, normalized, and modern Railway Management System based on an Entity-Relationship (ER) diagram. Built using **MySQL 8.0**, **Node.js / Express**, and a responsive modern **HTML5/CSS3/JavaScript** frontend dashboard.

---

## 🌟 Key Features

1. **Simplified Relational Schema**: Converts a 10-entity complex ER diagram into an optimized, practical database design adhering to **1NF, 2NF, 3NF, and BCNF**.
2. **Integrity Constraints**: Complete implementation of Primary Keys, Foreign Keys (`CASCADE` and `RESTRICT`), Unique constraints, Check constraints, and Virtual Generated Columns.
3. **Interactive Frontend Dashboard**:
   - 🔍 **Train Search & Timetable**: Filter trains by source and destination, with real-time arrival/departure/platform modals.
   - 🎫 **Ticket Booking**: Interactive reservation with passenger selection, coach class selection, and unique seat-date collision checks.
   - 📋 **PNR Lookup & Cancellation**: View confirmed bookings and execute cancellations.
   - 👥 **Passenger Directory**: Registration with composite address decomposition and computed age.
   - 📊 **ER & Normalization Guide**: Built-in inspector tab explaining each normalization step and constraint.
4. **Dual Mode Execution**:
   - Connects to your live **MySQL Database**.
   - If MySQL credentials are not yet configured, automatically operates in **Standalone In-Memory Simulation Mode** with pre-populated seed data so you can test immediately.

---

## 🚀 Quick Start Guide

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup MySQL Database
Open your MySQL terminal or MySQL Workbench and run:
```sql
SOURCE database/schema.sql;
SOURCE database/seed_data.sql;
```
*(Or via command line: `mysql -u root -p < database/schema.sql` and `mysql -u root -p railway_db < database/seed_data.sql`)*

### 3. Configure Database Credentials (Optional)
Copy `.env.example` to `.env`:
```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=railway_db
DB_PORT=3306
PORT=3000
```
*(Note: If you skip this, the application runs automatically in safe in-memory simulation mode).*

### 4. Run the Server
```bash
npm start
```
Open **`http://localhost:3000`** in your browser!

---

## 📐 ER Diagram Simplification & Mapping

The original ER diagram contains multiple weak entities, composite attributes, derived attributes, and peripheral HR entities:

| Original ER Element | ER Construct | Relational Implementation | Normalization Benefit |
| :--- | :--- | :--- | :--- |
| **`PASSENGER.address`** | Composite Attribute | Decomposed into `street`, `city`, `state`, `pincode` | **1NF Compliance** (Atomic values) |
| **`PASSENGER.age`** | Derived Attribute | `age INT GENERATED ALWAYS AS (TIMESTAMPDIFF(YEAR, dob, CURDATE())) VIRTUAL` | Prevents update anomalies as time elapses |
| **`PASSENGER.phone_numbers`** | Multivalued Attribute | Primary phone on `passengers`, secondary phones in `passenger_phones(passenger_id, phone_number)` | **1NF Compliance** |
| **`NEXT_OF_KIN`** | Weak Entity | Composite PK `(passenger_id, kin_name)` with `ON DELETE CASCADE` | Referential entity integrity |
| **`SCHEDULE`** | Weak / Associative Entity | Composite PK `(train_id, stop_sequence)` with FK to `stations` | **2NF Compliance** (No partial dependency) |
| **`SEAT` & `COACH`** | Hierarchical Entities | `coaches` (1:N) & `seats` (Weak entity with composite PK `coach_id, seat_number`) | Streamlined querying |
| **`EMPLOYEE`** | Peripheral Entity | Modeled in SQL schema (`employees`), decoupled from booking path | Simplifies transactional performance |

---

## 🔬 Database Normalization

### 1. First Normal Form (1NF)
- **Condition:** Every column must hold atomic (indivisible) values, and there are no repeating groups.
- **Applied here:**
  - `address` was composite $\to$ split into `street`, `city`, `state`, `pincode`.
  - `phone_numbers` was multivalued $\to$ primary phone stored as a single scalar, extra numbers stored in `passenger_phones` table.
  - Redundant derived attribute `age` is calculated virtually from `dob`.

### 2. Second Normal Form (2NF)
- **Condition:** Must be in 1NF and have **no partial functional dependencies** (no non-key attribute depends on a proper subset of any candidate key).
- **Applied here:**
  - Weak entity `schedules` has candidate key `(train_id, stop_sequence)`. Attributes like `arrival_time` and `departure_time` depend on the *entire* key.
  - Station metadata (`station_name`, `city`, `zone`) is placed in the `stations` table rather than `schedules`, ensuring no partial dependencies exist.

### 3. Third Normal Form (3NF)
- **Condition:** Must be in 2NF and have **no transitive functional dependencies** ($X \to Y \to Z$ where $Z$ is a non-prime attribute).
- **Applied here:**
  - In `tickets`, we only reference `passenger_id`, `train_id`, and `coach_id`.
  - We do *not* store passenger name, train name, or coach type in the `tickets` table. If we did, `ticket_id -> passenger_id -> passenger_name` would create an update/deletion anomaly.

### 4. Boyce-Codd Normal Form (BCNF)
- **Condition:** For every non-trivial functional dependency $X \to Y$, $X$ must be a superkey.
- Every determinant across our tables is a candidate key.

---

## 🛡️ Database Constraints

| Constraint | Purpose | Example in our Schema |
| :--- | :--- | :--- |
| **`PRIMARY KEY`** | Entity Integrity (Unique & Not Null) | `station_id`, `train_id`, `(train_id, stop_sequence)` |
| **`FOREIGN KEY`** | Referential Integrity | `train_id REFERENCES trains(train_id) ON DELETE CASCADE` |
| **`UNIQUE`** | Duplicate prevention | `UNIQUE (train_id, coach_id, seat_number, journey_date)` |
| **`CHECK`** | Domain verification | `CHECK (distance_km > 0)`, `CHECK (fare > 0)` |
| **`NOT NULL`** | Required attributes | Station code, train name, passenger name, etc. |
| **`DEFAULT`** | Default fallback values | `booking_date DEFAULT CURRENT_TIMESTAMP`, `status DEFAULT 'CONFIRMED'` |
