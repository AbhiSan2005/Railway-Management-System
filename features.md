# Railway Management System — Feature Matrix & Project Roadmap

## 1. Project Overview & Objectives
This project is a web-based **Railway Management System** built using **Vanilla HTML5, CSS3, JavaScript (ES6)** on the frontend, and **Node.js (Express)** with **MySQL** on the backend (including an in-memory 3NF fallback). 

The primary evaluation focus is on **Database Architecture, Normalization, ACID Transactions, Views, Triggers, and Stored Procedures**.

---

## 2. Multi-Page Architecture & Navigation Structure
The application transitions from a single-page layout to a modular, multi-page layout with a shared responsive sidebar navigation component.

### Page Breakdown
| Page | File | Target Audience | Primary Function | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Landing & Station Search** | `index.html` | Public / All | Search trains between stations, view intermediate halts and schedules | Completed |
| **User Authentication** | `login.html` / `register.html` | Passengers | Register new passenger account, login with bcrypt password validation | Completed |
| **Employee Portal** | `emp_login.html` | Employees / Admin | Dedicated staff login portal for administrative access | Completed |
| **Train & Seat Booking** | `booking.html` | Passengers | Interactive coach/seat grid, passenger selection, ACID ticket creation | Completed |
| **Passenger Dashboard** | `dashboard.html` | Passengers | View active tickets, print e-tickets, cancel bookings, profile management | Completed |
| **Emergency Contacts** | `profile.html` | Passengers | CRUD operations for Next of Kin (emergency contacts), composite address | Completed |
| **Admin Management Panel** | `admin.html` | Admin / Employees | Add trains/coaches, manage routes, update delays, view staff rosters | Completed |
| **Passenger Lookup (Staff)** | `passenger_inspection.html` | Employees | Search passenger profiles, verify tickets, view emergency contacts | Completed |

---

## 3. Database Schema & Normalization Analysis

The database maps directly to the 9-Entity ER diagram, achieving **Boyce-Codd Normal Form (BCNF) / Third Normal Form (3NF)** across all relations.

### Normalization Breakdown by Table

#### 1. `PASSENGER` (3NF / BCNF)
* **Attributes:** `passenger_id` (PK), `name`, `dob`, `street`, `city`, `state`, `pincode`, `email`, `password_hash`
* **1NF:** Address is decomposed into composite fields (`street`, `city`, `state`, `pincode`). `phone_numbers` is extracted to a separate `passenger_phones` table to prevent non-atomic CSV entries.
* **2NF & 3NF:** Primary key is single-column `passenger_id`. No partial or transitive dependencies exist.

#### 2. `PASSENGER_PHONES` (1NF / BCNF)
* **Attributes:** `passenger_id` (FK), `phone_number`
* **Primary Key:** `(passenger_id, phone_number)`
* Resolves the multivalued phone number attribute.

#### 3. `NEXT_OF_KIN` (Weak Entity — BCNF)
* **Attributes:** `passenger_id` (FK), `kin_name`, `relation`, `phone_number`
* **Primary Key:** `(passenger_id, kin_name)`
* Owner entity: `PASSENGER`. Discriminator key is `kin_name`. Total participation.

#### 4. `TRAIN` (BCNF)
* **Attributes:** `train_id` (PK), `train_number`, `train_name`, `train_type`, `total_coaches`, `route_id`
* Transitive redundancy removed: `source_station_id` and `dest_station_id` are derived via `routes`. Determinant `train_id` is a superkey for all FDs.

#### 5. `STATION` (BCNF)
* **Attributes:** `station_id` (PK), `station_code`, `station_name`, `city`, `zone`
* Determinant `station_id` is a superkey for all FDs.

#### 6. `ROUTE` (BCNF)
* **Attributes:** `route_id` (PK), `source_station_id` (FK), `destination_station_id` (FK), `distance_km`, `duration_hours`
* Determinant `route_id` is a superkey for all FDs.

#### 7. `COACH` (BCNF)
* **Attributes:** `coach_id` (PK), `train_id` (FK), `coach_number` (e.g., 'B1', 'S1'), `coach_type` (1A/2A/3A/SL/CC), `capacity`, `base_fare`
* Primary key `coach_id` uniquely identifies each coach attached to a train.

#### 8. `SEAT` (Weak Entity — BCNF)
* **Attributes:** `coach_id` (FK), `seat_number`, `berth_type` (Lower/Middle/Upper/Side), `status` (Available/Booked)
* **Primary Key:** `(coach_id, seat_number)`
* Owner entity: `COACH`. Total participation.

#### 9. `SCHEDULE` (Weak Entity — BCNF)
* **Attributes:** `schedule_id` (PK), `train_id` (FK), `station_id` (FK), `stop_sequence`, `arrival_time`, `departure_time`, `platform_no`
* **Candidate Key:** `(train_id, stop_sequence)`
* Owner entities: `TRAIN` & `STATION`.

#### 10. `TICKET` (Associative Entity — BCNF)
* **Attributes:** `ticket_id` (PK), `pnr_no` (Unique), `passenger_id` (FK), `train_id` (FK), `coach_id` (FK), `seat_number`, `booking_date`, `journey_date`, `fare`, `status` (Confirmed/Cancelled)
* Resolves the $M:N$ booking relation between `PASSENGER`, `TRAIN`, and `SEAT`.

#### 11. `EMPLOYEE` (BCNF)
* **Attributes:** `employee_id` (PK), `name`, `salary`, `designation`, `assigned_station_id` (FK), `assigned_train_id` (FK), `role_on_train`, `email`, `password_hash`
* Handles dual posting: station staff (`assigned_station_id`) vs onboard train crew (`assigned_train_id`).

