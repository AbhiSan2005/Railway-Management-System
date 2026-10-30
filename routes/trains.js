const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { getJourneySegment } = require('../database/journey');

// ----------------------------------------------------------------------------
// GET ALL TRAINS
// ----------------------------------------------------------------------------
router.get('/', async (req, res) => {
    try {
        if (!db.isMock()) {
            const sql = `
                SELECT 
                    t.train_id, t.train_number, t.train_name, t.train_type, t.total_coaches,
                    s1.station_name AS source_station, s1.station_code AS source_code,
                    s2.station_name AS destination_station, s2.station_code AS dest_code,
                    r.distance_km, r.duration_hours
                FROM trains t
                JOIN routes r ON t.route_id = r.route_id
                JOIN stations s1 ON r.source_station_id = s1.station_id
                JOIN stations s2 ON r.destination_station_id = s2.station_id
                ORDER BY t.train_number ASC
            `;
            const rows = await db.query(sql, [], req);
            return res.json(rows);
        }

        const list = db.mockDb.trains.map(t => {
            const r = db.mockDb.routes.find(route => route.route_id === t.route_id);
            const s1 = r ? db.mockDb.stations.find(st => st.station_id === r.source_station_id) : null;
            const s2 = r ? db.mockDb.stations.find(st => st.station_id === r.destination_station_id) : null;
            return {
                train_id: t.train_id,
                train_number: t.train_number,
                train_name: t.train_name,
                train_type: t.train_type,
                total_coaches: t.total_coaches,
                source_station: s1 ? s1.station_name : 'Unknown',
                source_code: s1 ? s1.station_code : '',
                destination_station: s2 ? s2.station_name : 'Unknown',
                dest_code: s2 ? s2.station_code : '',
                distance_km: r ? r.distance_km : 0,
                duration_hours: r ? r.duration_hours : 0
            };
        });
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------------------------------
// SEARCH TRAINS (Direct & Intermediate Station Search via Schedules)
// ----------------------------------------------------------------------------
router.get('/search', async (req, res) => {
    const { from, to, date } = req.query;
    if (!from || !to) {
        return res.status(400).json({ error: 'Origin (from) and Destination (to) station IDs are required.' });
    }

    const fromId = parseInt(from);
    const toId = parseInt(to);

    try {
        if (!db.isMock()) {
            const sql = `
                SELECT 
                    t.train_id, t.train_number, t.train_name, t.train_type, t.total_coaches,
                    s1.station_name AS origin_station, s1.station_code AS origin_code,
                    s2.station_name AS destination_station, s2.station_code AS dest_code,
                    sch1.departure_time AS departure_time,
                    sch2.arrival_time AS arrival_time,
                    r.distance_km, r.duration_hours,
                    r.distance_km * (sch2.stop_sequence - sch1.stop_sequence) /
                        NULLIF((SELECT MAX(stop_sequence) - MIN(stop_sequence)
                                FROM schedules WHERE train_id = t.train_id), 0) AS segment_distance_km
                FROM trains t
                JOIN schedules sch1 ON t.train_id = sch1.train_id AND sch1.station_id = ?
                JOIN schedules sch2 ON t.train_id = sch2.train_id AND sch2.station_id = ?
                JOIN stations s1 ON sch1.station_id = s1.station_id
                JOIN stations s2 ON sch2.station_id = s2.station_id
                JOIN routes r ON t.route_id = r.route_id
                WHERE sch1.stop_sequence < sch2.stop_sequence
                ORDER BY sch1.departure_time ASC
            `;
            const rows = await db.query(sql, [fromId, toId], req);
            return res.json(rows);
        }

        // Mock Search: Look for trains that stop at both stations where from comes before to
        const results = [];
        db.mockDb.trains.forEach(t => {
            const schFrom = db.mockDb.schedules.find(s => s.train_id === t.train_id && s.station_id === fromId);
            const schTo = db.mockDb.schedules.find(s => s.train_id === t.train_id && s.station_id === toId);

            if (schFrom && schTo && schFrom.stop_sequence < schTo.stop_sequence) {
                const r = db.mockDb.routes.find(route => route.route_id === t.route_id);
                const s1 = db.mockDb.stations.find(st => st.station_id === fromId);
                const s2 = db.mockDb.stations.find(st => st.station_id === toId);

                results.push({
                    train_id: t.train_id,
                    train_number: t.train_number,
                    train_name: t.train_name,
                    train_type: t.train_type,
                    total_coaches: t.total_coaches,
                    origin_station: s1 ? s1.station_name : 'Unknown',
                    origin_code: s1 ? s1.station_code : '',
                    destination_station: s2 ? s2.station_name : 'Unknown',
                    dest_code: s2 ? s2.station_code : '',
                    departure_time: schFrom.departure_time || '10:00:00',
                    arrival_time: schTo.arrival_time || '18:00:00',
                    distance_km: r ? Number(r.distance_km) *
                        (schTo.stop_sequence - schFrom.stop_sequence) /
                        Math.max(1, db.mockDb.schedules.filter(stop => stop.train_id === t.train_id)
                            .reduce((max, stop) => Math.max(max, stop.stop_sequence), 1) -
                            db.mockDb.schedules.filter(stop => stop.train_id === t.train_id)
                            .reduce((min, stop) => Math.min(min, stop.stop_sequence), Infinity)) : 0,
                    duration_hours: r ? r.duration_hours : 8
                });
            }
        });

        res.json(results);
    } catch (err) {
        console.error('Train search error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------------------------------
// GET TRAIN TIMETABLE / INTERMEDIATE HALTS
// ----------------------------------------------------------------------------
router.get('/:id/schedule', async (req, res) => {
    const trainId = parseInt(req.params.id);
    try {
        if (!db.isMock()) {
            const sql = `
                SELECT 
                    sc.schedule_id, sc.train_id, sc.stop_sequence, 
                    st.station_id, st.station_name, st.station_code, st.city,
                    sc.arrival_time, sc.departure_time, sc.platform_no
                FROM schedules sc
                JOIN stations st ON sc.station_id = st.station_id
                WHERE sc.train_id = ?
                ORDER BY sc.stop_sequence ASC
            `;
            const rows = await db.query(sql, [trainId], req);
            return res.json(rows);
        }

        const stops = db.mockDb.schedules
            .filter(s => s.train_id === trainId)
            .sort((a, b) => a.stop_sequence - b.stop_sequence)
            .map(s => {
                const st = db.mockDb.stations.find(x => x.station_id === s.station_id);
                return {
                    schedule_id: s.schedule_id,
                    train_id: s.train_id,
                    stop_sequence: s.stop_sequence,
                    station_id: s.station_id,
                    station_name: st ? st.station_name : 'Unknown',
                    station_code: st ? st.station_code : '',
                    city: st ? st.city : '',
                    arrival_time: s.arrival_time,
                    departure_time: s.departure_time,
                    platform_no: s.platform_no
                };
            });
        res.json(stops);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------------------------------
// GET TRAIN COACHES
// ----------------------------------------------------------------------------
router.get('/:id/coaches', async (req, res) => {
    const trainId = parseInt(req.params.id);
    try {
        if (!db.isMock()) {
            const rows = await db.query('SELECT * FROM coaches WHERE train_id = ? ORDER BY coach_number ASC', [trainId], req);
            return res.json(rows);
        }
        const coaches = db.mockDb.coaches.filter(c => c.train_id === trainId);
        res.json(coaches);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------------------------------
// GET REAL-TIME SEAT & COACH AVAILABILITY GRID
// (Dynamic Date-Specific Inventory Engine)
// ----------------------------------------------------------------------------
router.get('/:id/seats', async (req, res) => {
    const trainId = parseInt(req.params.id);
    const { coach_id, journey_date, from_station_id, to_station_id } = req.query;

    if (!coach_id) {
        return res.status(400).json({ error: 'coach_id query parameter is required.' });
    }

    const coachId = parseInt(coach_id);
    const date = journey_date || new Date().toISOString().split('T')[0];

    try {
        const segment = await getJourneySegment(trainId, from_station_id, to_station_id, req);
        if (!segment) {
            return res.status(400).json({ error: 'Choose two scheduled stations in forward journey order.' });
        }

        if (!db.isMock()) {
            const sql = `
                SELECT 
                    s.coach_id,
                    s.seat_number,
                    s.berth_type,
                    CASE
                        WHEN EXISTS (
                            SELECT 1 FROM tickets ticket
                            WHERE ticket.train_id = ?
                              AND ticket.coach_id = s.coach_id
                              AND ticket.seat_number = s.seat_number
                              AND ticket.journey_date = ?
                              AND ticket.status = 'CONFIRMED'
                              AND ticket.start_sequence < ?
                              AND ticket.end_sequence > ?
                        ) THEN 'BOOKED'
                        ELSE 'AVAILABLE'
                    END AS status
                FROM seats s
                WHERE s.coach_id = ?
                ORDER BY s.seat_number ASC
            `;
            const rows = await db.query(sql, [
                trainId, date, segment.end_sequence, segment.start_sequence, coachId
            ], req);
            return res.json({
                train_id: trainId,
                coach_id: coachId,
                journey_date: date,
                start_sequence: segment.start_sequence,
                end_sequence: segment.end_sequence,
                distance_km: segment.distance_km,
                seats: rows
            });
        }

        // Mock Fallback
        const physicalSeats = db.mockDb.seats.filter(s => s.coach_id === coachId);
        const bookedTickets = db.mockDb.tickets.filter(t => 
            t.train_id === trainId &&
            t.coach_id === coachId &&
            t.journey_date === date &&
            t.status === 'CONFIRMED' &&
            (t.start_sequence || 1) < segment.end_sequence &&
            (t.end_sequence || 9999) > segment.start_sequence
        );

        const bookedSeatNumbers = new Set(bookedTickets.map(t => t.seat_number));

        const seatsResult = physicalSeats.map(s => ({
            coach_id: s.coach_id,
            seat_number: s.seat_number,
            berth_type: s.berth_type,
            status: bookedSeatNumbers.has(s.seat_number) ? 'BOOKED' : 'AVAILABLE'
        }));

        res.json({
            train_id: trainId,
            coach_id: coachId,
            journey_date: date,
            start_sequence: segment.start_sequence,
            end_sequence: segment.end_sequence,
            distance_km: segment.distance_km,
            seats: seatsResult
        });
    } catch (err) {
        console.error('Seats query error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
