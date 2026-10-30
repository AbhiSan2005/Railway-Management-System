const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { getJourneySegment } = require('../database/journey');

function createPnr(usedPnrs) {
    let pnr;
    do {
        pnr = `PNR${Math.floor(100000 + Math.random() * 900000)}`;
    } while (usedPnrs.has(pnr));
    usedPnrs.add(pnr);
    return pnr;
}

// ----------------------------------------------------------------------------
// ACID TICKET RESERVATION TRANSACTION
// ----------------------------------------------------------------------------
router.post('/reserve', async (req, res) => {
    const { passenger_id, train_id, coach_id, seat_number, journey_date, from_station_id, to_station_id } = req.body;
    const reservations = Array.isArray(req.body.reservations)
        ? req.body.reservations
        : (Array.isArray(req.body.seat_numbers)
            ? req.body.seat_numbers.map(number => ({ passenger_id, seat_number: number }))
            : [{ passenger_id, seat_number }]);

    if (!train_id || !coach_id || !journey_date || !reservations.length ||
        reservations.length > 20 ||
        reservations.some(item => !item.passenger_id || !Number.isInteger(Number(item.seat_number)) || Number(item.seat_number) < 1)) {
        return res.status(400).json({
            error: 'A train, coach, journey date, and 1-20 valid passenger/seat reservations are required.'
        });
    }

    const seats = reservations.map(item => Number(item.seat_number));
    if (new Set(seats).size !== seats.length) {
        return res.status(400).json({ error: 'Each reservation must use a different seat.' });
    }

    try {
        const segment = await getJourneySegment(train_id, from_station_id, to_station_id, req);
        if (!segment) {
            return res.status(400).json({ error: 'Choose two scheduled stations in forward journey order.' });
        }

        const result = await db.transaction(async (conn) => {
            if (conn) {
                const [coaches] = await conn.execute(
                    'SELECT base_fare FROM coaches WHERE coach_id = ? AND train_id = ? FOR UPDATE',
                    [coach_id, train_id]
                );
                if (!coaches.length) {
                    const err = new Error('Coach does not belong to the selected train.');
                    err.statusCode = 400;
                    throw err;
                }

                const fare = Math.max(0.01, Math.round(
                    Number(coaches[0].base_fare) * segment.distance_km / segment.full_distance_km * 100
                ) / 100);
                const bookedTickets = [];
                const usedPnrs = new Set();
                for (const reservation of reservations) {
                    const [physicalSeats] = await conn.execute(
                        'SELECT seat_number FROM seats WHERE coach_id = ? AND seat_number = ? FOR UPDATE',
                        [coach_id, reservation.seat_number]
                    );
                    if (!physicalSeats.length) {
                        const err = new Error(`Seat ${reservation.seat_number} does not exist in this coach.`);
                        err.statusCode = 400;
                        throw err;
                    }
                    const [existing] = await conn.execute(
                        `SELECT ticket_id FROM tickets
                         WHERE train_id = ? AND coach_id = ? AND seat_number = ?
                           AND journey_date = ? AND status = 'CONFIRMED'
                           AND start_sequence < ? AND end_sequence > ?
                         FOR UPDATE`,
                        [train_id, coach_id, reservation.seat_number, journey_date,
                            segment.end_sequence, segment.start_sequence]
                    );
                    if (existing.length) {
                        const err = new Error(`Seat ${reservation.seat_number} is already booked for an overlapping journey segment.`);
                        err.statusCode = 409;
                        throw err;
                    }

                    const pnr = createPnr(usedPnrs);
                    const [insertRes] = await conn.execute(
                        `INSERT INTO tickets
                         (pnr_no, passenger_id, train_id, coach_id, seat_number, journey_date,
                          start_sequence, end_sequence, fare, status)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED')`,
                        [pnr, reservation.passenger_id, train_id, coach_id, reservation.seat_number,
                            journey_date, segment.start_sequence, segment.end_sequence, fare]
                    );
                    bookedTickets.push({
                        ticket_id: insertRes.insertId, pnr_no: pnr,
                        passenger_id: Number(reservation.passenger_id), train_id: Number(train_id),
                        coach_id: Number(coach_id), seat_number: reservation.seat_number,
                        journey_date, start_sequence: segment.start_sequence,
                        end_sequence: segment.end_sequence, distance_km: segment.distance_km,
                        fare, status: 'CONFIRMED'
                    });
                }
                return bookedTickets;
            } else {
                const coach = db.mockDb.coaches.find(item =>
                    item.coach_id === Number(coach_id) && item.train_id === Number(train_id)
                );
                if (!coach) {
                    const err = new Error('Coach does not belong to the selected train.');
                    err.statusCode = 400;
                    throw err;
                }
                const fare = Math.max(0.01, Math.round(
                    Number(coach.base_fare) * segment.distance_km / segment.full_distance_km * 100
                ) / 100);
                const bookedTickets = [];
                const usedPnrs = new Set();
                for (const reservation of reservations) {
                    const physicalSeat = db.mockDb.seats.find(item =>
                        item.coach_id === Number(coach_id) && item.seat_number === reservation.seat_number
                    );
                    if (!physicalSeat) {
                        const err = new Error(`Seat ${reservation.seat_number} does not exist in this coach.`);
                        err.statusCode = 400;
                        throw err;
                    }
                    const conflict = db.mockDb.tickets.find(ticket =>
                        ticket.train_id === Number(train_id) &&
                        ticket.coach_id === Number(coach_id) &&
                        ticket.seat_number === reservation.seat_number &&
                        ticket.journey_date === journey_date &&
                        ticket.status === 'CONFIRMED' &&
                        (ticket.start_sequence || 1) < segment.end_sequence &&
                        (ticket.end_sequence || 9999) > segment.start_sequence
                    );
                    if (conflict) {
                        const err = new Error(`Seat ${reservation.seat_number} is already booked for an overlapping journey segment.`);
                        err.statusCode = 409;
                        throw err;
                    }
                    if (!db.mockDb.passengers.some(item => item.passenger_id === Number(reservation.passenger_id))) {
                        const err = new Error(`Passenger ${reservation.passenger_id} was not found.`);
                        err.statusCode = 400;
                        throw err;
                    }
                    const newTicket = {
                        ticket_id: db.mockDb.tickets.length
                            ? Math.max(...db.mockDb.tickets.map(ticket => ticket.ticket_id)) + 1 : 1,
                        pnr_no: createPnr(usedPnrs),
                        passenger_id: Number(reservation.passenger_id),
                        train_id: Number(train_id),
                        coach_id: Number(coach_id),
                        seat_number: reservation.seat_number,
                        journey_date,
                        start_sequence: segment.start_sequence,
                        end_sequence: segment.end_sequence,
                        booking_date: new Date().toISOString().replace('T', ' ').substring(0, 19),
                        distance_km: segment.distance_km,
                        fare,
                        status: 'CONFIRMED'
                    };
                    db.mockDb.tickets.unshift(newTicket);
                    bookedTickets.push(newTicket);
                }
                return bookedTickets;
            }
        });

        res.status(201).json({
            message: `${result.length} ticket${result.length === 1 ? '' : 's'} booked successfully.`,
            ticket: result[0],
            tickets: result,
            pnr: result[0].pnr_no,
            total_fare: result.reduce((sum, ticket) => sum + Number(ticket.fare), 0)
        });
    } catch (err) {
        console.error('Reservation transaction error:', err);
        const code = err.statusCode || 500;
        res.status(code).json({ error: err.message || 'Transaction failed.' });
    }
});

