# Railway Management System: Schema, Features, and Transactions

This guide describes the code currently in this repository. The system uses a
Node.js/Express API, static HTML/CSS/JavaScript pages, and either MySQL or an
in-memory sample-data implementation.

## 1. Running locally and initializing data

Install dependencies and start the application:

```sh
npm install
npm start
```

On startup, the server first attempts to connect to MySQL using `DB_HOST`,
`DB_USER`, `DB_PASSWORD`, `DB_NAME`, and `DB_PORT` from the process environment
or `.env`. When MySQL is available, startup creates the configured database if
necessary, applies the schema, upgrades supported legacy columns/indexes, and
runs the idempotent sample-data script. The default sample password for seeded
passenger and employee accounts is `password123`.

To explicitly apply the MySQL schema and sample data, configure MySQL and run:

```sh
npm run db:setup
```

The sample data contains stations, routes, trains, intermediate schedules,
coaches, complete seat inventories for each coach's capacity, passengers,
phone numbers, emergency contacts, employees, and example tickets. The SQL
seed uses `INSERT IGNORE` and is intended to be repeatable without duplicating
the seeded primary keys. Additional coaches are generated to match each
sample train's configured coach count; missing seats are generated up to each
coach's capacity.

If MySQL is unavailable, the server starts in standalone in-memory mode with
matching sample entities and a complete coach/seat inventory. This mode is
useful for local demonstrations and does not require a separate database
service. Its changes are held in process memory and are lost when the Node
process exits. Use MySQL for persistent data and concurrent production
bookings.

## 2. Application architecture

- `server.js` serves the `public/` pages and static assets, mounts the API
  routers, initializes the database, and exposes health/status and summary
  endpoints.
- `routes/` contains authentication, passenger profile, train search,
  booking, and employee/admin APIs.
- `database/schema.sql` defines the MySQL tables, constraints, views, triggers,
  and a legacy stored procedure.
- `database/seed_data.sql` initializes repeatable MySQL sample data.
- `database/db.js` manages MySQL startup, schema migration, query timing, and
  the in-memory fallback.
- `database/journey.js` resolves the selected journey's stop sequences and
  estimates its distance.
- `public/` contains the user, booking, dashboard, passenger inspection, and
  employee/admin interfaces.

## 3. Schema and relationships

All MySQL tables use InnoDB. The design keeps core entities in separate
relations and references them by keys rather than repeating descriptive
fields. The listed primary keys and principal relationships are:

| Table | Primary key | Purpose and relationships |
|---|---|---|
| `stations` | `station_id` | Station code, name, city, and railway zone. `station_code` is also unique. Referenced by routes, schedules, and employee assignments. |
| `routes` | `route_id` | Connects source and destination station IDs and stores full-route distance and duration. Both station references are foreign keys. |
| `trains` | `train_id` | Train identity, number, type, consist size, and `route_id`. Train number is unique; each train references one route. |
| `coaches` | `coach_id` | Coach number, class, capacity, and full-route `base_fare` for one train. `(train_id, coach_number)` is unique. |
| `seats` | `(coach_id, seat_number)` | Physical seat catalog and berth type for a coach. The coach foreign key makes a seat dependent on its coach. `status` is a general inventory field; date/segment availability is calculated from tickets. |
| `schedules` | `schedule_id` | One stop on a train's timetable, with station, sequence, times, and platform. `(train_id, stop_sequence)` is unique, and both train and station are referenced. |
| `passengers` | `passenger_id` | Passenger identity, date of birth, contact details, decomposed address, email, and password hash. Email is unique. |
| `passenger_phones` | `(passenger_id, phone_number)` | Additional phone numbers for a passenger, with an optional phone type. Passenger deletion cascades to these rows. |
| `next_of_kin` | `(passenger_id, kin_name)` | Passenger emergency contacts. Passenger deletion cascades to these rows. |
| `employees` | `employee_id` | Staff identity, designation, salary, login fields, optional station/train assignments, and onboard role. Assignment foreign keys become `NULL` when the assigned station or train is removed. |
| `employee_phones` | `(employee_id, phone_number)` | Employee phone numbers. Employee deletion cascades to these rows. |
| `tickets` | `ticket_id` | One passenger/seat reservation, with unique PNR, train, coach, seat, travel date, stop-sequence interval, fare, and status. Foreign keys reference passenger, train, and physical seat. |

