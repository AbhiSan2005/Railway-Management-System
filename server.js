const express = require('express');
const cors = require('cors');
const path = require('path');
const { performance } = require('perf_hooks');
const db = require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ============================================================================
// PERFORMANCE & LATENCY MEASUREMENT MIDDLEWARE
// Injects W3C Server-Timing and diagnostic latency headers on every API call
// ============================================================================
app.use('/api', (req, res, next) => {
    req.reqStartTime = performance.now();
    req.dbDuration = 0;

    const originalJson = res.json;
    res.json = function(data) {
        const totalDuration = parseFloat((performance.now() - req.reqStartTime).toFixed(2));
        const dbDuration = parseFloat((req.dbDuration || db.getLastQueryDuration() || 0).toFixed(2));

        // Standard W3C Server-Timing header (visible in Browser DevTools Network tab)
        res.set('Server-Timing', `db;desc="MySQL Query Execution";dur=${dbDuration}, total;desc="Total Request Processing";dur=${totalDuration}`);
        
        // Custom headers for easy programmatic access
        res.set('X-Response-Time-DB', `${dbDuration}ms`);
        res.set('X-Response-Time-Total', `${totalDuration}ms`);

        // If returned data is an object (not an array), optionally embed latency metadata
        if (data && typeof data === 'object' && !Array.isArray(data) && !data.error) {
            data._latency = {
                db_ms: dbDuration,
                total_ms: totalDuration
            };
        }

        return originalJson.call(this, data);
    };

    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ============================================================================
// API ROUTES
// ============================================================================

// Health & Database Connection Status
app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        databaseEngine: db.isMock() ? 'In-Memory Simulation (Safe Mode)' : 'MySQL 8.0 Live Server',
        connectedToMySQL: !db.isMock(),
        lastDbLatencyMs: db.getLastQueryDuration()
    });
});