// ----------------------------------------------------------------------------
// PASSENGER BOOKING HISTORY
// ----------------------------------------------------------------------------
router.get('/my-tickets', async (req, res) => {
    const { passenger_id } = req.query;
    if (!passenger_id) {
        return res.status(400).json({ error: 'passenger_id query parameter is required.' });
    }

    const pId = parseInt(passenger_id);

    try {
        if (!db.isMock()) {
            const sql = `
                SELECT 
                    tk.ticket_id, tk.pnr_no, tk.passenger_id, p.name AS passenger_name, p.primary_phone,
                    t.train_id, t.train_number, t.train_name, t.train_type,
                    c.coach_id, c.coach_number, c.coach_type,
                    tk.seat_number, s.berth_type,
                    tk.journey_date, tk.booking_date, tk.fare, tk.status,
                    tk.start_sequence, tk.end_sequence,
                    s_src.station_name AS source_station, s_src.station_code AS source_code,
                    s_dst.station_name AS destination_station, s_dst.station_code AS dest_code
                FROM tickets tk
                JOIN passengers p ON tk.passenger_id = p.passenger_id
                JOIN trains t ON tk.train_id = t.train_id
                JOIN schedules source_stop ON source_stop.train_id = tk.train_id
                    AND source_stop.stop_sequence = tk.start_sequence
                JOIN stations s_src ON source_stop.station_id = s_src.station_id
                JOIN schedules destination_stop ON destination_stop.train_id = tk.train_id
                    AND destination_stop.stop_sequence = tk.end_sequence
                JOIN stations s_dst ON destination_stop.station_id = s_dst.station_id
                JOIN coaches c ON tk.coach_id = c.coach_id
                LEFT JOIN seats s ON tk.coach_id = s.coach_id AND tk.seat_number = s.seat_number
                WHERE tk.passenger_id = ?
                ORDER BY tk.journey_date DESC, tk.ticket_id DESC
            `;
            const rows = await db.query(sql, [pId], req);
            return res.json(rows);
        }

        const filtered = db.mockDb.tickets.filter(t => t.passenger_id === pId);
        const enriched = filtered.map(tk => {
            const passenger = db.mockDb.passengers.find(p => p.passenger_id === tk.passenger_id);
            const train = db.mockDb.trains.find(t => t.train_id === tk.train_id);
            const route = train ? db.mockDb.routes.find(r => r.route_id === train.route_id) : null;
            const originStop = db.mockDb.schedules.find(stop =>
                stop.train_id === tk.train_id && stop.stop_sequence === (tk.start_sequence || 1)
            );
            const destinationStop = db.mockDb.schedules.find(stop =>
                stop.train_id === tk.train_id && stop.stop_sequence === (tk.end_sequence || 9999)
            );
            const src = originStop ? db.mockDb.stations.find(s => s.station_id === originStop.station_id) :
                route ? db.mockDb.stations.find(s => s.station_id === route.source_station_id) : null;
            const dst = destinationStop ? db.mockDb.stations.find(s => s.station_id === destinationStop.station_id) :
                route ? db.mockDb.stations.find(s => s.station_id === route.destination_station_id) : null;
            const coach = db.mockDb.coaches.find(c => c.coach_id === tk.coach_id);
            const seat = db.mockDb.seats.find(s => s.coach_id === tk.coach_id && s.seat_number === tk.seat_number);

            return {
                ticket_id: tk.ticket_id,
                pnr_no: tk.pnr_no,
                passenger_id: tk.passenger_id,
                passenger_name: passenger ? passenger.name : 'Unknown',
                primary_phone: passenger ? passenger.primary_phone : '',
                train_id: tk.train_id,
                train_number: train ? train.train_number : '',
                train_name: train ? train.train_name : '',
                train_type: train ? train.train_type : '',
                coach_id: tk.coach_id,
                coach_number: coach ? coach.coach_number : '',
                coach_type: coach ? coach.coach_type : '',
                seat_number: tk.seat_number,
                berth_type: seat ? seat.berth_type : 'LOWER',
                journey_date: tk.journey_date,
                booking_date: tk.booking_date,
                fare: tk.fare,
                status: tk.status,
                source_station: src ? src.station_name : '',
                source_code: src ? src.station_code : '',
                destination_station: dst ? dst.station_name : '',
                dest_code: dst ? dst.station_code : ''
            };
        });

        res.json(enriched);
    } catch (err) {
        console.error('Fetch tickets error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------------------------------
// PNR LOOKUP (Public & Staff)
// ----------------------------------------------------------------------------
router.get('/pnr/:pnr', async (req, res) => {
    const pnr = req.params.pnr.trim();
    try {
        if (!db.isMock()) {
            const sql = `
                SELECT 
                    tk.ticket_id, tk.pnr_no, tk.passenger_id, p.name AS passenger_name, p.dob, p.age, p.gender, p.primary_phone, p.email,
                    p.street, p.city, p.state, p.pincode,
                    t.train_id, t.train_number, t.train_name, t.train_type,
                    c.coach_id, c.coach_number, c.coach_type,
                    tk.seat_number, s.berth_type,
                    tk.journey_date, tk.booking_date, tk.fare, tk.status,
                    tk.start_sequence, tk.end_sequence,
                    s_src.station_name AS source_station, s_src.station_code AS source_code,
                    s_dst.station_name AS destination_station, s_dst.station_code AS dest_code
                FROM tickets tk
                JOIN passengers p ON tk.passenger_id = p.passenger_id
                JOIN trains t ON tk.train_id = t.train_id
                JOIN schedules source_stop ON source_stop.train_id = tk.train_id
                    AND source_stop.stop_sequence = tk.start_sequence
                JOIN stations s_src ON source_stop.station_id = s_src.station_id
                JOIN schedules destination_stop ON destination_stop.train_id = tk.train_id
                    AND destination_stop.stop_sequence = tk.end_sequence
                JOIN stations s_dst ON destination_stop.station_id = s_dst.station_id
                JOIN coaches c ON tk.coach_id = c.coach_id
                LEFT JOIN seats s ON tk.coach_id = s.coach_id AND tk.seat_number = s.seat_number
                WHERE UPPER(tk.pnr_no) = UPPER(?)
            `;
            const rows = await db.query(sql, [pnr], req);
            if (!rows || rows.length === 0) {
                return res.status(404).json({ error: 'PNR not found.' });
            }

            const ticket = rows[0];
            const kin = await db.query('SELECT * FROM next_of_kin WHERE passenger_id = ?', [ticket.passenger_id], req);
            ticket.next_of_kin = kin;

            return res.json(ticket);
        }

        const tk = db.mockDb.tickets.find(t => t.pnr_no.toUpperCase() === pnr.toUpperCase());
        if (!tk) {
            return res.status(404).json({ error: 'PNR not found.' });
        }

        const passenger = db.mockDb.passengers.find(p => p.passenger_id === tk.passenger_id);
        const train = db.mockDb.trains.find(t => t.train_id === tk.train_id);
        const route = train ? db.mockDb.routes.find(r => r.route_id === train.route_id) : null;
        const originStop = db.mockDb.schedules.find(stop =>
            stop.train_id === tk.train_id && stop.stop_sequence === (tk.start_sequence || 1)
        );
        const destinationStop = db.mockDb.schedules.find(stop =>
            stop.train_id === tk.train_id && stop.stop_sequence === (tk.end_sequence || 9999)
        );
        const src = originStop ? db.mockDb.stations.find(s => s.station_id === originStop.station_id) :
            route ? db.mockDb.stations.find(s => s.station_id === route.source_station_id) : null;
        const dst = destinationStop ? db.mockDb.stations.find(s => s.station_id === destinationStop.station_id) :
            route ? db.mockDb.stations.find(s => s.station_id === route.destination_station_id) : null;
        const coach = db.mockDb.coaches.find(c => c.coach_id === tk.coach_id);
        const seat = db.mockDb.seats.find(s => s.coach_id === tk.coach_id && s.seat_number === tk.seat_number);
        const kin = db.mockDb.next_of_kin.filter(k => k.passenger_id === tk.passenger_id);

        res.json({
            ticket_id: tk.ticket_id,
            pnr_no: tk.pnr_no,
            passenger_id: tk.passenger_id,
            passenger_name: passenger ? passenger.name : 'Unknown',
            dob: passenger ? passenger.dob : '',
            age: passenger ? passenger.age : 0,
            gender: passenger ? passenger.gender : 'Male',
            primary_phone: passenger ? passenger.primary_phone : '',
            email: passenger ? passenger.email : '',
            street: passenger ? passenger.street : '',
            city: passenger ? passenger.city : '',
            state: passenger ? passenger.state : '',
            pincode: passenger ? passenger.pincode : '',
            train_id: tk.train_id,
            train_number: train ? train.train_number : '',
            train_name: train ? train.train_name : '',
            train_type: train ? train.train_type : '',
            coach_id: tk.coach_id,
            coach_number: coach ? coach.coach_number : '',
            coach_type: coach ? coach.coach_type : '',
            seat_number: tk.seat_number,
            berth_type: seat ? seat.berth_type : 'LOWER',
            journey_date: tk.journey_date,
            booking_date: tk.booking_date,
            start_sequence: tk.start_sequence || 1,
            end_sequence: tk.end_sequence || 9999,
            fare: tk.fare,
            status: tk.status,
            source_station: src ? src.station_name : '',
            source_code: src ? src.station_code : '',
            destination_station: dst ? dst.station_name : '',
            dest_code: dst ? dst.station_code : '',
            next_of_kin: kin
        });
    } catch (err) {
        console.error('PNR lookup error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------------------------------
// TICKET CANCELLATION (Atomic Transaction + Auto Seat Freeing)
// ----------------------------------------------------------------------------
router.put('/:id/cancel', async (req, res) => {
    const ticketId = parseInt(req.params.id);

    try {
        const result = await db.transaction(async (conn) => {
            if (conn) {
                const [tickets] = await conn.execute('SELECT * FROM tickets WHERE ticket_id = ?', [ticketId]);
                if (!tickets || tickets.length === 0) {
                    const err = new Error('Ticket not found.');
                    err.statusCode = 404;
                    throw err;
                }

                const ticket = tickets[0];
                if (ticket.status === 'CANCELLED') {
                    const err = new Error('Ticket is already cancelled.');
                    err.statusCode = 400;
                    throw err;
                }

                // Update ticket status
                await conn.execute("UPDATE tickets SET status = 'CANCELLED' WHERE ticket_id = ?", [ticketId]);

                // Check if any other confirmed ticket exists for this seat & coach on that date
                const [activeOthers] = await conn.execute(
                    "SELECT ticket_id FROM tickets WHERE coach_id = ? AND seat_number = ? AND journey_date = ? AND status = 'CONFIRMED' AND ticket_id != ?",
                    [ticket.coach_id, ticket.seat_number, ticket.journey_date, ticketId]
                );

                if (!activeOthers || activeOthers.length === 0) {
                    await conn.execute("UPDATE seats SET status = 'AVAILABLE' WHERE coach_id = ? AND seat_number = ?", [ticket.coach_id, ticket.seat_number]);
                }

                const refundAmount = (ticket.fare * 0.8).toFixed(2);
                return { ticketId, pnr_no: ticket.pnr_no, status: 'CANCELLED', refundAmount };
            } else {
                const ticket = db.mockDb.tickets.find(t => t.ticket_id === ticketId);
                if (!ticket) {
                    const err = new Error('Ticket not found.');
                    err.statusCode = 404;
                    throw err;
                }
                if (ticket.status === 'CANCELLED') {
                    const err = new Error('Ticket is already cancelled.');
                    err.statusCode = 400;
                    throw err;
                }

                ticket.status = 'CANCELLED';

                const otherActive = db.mockDb.tickets.find(t => 
                    t.coach_id === ticket.coach_id &&
                    t.seat_number === ticket.seat_number &&
                    t.journey_date === ticket.journey_date &&
                    t.status === 'CONFIRMED' &&
                    t.ticket_id !== ticketId
                );

                if (!otherActive) {
                    const seat = db.mockDb.seats.find(s => s.coach_id === ticket.coach_id && s.seat_number === ticket.seat_number);
                    if (seat) seat.status = 'AVAILABLE';
                }

                const refundAmount = (ticket.fare * 0.8).toFixed(2);
                return { ticketId, pnr_no: ticket.pnr_no, status: 'CANCELLED', refundAmount };
            }
        });

        res.json({
            message: `Ticket ${result.pnr_no} has been cancelled successfully.`,
            refund_amount: result.refundAmount,
            result
        });
    } catch (err) {
        console.error('Cancellation error:', err);
        const code = err.statusCode || 500;
        res.status(code).json({ error: err.message || 'Cancellation failed.' });
    }
});

module.exports = router;