The main relationships are:

```text
stations 1---N routes (as source and destination)
routes   1---N trains
trains   1---N coaches 1---N seats
trains   1---N schedules N---1 stations
passengers 1---N tickets N---1 trains
passengers 1---N passenger_phones
passengers 1---N next_of_kin
employees 1---N employee_phones
stations 1---N employees (optional assignment)
trains   1---N employees (optional assignment)
seats    1---N tickets over time and non-overlapping route segments
```

`tickets` stores `start_sequence` and `end_sequence`, which refer to the
selected train's `schedules.stop_sequence` values. They are not foreign keys
because they are a pair of stop positions scoped to a train; the application
validates them against that train's timetable.

### Views, triggers, and stored procedure

- `vw_train_schedules` joins trains, routes, schedules, and stations to provide
  a timetable-oriented view.
- `vw_coach_capacity_utilization` summarizes physical coach capacity and
  ticket utilization.
- `vw_station_employee_rosters` joins staff assignments with station and train
  details.
- Passenger insert/update triggers calculate the stored `age` from `dob`.
  Since it is trigger-maintained rather than generated on read, the stored age
  can become stale as time passes without a passenger update.
- The schedule insert trigger rejects a stop whose arrival time is later than
  its departure time when both are non-null.
- `sp_book_ticket` is a legacy full-journey SQL booking procedure. The Express
  booking endpoint does **not** call it; the endpoint's transaction described
  below is the active booking implementation.

## 4. Normalization

The relational design aims for 3NF/BCNF:

1. **First Normal Form (1NF):** Fields hold scalar values. Passenger address
   parts are separate columns; passenger and employee phone lists are stored
   as rows in their respective phone tables rather than comma-separated lists.
2. **Second Normal Form (2NF):** The composite-key relations
   `passenger_phones`, `employee_phones`, and `next_of_kin` store attributes
   dependent on their full key. Schedule stop details are keyed by the train
   and stop sequence (enforced as a unique candidate key).
3. **Third Normal Form (3NF):** Station details live in `stations`, route
   distance/duration in `routes`, coach facts in `coaches`, and passenger/train
   descriptions are not copied into ticket rows. This avoids common
   transitive-dependency update anomalies.
4. **BCNF:** The principal determinants are primary or declared candidate
   keys. Constraints and application validation additionally enforce domain
   rules such as positive distance, capacity, fare, valid forward journey
   segments, and unique per-train coach numbers.

Some stored values intentionally serve operational needs: `passengers.age` is
maintained by triggers, and ticket fare/route segment are reservation-time
facts. The design does not add a unique constraint for every conceivable
business rule (for example, duplicate route endpoints are not prohibited by
the schema).

## 5. Functionality

### Passenger-facing pages

- **Home/search (`index.html`):** Search for trains between scheduled stations
  and inspect intermediate timetable stops.
- **Registration/login (`register.html`, `login.html`):** Passenger account
  registration and login use bcrypt password hashes and issue JWTs.
- **Booking (`booking.html`):** Choose a train, forward route segment, date,
  coach, and one or more seats; view segment availability and the fare
  estimate.
- **Dashboard (`dashboard.html`):** Look up the passenger's tickets, access
  PNR details, print ticket details, and cancel a ticket.
- **Profile (`profile.html`):** Manage profile information and next-of-kin
  contacts.
- **Passenger inspection (`passenger_inspection.html`):** Staff-facing
  passenger/ticket lookup and emergency-contact verification.

### Employee/admin pages

- **Employee login (`emp_login.html`):** Staff authentication.
- **Admin panel (`admin.html`):** Passenger/user/employee directories; schedule,
  coach-capacity, and employee-roster views; train/route management; schedule
  delay updates; employee assignment; operations analytics and TTE passenger
  manifest visualizations.