// Summary Stats for Dashboard
app.get('/api/stats', async (req, res) => {
    try {
        if (!db.isMock()) {
            const [trainsCount] = await db.query('SELECT COUNT(*) as count FROM trains', [], req);
            const [stationsCount] = await db.query('SELECT COUNT(*) as count FROM stations', [], req);
            const [passengersCount] = await db.query('SELECT COUNT(*) as count FROM passengers', [], req);
            const [ticketsCount] = await db.query("SELECT COUNT(*) as count FROM tickets WHERE status = 'CONFIRMED'", [], req);
            return res.json({
                trains: trainsCount.count,
                stations: stationsCount.count,
                passengers: passengersCount.count,
                activeBookings: ticketsCount.count
            });
        }
        res.json({
            trains: db.mockDb.trains.length,
            stations: db.mockDb.stations.length,
            passengers: db.mockDb.passengers.length,
            activeBookings: db.mockDb.tickets.filter(t => t.status === 'CONFIRMED').length
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 1. STATIONS
app.get('/api/stations', async (req, res) => {
    try {
        if (!db.isMock()) {
            const rows = await db.query('SELECT * FROM stations ORDER BY station_name ASC', [], req);
            return res.json(rows);
        }
        res.json(db.mockDb.stations);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. TRAINS (with optional from/to filters)
app.get('/api/trains', async (req, res) => {
    const { from, to } = req.query;
    try {
        if (!db.isMock()) {
            let sql = `
                SELECT t.train_id, t.train_number, t.train_name, t.train_type, t.total_coaches,
                       s1.station_name AS source_station, s1.station_code AS source_code,
                       s2.station_name AS destination_station, s2.station_code AS dest_code,
                       r.distance_km, r.duration_hours
                FROM trains t
                JOIN stations s1 ON t.source_station_id = s1.station_id
                JOIN stations s2 ON t.dest_station_id = s2.station_id
                JOIN routes r ON t.route_id = r.route_id
            `;
            const params = [];
            if (from && to) {
                sql += ' WHERE (t.source_station_id = ? AND t.dest_station_id = ?) ';
                params.push(from, to);
            }
            sql += ' ORDER BY t.train_number ASC';
            const rows = await db.query(sql, params, req);
            return res.json(rows);
        }

        let result = db.mockDb.trains;
        if (from && to) {
            result = result.filter(t => t.source_station_id == from && t.dest_station_id == to);
        }
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Train Schedule
app.get('/api/trains/:id/schedule', async (req, res) => {
    const trainId = req.params.id;
    try {
        if (!db.isMock()) {
            const sql = `
                SELECT sc.schedule_id, sc.train_id, sc.stop_sequence, 
                       st.station_name, st.station_code, st.city,
                       sc.arrival_time, sc.departure_time, sc.platform_no
                FROM schedules sc
                JOIN stations st ON sc.station_id = st.station_id
                WHERE sc.train_id = ?
                ORDER BY sc.stop_sequence ASC
            `;
            const rows = await db.query(sql, [trainId], req);
            return res.json(rows);
        }
        const schedules = db.mockDb.schedules.filter(s => s.train_id == trainId);
        res.json(schedules);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Train Coaches
app.get('/api/trains/:id/coaches', async (req, res) => {
    const trainId = req.params.id;
    try {
        if (!db.isMock()) {
            const rows = await db.query('SELECT * FROM coaches WHERE train_id = ?', [trainId], req);
            return res.json(rows);
        }
        const coaches = db.mockDb.coaches.filter(c => c.train_id == trainId);
        res.json(coaches);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. PASSENGERS
app.get('/api/passengers', async (req, res) => {
    try {
        if (!db.isMock()) {
            const rows = await db.query('SELECT * FROM passengers ORDER BY passenger_id DESC', [], req);
            return res.json(rows);
        }
        res.json(db.mockDb.passengers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/passengers', async (req, res) => {
    const { name, dob, gender, primary_phone, email, street, city, state, pincode } = req.body;
    if (!name || !dob || !primary_phone || !city) {
        return res.status(400).json({ error: 'Name, Date of Birth, Phone, and City are required!' });
    }

    try {
        if (!db.isMock()) {
            const sql = `
                INSERT INTO passengers (name, dob, gender, primary_phone, email, street, city, state, pincode)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const result = await db.query(sql, [name, dob, gender || 'Male', primary_phone, email || null, street || '', city, state || '', pincode || ''], req);
            return res.status(201).json({ message: 'Passenger registered successfully', passengerId: result.insertId });
        }

        const birthYear = new Date(dob).getFullYear();
        const currentYear = new Date().getFullYear();
        const calculatedAge = currentYear - birthYear;

        const newPassenger = {
            passenger_id: db.mockDb.passengers.length + 1,
            name,
            dob,
            age: calculatedAge,
            gender: gender || 'Male',
            primary_phone,
            email: email || '',
            street: street || '',
            city,
            state: state || '',
            pincode: pincode || ''
        };
        db.mockDb.passengers.unshift(newPassenger);
        res.status(201).json({ message: 'Passenger registered successfully', passenger: newPassenger });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. TICKETS
app.get('/api/tickets', async (req, res) => {
    const { pnr } = req.query;
    try {
        if (!db.isMock()) {
            let sql = `
                SELECT tk.ticket_id, tk.pnr_number, p.name AS passenger_name, p.primary_phone,
                       t.train_number, t.train_name, c.coach_code, c.coach_type,
                       tk.seat_number, tk.journey_date, tk.booking_date, tk.fare, tk.status
                FROM tickets tk
                JOIN passengers p ON tk.passenger_id = p.passenger_id
                JOIN trains t ON tk.train_id = t.train_id
                JOIN coaches c ON tk.coach_id = c.coach_id
            `;
            const params = [];
            if (pnr) {
                sql += ' WHERE tk.pnr_number = ? ';
                params.push(pnr);
            }
            sql += ' ORDER BY tk.ticket_id DESC';
            const rows = await db.query(sql, params, req);
            return res.json(rows);
        }

        let result = db.mockDb.tickets;
        if (pnr) {
            result = result.filter(t => t.pnr_number.toLowerCase() === pnr.toLowerCase().trim());
        }
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Book Ticket
app.post('/api/tickets', async (req, res) => {
    const { passenger_id, train_id, coach_id, seat_number, journey_date, fare } = req.body;
    if (!passenger_id || !train_id || !coach_id || !seat_number || !journey_date) {
        return res.status(400).json({ error: 'All booking fields are required.' });
    }

    const pnr_number = 'PNR' + Math.floor(100000 + Math.random() * 900000);

    try {
        if (!db.isMock()) {
            const checkSql = `
                SELECT ticket_id FROM tickets 
                WHERE train_id = ? AND coach_id = ? AND seat_number = ? AND journey_date = ? AND status = 'CONFIRMED'
            `;
            const existing = await db.query(checkSql, [train_id, coach_id, seat_number, journey_date], req);
            if (existing && existing.length > 0) {
                return res.status(409).json({ error: 'Seat ' + seat_number + ' is already booked for this date.' });
            }

            const insertSql = `
                INSERT INTO tickets (pnr_number, passenger_id, train_id, coach_id, seat_number, journey_date, fare, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'CONFIRMED')
            `;
            const result = await db.query(insertSql, [pnr_number, passenger_id, train_id, coach_id, seat_number, journey_date, fare || 1500.00], req);
            return res.status(201).json({ message: 'Reservation confirmed.', pnr: pnr_number, ticketId: result.insertId });
        }

        // Mock verification
        const conflict = db.mockDb.tickets.find(t => 
            t.train_id == train_id && 
            t.coach_id == coach_id && 
            t.seat_number == seat_number && 
            t.journey_date === journey_date && 
            t.status === 'CONFIRMED'
        );
        if (conflict) {
            return res.status(409).json({ error: 'Seat ' + seat_number + ' is already booked on ' + journey_date + '.' });
        }

        const passenger = db.mockDb.passengers.find(p => p.passenger_id == passenger_id);
        const train = db.mockDb.trains.find(t => t.train_id == train_id);
        const coach = db.mockDb.coaches.find(c => c.coach_id == coach_id);

        const newTicket = {
            ticket_id: db.mockDb.tickets.length + 1,
            pnr_number,
            passenger_id: parseInt(passenger_id),
            passenger_name: passenger ? passenger.name : 'Unknown',
            primary_phone: passenger ? passenger.primary_phone : 'N/A',
            train_id: parseInt(train_id),
            train_number: train ? train.train_number : '10000',
            train_name: train ? train.train_name : 'Express',
            coach_id: parseInt(coach_id),
            coach_code: coach ? coach.coach_code : 'B1',
            coach_type: coach ? coach.coach_type : '3A',
            seat_number: parseInt(seat_number),
            journey_date,
            booking_date: new Date().toISOString().replace('T', ' ').substring(0, 19),
            fare: parseFloat(fare) || (coach ? coach.base_fare : 1500),
            status: 'CONFIRMED'
        };

        db.mockDb.tickets.unshift(newTicket);
        res.status(201).json({ message: 'Reservation confirmed.', ticket: newTicket, pnr: pnr_number });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Cancel Ticket
app.put('/api/tickets/:id/cancel', async (req, res) => {
    const ticketId = req.params.id;
    try {
        if (!db.isMock()) {
            await db.query("UPDATE tickets SET status = 'CANCELLED' WHERE ticket_id = ?", [ticketId], req);
            return res.json({ message: 'Reservation ' + ticketId + ' cancelled successfully.' });
        }
        const ticket = db.mockDb.tickets.find(t => t.ticket_id == ticketId);
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        ticket.status = 'CANCELLED';
        res.json({ message: 'Reservation ' + ticket.pnr_number + ' cancelled successfully.', ticket });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start Server
async function startServer() {
    await db.initDatabase();
    app.listen(PORT, () => {
        console.log(`=======================================================`);
        console.log(`RailTransit System active on http://localhost:${PORT}`);
        console.log(`Server-Timing & DB Latency Profiler: ENABLED`);
        console.log(`=======================================================`);
    });
}
startServer();
