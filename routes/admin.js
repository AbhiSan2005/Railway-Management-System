const express = require('express');
const router = express.Router();
const db = require('../database/db');

// ----------------------------------------------------------------------------
// ADMIN VIEW: ALL TRAIN SCHEDULES (vw_train_schedules)
// ----------------------------------------------------------------------------
router.get('/views/schedules', async (req, res) => {
    try {
        if (!db.isMock()) {
            const rows = await db.query('SELECT * FROM vw_train_schedules', [], req);
            return res.json(rows);
        }

        const schedules = [];
        db.mockDb.trains.forEach(t => {
            const stops = db.mockDb.schedules.filter(s => s.train_id === t.train_id).sort((a, b) => a.stop_sequence - b.stop_sequence);
            const r = db.mockDb.routes.find(route => route.route_id === t.route_id);
            stops.forEach(sc => {
                const st = db.mockDb.stations.find(station => station.station_id === sc.station_id);
                schedules.push({
                    train_id: t.train_id,
                    train_number: t.train_number,
                    train_name: t.train_name,
                    train_type: t.train_type,
                    stop_sequence: sc.stop_sequence,
                    station_code: st ? st.station_code : '',
                    station_name: st ? st.station_name : 'Unknown',
                    city: st ? st.city : '',
                    arrival_time: sc.arrival_time,
                    departure_time: sc.departure_time,
                    platform_no: sc.platform_no,
                    total_route_km: r ? r.distance_km : 0,
                    total_duration_hours: r ? r.duration_hours : 0
                });
            });
        });
        res.json(schedules);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------------------------------
// ADMIN VIEW: COACH CAPACITY & OCCUPANCY UTILIZATION (vw_coach_capacity_utilization)
// ----------------------------------------------------------------------------
router.get('/views/capacity', async (req, res) => {
    try {
        if (!db.isMock()) {
            const rows = await db.query('SELECT * FROM vw_coach_capacity_utilization', [], req);
            return res.json(rows);
        }

        const utilization = db.mockDb.coaches.map(c => {
            const train = db.mockDb.trains.find(t => t.train_id === c.train_id);
            const coachSeats = db.mockDb.seats.filter(s => s.coach_id === c.coach_id);
            const bookedCount = coachSeats.filter(s => s.status === 'BOOKED').length;
            const availableCount = Math.max(0, c.capacity - bookedCount);
            const pct = c.capacity > 0 ? parseFloat(((bookedCount / c.capacity) * 100).toFixed(2)) : 0;

            return {
                train_id: train ? train.train_id : c.train_id,
                train_number: train ? train.train_number : 'N/A',
                train_name: train ? train.train_name : 'N/A',
                coach_id: c.coach_id,
                coach_number: c.coach_number,
                coach_type: c.coach_type,
                capacity: c.capacity,
                booked_seats: bookedCount,
                available_seats: availableCount,
                utilization_percent: pct
            };
        });
        res.json(utilization);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------------------------------
// ADMIN VIEW: STATION EMPLOYEE ROSTERS (vw_station_employee_rosters)
// ----------------------------------------------------------------------------
router.get('/views/rosters', async (req, res) => {
    try {
        if (!db.isMock()) {
            const rows = await db.query('SELECT * FROM vw_station_employee_rosters', [], req);
            return res.json(rows);
        }

        const rosters = db.mockDb.employees.map(e => {
            const st = e.assigned_station_id ? db.mockDb.stations.find(s => s.station_id === e.assigned_station_id) : null;
            const tr = e.assigned_train_id ? db.mockDb.trains.find(t => t.train_id === e.assigned_train_id) : null;
            return {
                employee_id: e.employee_id,
                employee_name: e.name,
                designation: e.designation,
                salary: e.salary,
                email: e.email,
                station_id: st ? st.station_id : null,
                station_code: st ? st.station_code : null,
                station_name: st ? st.station_name : 'Field / Mobile',
                station_city: st ? st.city : null,
                zone: st ? st.zone : null,
                assigned_train_number: tr ? tr.train_number : null,
                assigned_train_name: tr ? tr.train_name : null,
                role_on_train: e.role_on_train
            };
        });
        res.json(rosters);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------------------------------
// ADD NEW TRAIN (with auto-generated coaches and seats)
// ----------------------------------------------------------------------------
router.post('/trains', async (req, res) => {
    const { train_number, train_name, train_type, total_coaches, route_id } = req.body;
    if (!train_number || !train_name || !train_type || !route_id) {
        return res.status(400).json({ error: 'train_number, train_name, train_type, and route_id are required.' });
    }

    try {
        if (!db.isMock()) {
            const check = await db.query('SELECT train_id FROM trains WHERE train_number = ?', [train_number], req);
            if (check && check.length > 0) {
                return res.status(409).json({ error: 'Train with this number already exists.' });
            }

            const coachesCount = parseInt(total_coaches) || 12;
            const insertTrain = await db.query(
                'INSERT INTO trains (train_number, train_name, train_type, total_coaches, route_id) VALUES (?, ?, ?, ?, ?)',
                [train_number, train_name, train_type, coachesCount, parseInt(route_id)],
                req
            );
            const trainId = insertTrain.insertId;

            // Generate initial coaches (e.g. A1 - 2A, B1 - 3A, S1 - SL)
            const coachDefs = [
                { num: 'A1', type: '2A', cap: 48, fare: 2500 },
                { num: 'B1', type: '3A', cap: 64, fare: 1800 },
                { num: 'S1', type: 'SL', cap: 72, fare: 600 }
            ];

            for (const c of coachDefs) {
                const insC = await db.query(
                    'INSERT INTO coaches (train_id, coach_number, coach_type, capacity, base_fare) VALUES (?, ?, ?, ?, ?)',
                    [trainId, c.num, c.type, c.cap, c.fare],
                    req
                );
                const coachId = insC.insertId;
                // Generate seats
                for (let s = 1; s <= 8; s++) {
                    const berth = s % 3 === 1 ? 'LOWER' : s % 3 === 2 ? 'MIDDLE' : 'UPPER';
                    await db.query(
                        'INSERT INTO seats (coach_id, seat_number, berth_type, status) VALUES (?, ?, ?, ?)',
                        [coachId, s, berth, 'AVAILABLE'],
                        req
                    );
                }
            }

            return res.status(201).json({ message: 'Train and coaches created successfully.', train_id: trainId });
        }

        const exists = db.mockDb.trains.find(t => t.train_number === train_number);
        if (exists) {
            return res.status(409).json({ error: 'Train with this number already exists.' });
        }

        const newTrainId = db.mockDb.trains.length > 0 ? Math.max(...db.mockDb.trains.map(t => t.train_id)) + 1 : 1;
        const newTrain = {
            train_id: newTrainId,
            train_number,
            train_name,
            train_type,
            total_coaches: parseInt(total_coaches) || 12,
            route_id: parseInt(route_id)
        };
        db.mockDb.trains.push(newTrain);

        // Add 3 sample coaches for this train
        const coachAId = db.mockDb.coaches.length + 1;
        db.mockDb.coaches.push({ coach_id: coachAId, train_id: newTrainId, coach_number: 'A1', coach_type: '2A', capacity: 48, base_fare: 2500 });
        const coachBId = db.mockDb.coaches.length + 1;
        db.mockDb.coaches.push({ coach_id: coachBId, train_id: newTrainId, coach_number: 'B1', coach_type: '3A', capacity: 64, base_fare: 1800 });
        const coachSId = db.mockDb.coaches.length + 1;
        db.mockDb.coaches.push({ coach_id: coachSId, train_id: newTrainId, coach_number: 'S1', coach_type: 'SL', capacity: 72, base_fare: 600 });

        // Add seats for Coach B1
        for (let s = 1; s <= 12; s++) {
            const berth = s % 3 === 1 ? 'LOWER' : s % 3 === 2 ? 'MIDDLE' : 'UPPER';
            db.mockDb.seats.push({ coach_id: coachBId, seat_number: s, berth_type: berth, status: 'AVAILABLE' });
        }

        res.status(201).json({ message: 'Train and coaches created successfully.', train: newTrain });
    } catch (err) {
        console.error('Add train error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------------------------------
// ADD NEW ROUTE
// ----------------------------------------------------------------------------
router.post('/routes', async (req, res) => {
    const { source_station_id, destination_station_id, distance_km, duration_hours } = req.body;
    if (!source_station_id || !destination_station_id || !distance_km || !duration_hours) {
        return res.status(400).json({ error: 'source_station_id, destination_station_id, distance_km, duration_hours are required.' });
    }

    if (parseInt(source_station_id) === parseInt(destination_station_id)) {
        return res.status(400).json({ error: 'Source and Destination stations must be distinct.' });
    }

    try {
        if (!db.isMock()) {
            const ins = await db.query(
                'INSERT INTO routes (source_station_id, destination_station_id, distance_km, duration_hours) VALUES (?, ?, ?, ?)',
                [source_station_id, destination_station_id, distance_km, duration_hours],
                req
            );
            return res.status(201).json({ message: 'Route added successfully.', route_id: ins.insertId });
        }

        const newRouteId = db.mockDb.routes.length > 0 ? Math.max(...db.mockDb.routes.map(r => r.route_id)) + 1 : 1;
        const newRoute = {
            route_id: newRouteId,
            source_station_id: parseInt(source_station_id),
            destination_station_id: parseInt(destination_station_id),
            distance_km: parseFloat(distance_km),
            duration_hours: parseFloat(duration_hours)
        };
        db.mockDb.routes.push(newRoute);
        res.status(201).json({ message: 'Route added successfully.', route: newRoute });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------------------------------
// UPDATE SCHEDULE / DELAY & PLATFORM
// ----------------------------------------------------------------------------
router.put('/schedules/delay', async (req, res) => {
    const { schedule_id, arrival_time, departure_time, platform_no } = req.body;
    if (!schedule_id) {
        return res.status(400).json({ error: 'schedule_id is required.' });
    }

    try {
        if (!db.isMock()) {
            await db.query(
                `UPDATE schedules 
                 SET arrival_time = COALESCE(?, arrival_time),
                     departure_time = COALESCE(?, departure_time),
                     platform_no = COALESCE(?, platform_no)
                 WHERE schedule_id = ?`,
                [arrival_time, departure_time, platform_no, schedule_id],
                req
            );
            return res.json({ message: 'Schedule updated successfully.' });
        }

        const sched = db.mockDb.schedules.find(s => s.schedule_id === parseInt(schedule_id));
        if (!sched) {
            return res.status(404).json({ error: 'Schedule entry not found.' });
        }

        if (arrival_time !== undefined) sched.arrival_time = arrival_time;
        if (departure_time !== undefined) sched.departure_time = departure_time;
        if (platform_no !== undefined) sched.platform_no = parseInt(platform_no);

        res.json({ message: 'Schedule updated successfully.', schedule: sched });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------------------------------
// ASSIGN EMPLOYEE (Station or Train Assignment)
// ----------------------------------------------------------------------------
router.post('/employees/assign', async (req, res) => {
    const { employee_id, assigned_station_id, assigned_train_id, role_on_train } = req.body;
    if (!employee_id) {
        return res.status(400).json({ error: 'employee_id is required.' });
    }

    try {
        if (!db.isMock()) {
            await db.query(
                `UPDATE employees 
                 SET assigned_station_id = ?,
                     assigned_train_id = ?,
                     role_on_train = ?
                 WHERE employee_id = ?`,
                [assigned_station_id || null, assigned_train_id || null, role_on_train || null, employee_id],
                req
            );
            return res.json({ message: 'Employee deployment assigned successfully.' });
        }

        const emp = db.mockDb.employees.find(e => e.employee_id === parseInt(employee_id));
        if (!emp) {
            return res.status(404).json({ error: 'Employee not found.' });
        }

        emp.assigned_station_id = assigned_station_id ? parseInt(assigned_station_id) : null;
        emp.assigned_train_id = assigned_train_id ? parseInt(assigned_train_id) : null;
        emp.role_on_train = role_on_train || null;

        res.json({ message: 'Employee deployment assigned successfully.', employee: emp });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

