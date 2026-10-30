const express = require('express');
const router = express.Router();
const db = require('../database/db');

// ----------------------------------------------------------------------------
// EMPLOYEE DIRECTORY & OPERATIONS ANALYTICS
// ----------------------------------------------------------------------------
router.get('/directory/:kind', async (req, res) => {
    const kind = req.params.kind;
    if (!['passengers', 'users', 'employees'].includes(kind)) {
        return res.status(404).json({ error: 'Directory not found.' });
    }

    try {
        if (kind === 'employees') {
            if (!db.isMock()) {
                return res.json(await db.query(
                    `SELECT employee_id, name, designation, email, assigned_station_id,
                            assigned_train_id, role_on_train, created_at
                     FROM employees ORDER BY name`,
                    [], req
                ));
            }
            return res.json(db.mockDb.employees.map(({ password_hash, ...employee }) => employee));
        }

        if (!db.isMock()) {
            return res.json(await db.query(
                `SELECT passenger_id AS user_id, passenger_id, name, email, primary_phone,
                        city, state, created_at
                 FROM passengers ORDER BY name`,
                [], req
            ));
        }
        return res.json(db.mockDb.passengers.map(passenger => ({
            user_id: passenger.passenger_id,
            passenger_id: passenger.passenger_id,
            name: passenger.name,
            email: passenger.email,
            primary_phone: passenger.primary_phone,
            city: passenger.city,
            state: passenger.state,
            created_at: passenger.created_at || null
        })));
    } catch (err) {
        console.error(`Employee ${kind} directory error:`, err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/analytics', async (req, res) => {
    try {
        if (!db.isMock()) {
            const [summary, trains, statuses, manifest] = await Promise.all([
                db.query(
                    `SELECT (SELECT COUNT(*) FROM passengers) AS passengers,
                            (SELECT COUNT(*) FROM employees) AS employees,
                            (SELECT COUNT(*) FROM trains) AS trains,
                            COUNT(CASE WHEN status = 'CONFIRMED' THEN 1 END) AS active_tickets,
                            COALESCE(SUM(CASE WHEN status = 'CONFIRMED' THEN fare ELSE 0 END), 0) AS confirmed_revenue
                     FROM tickets`,
                    [], req
                ),
                db.query(
                    `SELECT t.train_number, t.train_name,
                            COUNT(CASE WHEN tk.status = 'CONFIRMED' THEN 1 END) AS active_tickets
                     FROM trains t LEFT JOIN tickets tk ON tk.train_id = t.train_id
                     GROUP BY t.train_id, t.train_number, t.train_name
                     ORDER BY active_tickets DESC, t.train_number`,
                    [], req
                ),
                db.query(
                    `SELECT status, COUNT(*) AS ticket_count FROM tickets GROUP BY status ORDER BY status`,
                    [], req
                ),
                db.query(
                    `SELECT tk.pnr_no, p.name AS passenger_name, p.primary_phone,
                            t.train_number, t.train_name, c.coach_number, c.coach_type,
                            tk.seat_number, tk.journey_date, tk.start_sequence, tk.end_sequence,
                            source_station.station_name AS from_station,
                            destination_station.station_name AS to_station,
                            tk.fare, tk.status
                     FROM tickets tk
                     JOIN passengers p ON p.passenger_id = tk.passenger_id
                     JOIN trains t ON t.train_id = tk.train_id
                     JOIN coaches c ON c.coach_id = tk.coach_id
                     JOIN schedules source_stop ON source_stop.train_id = tk.train_id
                         AND source_stop.stop_sequence = tk.start_sequence
                     JOIN stations source_station ON source_station.station_id = source_stop.station_id
                     JOIN schedules destination_stop ON destination_stop.train_id = tk.train_id
                         AND destination_stop.stop_sequence = tk.end_sequence
                     JOIN stations destination_station ON destination_station.station_id = destination_stop.station_id
                     WHERE tk.status = 'CONFIRMED'
                     ORDER BY tk.journey_date, t.train_number, c.coach_number, tk.seat_number`,
                    [], req
                )
            ]);
            return res.json({
                summary: summary[0] || {},
                tickets_by_train: trains,
                ticket_statuses: statuses,
                tte_manifest: manifest
            });
        }

        const activeTickets = db.mockDb.tickets.filter(ticket => ticket.status === 'CONFIRMED');
        const trainMetrics = db.mockDb.trains.map(train => ({
            train_number: train.train_number,
            train_name: train.train_name,
            active_tickets: activeTickets.filter(ticket => ticket.train_id === train.train_id).length
        })).sort((a, b) => b.active_tickets - a.active_tickets);
        const ticketStatuses = ['CONFIRMED', 'CANCELLED', 'WAITLIST']
            .map(status => ({
                status,
                ticket_count: db.mockDb.tickets.filter(ticket => ticket.status === status).length
            }));
        const manifest = activeTickets.map(ticket => {
            const passenger = db.mockDb.passengers.find(item => item.passenger_id === ticket.passenger_id);
            const train = db.mockDb.trains.find(item => item.train_id === ticket.train_id);
            const coach = db.mockDb.coaches.find(item => item.coach_id === ticket.coach_id);
            const originStop = db.mockDb.schedules.find(stop =>
                stop.train_id === ticket.train_id && stop.stop_sequence === (ticket.start_sequence || 1)
            );
            const destinationStop = db.mockDb.schedules.find(stop =>
                stop.train_id === ticket.train_id && stop.stop_sequence === (ticket.end_sequence || 9999)
            );
            const origin = originStop && db.mockDb.stations.find(item => item.station_id === originStop.station_id);
            const destination = destinationStop && db.mockDb.stations.find(item => item.station_id === destinationStop.station_id);
            return {
                pnr_no: ticket.pnr_no,
                passenger_name: passenger ? passenger.name : 'Unknown',
                primary_phone: passenger ? passenger.primary_phone : '',
                train_number: train ? train.train_number : '',
                train_name: train ? train.train_name : '',
                coach_number: coach ? coach.coach_number : '',
                coach_type: coach ? coach.coach_type : '',
                seat_number: ticket.seat_number,
                journey_date: ticket.journey_date,
                from_station: origin ? origin.station_name : '',
                to_station: destination ? destination.station_name : '',
                start_sequence: ticket.start_sequence || 1,
                end_sequence: ticket.end_sequence || 9999,
                fare: ticket.fare,
                status: ticket.status
            };
        });
        res.json({
            summary: {
                passengers: db.mockDb.passengers.length,
                employees: db.mockDb.employees.length,
                trains: db.mockDb.trains.length,
                active_tickets: activeTickets.length,
                confirmed_revenue: activeTickets.reduce((sum, ticket) => sum + Number(ticket.fare), 0)
            },
            tickets_by_train: trainMetrics,
            ticket_statuses: ticketStatuses,
            tte_manifest: manifest
        });
    } catch (err) {
        console.error('Employee analytics error:', err);
        res.status(500).json({ error: err.message });
    }
});

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
            const bookedCount = new Set(db.mockDb.tickets
                .filter(ticket => ticket.coach_id === c.coach_id && ticket.status === 'CONFIRMED')
                .map(ticket => ticket.seat_number)).size;
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
    const coachesCount = parseInt(total_coaches, 10) || 12;
    if (coachesCount < 4 || coachesCount > 24) {
        return res.status(400).json({ error: 'total_coaches must be between 4 and 24.' });
    }

    try {
        if (!db.isMock()) {
            const routeRows = await db.query(
                'SELECT source_station_id, destination_station_id FROM routes WHERE route_id = ?',
                [parseInt(route_id)],
                req
            );
            if (!routeRows.length) {
                return res.status(404).json({ error: 'Route not found.' });
            }
            const check = await db.query('SELECT train_id FROM trains WHERE train_number = ?', [train_number], req);
            if (check && check.length > 0) {
                return res.status(409).json({ error: 'Train with this number already exists.' });
            }

            const insertTrain = await db.query(
                'INSERT INTO trains (train_number, train_name, train_type, total_coaches, route_id) VALUES (?, ?, ?, ?, ?)',
                [train_number, train_name, train_type, coachesCount, parseInt(route_id)],
                req
            );
            const trainId = insertTrain.insertId;
            await db.query(
                `INSERT INTO schedules
                    (train_id, station_id, stop_sequence, arrival_time, departure_time, platform_no)
                 VALUES (?, ?, 1, NULL, '08:00:00', 1), (?, ?, 2, '18:00:00', NULL, 1)`,
                [trainId, routeRows[0].source_station_id, trainId, routeRows[0].destination_station_id],
                req
            );

            // Generate initial coaches (e.g. A1 - 2A, B1 - 3A, S1 - SL)
            const coachTemplates = [
                { num: 'A1', type: '2A', cap: 48, fare: 2500 },
                { num: 'B1', type: '3A', cap: 64, fare: 1800 },
                { num: 'S1', type: 'SL', cap: 72, fare: 600 }
            ];
            const coachDefs = Array.from({ length: coachesCount }, (_, index) => {
                const template = coachTemplates[index % coachTemplates.length];
                const sequence = Math.floor(index / coachTemplates.length) + 1;
                return { ...template, num: `${template.num[0]}${sequence}` };
            });

            for (const c of coachDefs) {
                const insC = await db.query(
                    'INSERT INTO coaches (train_id, coach_number, coach_type, capacity, base_fare) VALUES (?, ?, ?, ?, ?)',
                    [trainId, c.num, c.type, c.cap, c.fare],
                    req
                );
                const coachId = insC.insertId;
                await db.query(
                    `INSERT INTO seats (coach_id, seat_number, berth_type, status)
                     SELECT ?, numbers.seat_number,
                            CASE numbers.seat_number % 6
                                WHEN 1 THEN 'LOWER' WHEN 2 THEN 'MIDDLE' WHEN 3 THEN 'UPPER'
                                WHEN 4 THEN 'SIDE LOWER' WHEN 5 THEN 'SIDE UPPER' ELSE 'LOWER'
                            END,
                            'AVAILABLE'
                     FROM (
                         SELECT ones.n + tens.n * 10 + 1 AS seat_number
                         FROM (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
                               UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) ones
                         CROSS JOIN (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
                                     UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) tens
                     ) numbers
                     WHERE numbers.seat_number <= ?`,
                    [coachId, c.cap],
                    req
                );
            }

            return res.status(201).json({ message: 'Train and coaches created successfully.', train_id: trainId });
        }

        const exists = db.mockDb.trains.find(t => t.train_number === train_number);
        if (exists) {
            return res.status(409).json({ error: 'Train with this number already exists.' });
        }

        const newRoute = db.mockDb.routes.find(route => route.route_id === parseInt(route_id));
        if (!newRoute) {
            return res.status(404).json({ error: 'Route not found.' });
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
        const nextScheduleId = db.mockDb.schedules.reduce((max, stop) => Math.max(max, stop.schedule_id), 0);
        db.mockDb.schedules.push(
            {
                schedule_id: nextScheduleId + 1,
                train_id: newTrainId,
                station_id: newRoute.source_station_id,
                stop_sequence: 1,
                arrival_time: null,
                departure_time: '08:00:00',
                platform_no: 1
            },
            {
                schedule_id: nextScheduleId + 2,
                train_id: newTrainId,
                station_id: newRoute.destination_station_id,
                stop_sequence: 2,
                arrival_time: '18:00:00',
                departure_time: null,
                platform_no: 1
            }
        );

        // Add 3 sample coaches for this train
        const coachTemplates = [
            { prefix: 'A', type: '2A', capacity: 48, base_fare: 2500 },
            { prefix: 'B', type: '3A', capacity: 64, base_fare: 1800 },
            { prefix: 'S', type: 'SL', capacity: 72, base_fare: 600 }
        ];
        let nextCoachId = Math.max(...db.mockDb.coaches.map(coach => coach.coach_id));
        for (let index = 0; index < coachesCount; index++) {
            const definition = coachTemplates[index % coachTemplates.length];
            const sequence = Math.floor(index / coachTemplates.length) + 1;
            db.mockDb.coaches.push({
                coach_id: ++nextCoachId,
                train_id: newTrainId,
                coach_number: `${definition.prefix}${sequence}`,
                coach_type: definition.type,
                capacity: definition.capacity,
                base_fare: definition.base_fare
            });
        }

        for (const coach of db.mockDb.coaches.filter(item => item.train_id === newTrainId)) {
            for (let seatNumber = 1; seatNumber <= coach.capacity; seatNumber++) {
                const berth = seatNumber % 3 === 1 ? 'LOWER' : seatNumber % 3 === 2 ? 'MIDDLE' : 'UPPER';
                db.mockDb.seats.push({
                    coach_id: coach.coach_id,
                    seat_number: seatNumber,
                    berth_type: berth,
                    status: 'AVAILABLE'
                });
            }
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