### API overview

- `/api/status`, `/api/stats`, `/api/stations`, and `/api/routes`: server and
  dataset status/summary.
- `/api/auth`: passenger registration/login, staff login, and session
  verification.
- `/api/trains`: train list/search, timetables, coach lists, and date/segment
  seat availability.
- `/api/bookings`: multi-seat reservation, passenger ticket history, PNR
  lookup, and cancellation.
- `/api/passengers`: profile, directory, phone, and next-of-kin operations.
- `/api/admin`: employee directories, analytics/manifest, relational views,
  train/route creation, delay updates, and employee assignment.

The available page and API behavior is implemented in the source; a UI label
such as “Pay” does not represent a payment gateway integration. The booking
flow records the calculated fare and confirms the reservation, but does not
charge an external payment method.

## 6. Fare calculation and intermediate seat allocation

Each coach has a full-route `base_fare`. The API prorates that value by the
requested segment's distance:

```text
segment fare = coach base fare
             * estimated segment distance / full route distance
```

The timetable currently stores stop sequence, not kilometer markers. Segment
distance is therefore estimated proportionally by the difference in stop
sequence divided by the full timetable sequence span. It is not a measured
rail-distance calculation; adding per-stop kilometer markers would allow a
more accurate fare.

For each ticket, the interval is `[start_sequence, end_sequence)`. An existing
confirmed ticket conflicts only when its interval overlaps the requested one:

```text
existing.start_sequence < requested.end_sequence
AND existing.end_sequence > requested.start_sequence
```

Consequently, a seat used from one station to an intermediate stop can be
allocated again for a later non-overlapping leg on the same train and date.
Seat availability is calculated from confirmed tickets for the requested
date/segment; the seat catalog's global `status` alone does not determine
segment availability.

## 7. Ticket transaction control

### MySQL booking path

`POST /api/bookings/reserve` is the active ticket-creation path. It accepts
between one and 20 seat reservations and rejects duplicate seat numbers in the
same request. The journey is checked against the selected train's timetable
before the transaction starts. Then `db.transaction()` performs:

1. Acquire a pooled MySQL connection and call `beginTransaction()`.
2. Lock the selected coach row with `SELECT ... FOR UPDATE`, and verify it
   belongs to the selected train.
3. Calculate the fare on the server from the coach base fare and journey
   segment.
4. For each requested seat, lock and verify its physical seat row with
   `SELECT ... FOR UPDATE`.
5. Query confirmed tickets for that seat/date using the interval-overlap
   predicate and `FOR UPDATE`; reject a conflict.
6. Insert one confirmed ticket (and one unique PNR) per requested seat.
7. Commit once all reservations succeed. If validation or a database operation
   throws, roll back the entire request and return an error; no partial
   multi-seat booking is committed.

The seat-row lock serializes concurrent booking attempts for the same physical
seat before they test ticket conflicts. InnoDB unique keys, foreign keys, and
checks provide additional integrity enforcement. A PNR collision or database
deadlock fails the transaction rather than creating a partial booking.

### In-memory booking path

When MySQL is unavailable, the same endpoint validates coach, seat, passenger,
and segment data against `mockDb`. The transaction helper snapshots the
in-memory data before invoking the callback and restores it if an error occurs.
This models rollback for local demonstrations, but it does not provide
database row locks or cross-process concurrency guarantees.

### Cancellation and the legacy procedure

Ticket cancellation also uses the transaction helper: the ticket status is
changed to `CANCELLED`, and the seat catalog status may be changed back to
available when no other confirmed ticket uses it. The API reports an 80%
refund amount; this is a returned calculation, not an external payment refund.
The date/segment availability query remains based on confirmed ticket rows.

The SQL procedure `sp_book_ticket` is separate legacy functionality. It starts
and commits/rolls back its own SQL transaction and checks a full-journey seat
booking, but the Express route does not invoke it and it does not implement the
route-segment overlap behavior. For current behavior, the Node.js route and
`db.transaction()` helper are authoritative.
