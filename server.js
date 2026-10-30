const express = require('express');
const cors = require('cors');
const path = require('path');
const { performance } = require('perf_hooks');
const db = require('./database/db');

// Route modules
const authRoutes = require('./routes/auth');
const passengerRoutes = require('./routes/passengers');
const trainRoutes = require('./routes/trains');
const bookingRoutes = require('./routes/bookings');
const adminRoutes = require('./routes/admin');

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

        // Standard W3C Server-Timing header
        res.set('Server-Timing', `db;desc="MySQL Query Execution";dur=${dbDuration}, total;desc="Total Request Processing";dur=${totalDuration}`);
        
        // Custom headers for easy programmatic access
        res.set('X-Response-Time-DB', `${dbDuration}ms`);
        res.set('X-Response-Time-Total', `${totalDuration}ms`);

        // If returned data is an object (not an array), embed latency metadata
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

// Serve static frontend assets from public directory
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================================
// MOUNT API ROUTE MODULES
// ============================================================================
app.use('/api/auth', authRoutes);
app.use('/api/passengers', passengerRoutes);
app.use('/api/trains', trainRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/admin', adminRoutes);

// ============================================================================
// CORE SYSTEM & UTILITY API ENDPOINTS
// ============================================================================

// Health & Database Connection Status
app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        databaseEngine: db.isMock() ? 'In-Memory Simulation (3NF/BCNF Safe Mode)' : 'MySQL 8.0 Live Server',
        connectedToMySQL: !db.isMock(),
        lastDbLatencyMs: db.getLastQueryDuration()
    });
});

// Global Summary Metrics
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

// Stations List
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

// Routes List
app.get('/api/routes', async (req, res) => {
    try {
        if (!db.isMock()) {
            const sql = `
                SELECT 
                    r.route_id, r.distance_km, r.duration_hours,
                    s1.station_name AS source_station, s1.station_code AS source_code,
                    s2.station_name AS destination_station, s2.station_code AS dest_code
                FROM routes r
                JOIN stations s1 ON r.source_station_id = s1.station_id
                JOIN stations s2 ON r.destination_station_id = s2.station_id
                ORDER BY r.route_id ASC
            `;
            const rows = await db.query(sql, [], req);
            return res.json(rows);
        }

        const list = db.mockDb.routes.map(r => {
            const s1 = db.mockDb.stations.find(s => s.station_id === r.source_station_id);
            const s2 = db.mockDb.stations.find(s => s.station_id === r.destination_station_id);
            return {
                route_id: r.route_id,
                source_station: s1 ? s1.station_name : 'Unknown',
                source_code: s1 ? s1.station_code : '',
                destination_station: s2 ? s2.station_name : 'Unknown',
                dest_code: s2 ? s2.station_code : '',
                distance_km: r.distance_km,
                duration_hours: r.duration_hours
            };
        });
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start Server
async function startServer() {
    await db.initDatabase();
    app.listen(PORT, () => {
        console.log(`=======================================================`);
        console.log(`RailTransit Operations active on http://localhost:${PORT}`);
        console.log(`Architecture: 3NF/BCNF Relational System`);
        console.log(`Server-Timing & DB Latency Profiler: ENABLED`);
        console.log(`=======================================================`);
    });
}

if (require.main === module) {
    startServer();
}

module.exports = app;