#### 12. `EMPLOYEE_PHONES` (1NF / BCNF)
* **Attributes:** `employee_id` (FK), `phone_number`
* **Primary Key:** `(employee_id, phone_number)`
* Resolves multivalued employee contact numbers.

---

## 4. Detailed Feature Checklist & Modules

### Module 1: Authentication & User Roles
- [x] **Feature 1.1: Passenger Registration & Login**
  - **Description:** Password hashing using `bcrypt`. Issues JWT session upon verification.
  - **Dependencies:** `PASSENGER`, `PASSENGER_PHONES` tables.
- [x] **Feature 1.2: Dedicated Employee Login**
  - **Description:** Separate portal (`emp_login.html`) for conductors, station managers, and admins.
  - **Dependencies:** `EMPLOYEE` table.

### Module 2: Passenger Profile & Emergency Contact Management
- [x] **Feature 2.1: Passenger Profile CRUD**
  - **Description:** Update address components (`street`, `city`, `state`, `pincode`) and phone numbers.
  - **Dependencies:** Feature 1.1, `PASSENGER` table.
- [x] **Feature 2.2: Next of Kin (Emergency Contact) Management**
  - **Description:** Add, view, and remove emergency contact records tied to the logged-in passenger.
  - **Dependencies:** Feature 1.1, `NEXT_OF_KIN` table.

### Module 3: Train Search & Schedule Lookup
- [x] **Feature 3.1: Direct & Intermediate Station Search**
  - **Description:** Search for trains running between Origin and Destination by querying sequence numbers in `SCHEDULE`.
  - **Dependencies:** `TRAIN`, `STATION`, `SCHEDULE` tables.
- [x] **Feature 3.2: Intermediate Halts Display**
  - **Description:** View full timetable (arrival, departure, platform number, sequence) for any selected train.
  - **Dependencies:** Feature 3.1, `vw_train_schedules` view.

### Module 4: Interactive Booking & Real-Time Seat Selection
- [x] **Feature 4.1: Coach Filter & Seat Layout Grid**
  - **Description:** Visual grid showing coaches (1A, 2A, 3A, Sleeper, Chair Car) and individual seat status (Available = Green, Booked = Red, Selected = Blue).
  - **Dependencies:** `COACH`, `SEAT` tables.
- [x] **Feature 4.2: ACID-Compliant Ticket Reservation Transaction**
  - **Description:** Execute a MySQL transaction (`START TRANSACTION ... COMMIT / ROLLBACK`) with `SELECT ... FOR UPDATE` row locks to check seat availability, create a `TICKET` row, and lock the seat.
  - **Dependencies:** Feature 4.1, `TICKET`, `SEAT` tables.

### Module 5: Passenger Dashboard & Ticket Operations
- [x] **Feature 5.1: Active & Past Ticket History**
  - **Description:** Display booked tickets with train info, coach, seat number, PNR, and travel dates.
  - **Dependencies:** Feature 4.2, `TICKET` table.
- [x] **Feature 5.2: Ticket Cancellation & Auto Seat Freeing**
  - **Description:** Cancel a booked ticket using an atomic transaction that flips `TICKET.status` to 'Cancelled' and frees the seat.
  - **Dependencies:** Feature 5.1.
- [x] **Feature 5.3: Printable E-Ticket Generation**
  - **Description:** Clean, printable view for confirmed tickets.
  - **Dependencies:** Feature 5.1.

### Module 6: Administrative Panel & Operations
- [x] **Feature 6.1: Train & Coach Management**
  - **Description:** Interface to add new trains, assign routes, attach coaches, and auto-generate seat records.
  - **Dependencies:** `TRAIN`, `COACH`, `SEAT`, `ROUTE` tables.
- [x] **Feature 6.2: Employee Schedule & Deployment Management**
  - **Description:** Assign employees to stations or trains and view duty rosters.
  - **Dependencies:** `EMPLOYEE`, `STATION`, `TRAIN` tables.
- [x] **Feature 6.3: Train Delay & Platform Update**
  - **Description:** Update arrival/departure times or change platform numbers on schedules.
  - **Dependencies:** `SCHEDULE` table.

### Module 7: Staff Inspection Portal
- [x] **Feature 7.1: Passenger Search & Verification**
  - **Description:** Search passengers by PNR or ID to view their travel status, assigned seat, and emergency contact details.
  - **Dependencies:** Feature 1.2, `PASSENGER`, `NEXT_OF_KIN`, `TICKET` tables.

---

## 5. Required Database Objects (Views, Triggers & Transactions)

### Administrative Views
1. **`vw_train_schedules`**: Joins `TRAIN`, `SCHEDULE`, and `STATION` to display formatted route timetables.
2. **`vw_coach_capacity_utilization`**: Aggregates `SEAT` statuses grouped by `train_id`, `coach_id`, and `coach_type` to show percentage occupancy.
3. **`vw_station_employee_rosters`**: Displays all employees posted at each station alongside their designation and contact info.

### Triggers & Procedures
1. **`trg_calculate_age_insert` / `trg_calculate_age_update`**: Automatically computes passenger age from `dob`.
2. **`trg_timein_timeout_check`**: Validates that `arrival_time <= departure_time` on schedule insertions.
3. **`sp_book_ticket`**: Stored procedure wrapping seat lookup, availability assertion, ticket insertion, and seat locking inside a single transaction.
