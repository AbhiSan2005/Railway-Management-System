# Railway Management System — Project Directory Structure & File Map

## 1. Directory Tree Representation

```text
railway-management-system/
├── .env.example                  # Environment variable template (DB_HOST, DB_USER, etc.)
├── .gitignore                    # Node modules, environment files, OS metadata
├── README.md                     # Project overview and setup instructions
├── features.md                   # Complete feature specification and normalization guide
├── structure.md                  # Comprehensive folder and file breakdown
├── package.json                  # Node.js dependencies (express, mysql2, bcrypt, cors, dotenv)
├── package-lock.json             # Locked dependency versions
├── server.js                     # Express application entry point & API mount point
│
├── database/                     # MySQL Database Scripts & Connection Logic
│   ├── db.js                     # MySQL connection pool, transaction helper & mock fallback
│   ├── schema.sql                # Complete 11-table DDL, Views, Triggers & Stored Procedures
│   └── seed_data.sql             # Real-world Indian Railways sample dataset
│
├── routes/                       # Express API Route Handlers
│   ├── auth.js                   # Passenger & Employee authentication (bcrypt hashing)
│   ├── passengers.js             # Passenger profile & Next of Kin CRUD endpoints
│   ├── trains.js                 # Train search, schedules, coaches, and seat status grid
│   ├── bookings.js               # ACID ticket booking & cancellation transactions
│   └── admin.js                  # Operational views, train/route creation & staff rosters
│
└── public/                       # Plain HTML/CSS/JS Frontend
    ├── css/
    │   └── styles.css            # Responsive CSS design system, sidebar layout & seat grid
    │
    ├── js/
    │   ├── sidebar.js            # Injects dynamic sidebar navigation into all HTML pages
    │   ├── search.js             # Controller for Landing page train search & timetable modal
    │   ├── auth.js               # Controller for Passenger & Employee login/register
    │   ├── booking.js            # Controller for Interactive Seat Grid & Booking
    │   ├── dashboard.js          # Controller for Passenger Tickets & Cancellations
    │   ├── profile.js            # Controller for Emergency Contacts & Address management
    │   ├── admin.js              # Controller for Admin Panel, Schedule updates & Rosters
    │   └── inspection.js         # Controller for Staff Passenger Lookup Portal
    │
    ├── index.html                # Public Landing Page & Train/Schedule Search
    ├── login.html                # Passenger Login Portal
    ├── register.html             # Passenger Registration Form
    ├── emp_login.html            # Dedicated Staff/Employee Login Portal
    ├── booking.html              # Interactive Seat Selection & Ticket Booking
    ├── dashboard.html            # Passenger Dashboard (Active/Past Tickets & E-Tickets)
    ├── profile.html              # Emergency Contacts (Next of Kin) & Profile Settings
    ├── admin.html                # Admin Panel (Trains, Schedules, Staff Rosters)
    └── passenger_inspection.html # Staff Passenger Verification & Emergency Lookup
```

---

## 2. File Responsibilities & Feature Mapping

### Core Backend & Configuration

| File | Purpose & Responsibility | Associated Features |
| :--- | :--- | :--- |
| `server.js` | Entry point. Configures Express middleware, mounts API route modules under `/api`, serves static frontend files, and monitors server latency. | Core Application Setup |
| `database/db.js` | Initializes `mysql2/promise` pool. Provides `query()` and `transaction()` helper methods for ACID compliance. Includes in-memory mock fallback for offline development. | Database Connectivity, ACID Transactions |
| `database/schema.sql` | Contains DDL for 11 normalized tables (3NF/BCNF), primary/foreign keys (`ON DELETE CASCADE`), administrative views, triggers, and stored procedures. | Database Schema & Normalization |
| `database/seed_data.sql` | Inserts rich test dataset covering stations, routes, trains, coaches, seats, passengers, emergency contacts, employees, and sample tickets. | Practical Evaluation & Testing |

---

### Backend API Routers (`routes/`)

| File | Primary Endpoints | Key Responsibilities |
| :--- | :--- | :--- |
| `routes/auth.js` | `POST /api/auth/register`<br>`POST /api/auth/login`<br>`POST /api/auth/emp-login` | Password hashing via `bcrypt`. Verifies passenger and staff credentials. |
| `routes/passengers.js` | `GET/PUT /api/passengers/profile`<br>`GET/POST/DELETE /api/passengers/kin` | Handles passenger profile updates and Next of Kin (Emergency Contact) CRUD operations. |
| `routes/trains.js` | `GET /api/trains/search`<br>`GET /api/trains/:id/schedule`<br>`GET /api/trains/:id/seats` | Executes station-to-station route queries, retrieves timetable sequences, and generates real-time seat availability maps. |
| `routes/bookings.js` | `POST /api/bookings/reserve`<br>`GET /api/bookings/my-tickets`<br>`PUT /api/bookings/:id/cancel` | Wraps seat verification, ticket creation, and seat locking inside an ACID MySQL transaction. Handles cancellations. |
| `routes/admin.js` | `POST /api/admin/trains`<br>`GET /api/admin/views/rosters`<br>`PUT /api/admin/schedules/delay` | Provides administrative control over train lines, schedule adjustments, and staff duty rosters. |

---

### Frontend HTML Pages (`public/`)

| Page File | Target User | Description & Key Functionality |
| :--- | :--- | :--- |
| `index.html` | Public / All | Station-to-station train search, intermediate halt timetable modal, operational system metrics. |
| `login.html` | Passengers | Clean login form for registered passengers with link to registration. |
| `register.html` | Passengers | Form collecting full legal name, date of birth, primary phone, email, and composite address fields. |
| `emp_login.html` | Staff / Admin | Dedicated staff login portal for conductors, station masters, and system administrators. |
| `booking.html` | Passengers | Visual coach selection tab and interactive seat grid (Available = Green, Booked = Red, Selected = Blue). |
| `dashboard.html` | Passengers | Displays active and past booked tickets, PNR lookup, printable e-ticket modal, and cancellation options. |
| `profile.html` | Passengers | Profile management panel allowing users to manage Next of Kin (Emergency Contacts) and update personal info. |
| `admin.html` | Staff / Admin | Admin panel to add new trains/coaches, assign routes, update train delays/platforms, and view employee rosters. |
| `passenger_inspection.html` | Staff | Ticket inspector portal to look up passengers by PNR or ID and view their emergency contacts and assigned seats. |

---

### Frontend Shared Assets (`public/css/` & `public/js/`)

| File | Purpose & Functionality |
| :--- | :--- |
| `public/css/styles.css` | Comprehensive stylesheet containing sidebar navigation CSS, responsive grid layouts, status badges, modal styles, and the interactive seat selection layout. |
| `public/js/sidebar.js` | Client-side script injected on page load. Renders a responsive sidebar with navigation links adapted to the logged-in user state (Guest vs Passenger vs Employee). |
| `public/js/search.js` | Event listeners and API calls for route search, station dropdowns, and schedule timetable modal on `index.html`. |
| `public/js/auth.js` | Form handlers for passenger registration, login, employee login, and session token/cookie management. |
| `public/js/booking.js` | Interactive seat grid builder, coach tab switching, fare calculation, and submission of the booking transaction. |
| `public/js/dashboard.js` | Fetches passenger booking history, renders e-tickets, and triggers cancellation requests. |
| `public/js/profile.js` | Form handlers for profile updates and dynamic rendering of Next of Kin emergency contact rows with Add/Delete actions. |
| `public/js/admin.js` | Form handlers for train/coach creation, schedule delay updates, and rendering administrative database views. |
| `public/js/inspection.js` | Handles PNR and passenger search queries for onboard conductors and station staff. |

---

## 3. Implementation Plan & Order of Execution

1. **Database Foundation**: Update `database/schema.sql` and `database/seed_data.sql` with complete entities, weak relations, views, triggers, and stored procedures.
2. **Backend Routers**: Create the Express routers in `routes/` (`auth.js`, `passengers.js`, `trains.js`, `bookings.js`, `admin.js`) and mount them in `server.js`.
3. **Frontend System**: Update `public/css/styles.css` and create `public/js/sidebar.js` for navigation across all HTML pages.
4. **Page Implementation**: Build the individual HTML pages and their corresponding JS controllers module by module.