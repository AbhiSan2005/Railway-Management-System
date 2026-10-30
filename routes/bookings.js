const express = require('express');
const router = express.Router();
const db = require('../database/db');

// ----------------------------------------------------------------------------
// ACID TICKET RESERVATION TRANSACTION
// ----------------------------------------------------------------------------
router.post('/reserve', async (req, res) => {
    const { passenger_id, train_id, coach_id, seat_number, journey_date, fare } = req.body;

    if (!passenger_id || !train_id || !coach_id || !seat_number || !journey_date) {
        return res.status(400).json({ error: 'All reservation parameters (passenger_id, train_id, coach_id, seat_number, journey_date) are required.' });
    }

    const pnr_no = 'PNR' + Math.floor(100000 + Math.random() * 900000);
    const parsedFare = parseFloat(fare) || 1500.00;

    try {
        const result = await db.transaction(async (conn) => {
            if (conn) {
                // Live MySQL Transaction with SELECT ... FOR UPDATE
                const [existing] = await conn.execute(
                    `SELECT ticket_id FROM tickets 
                     WHERE train_id = ? AND coach_id = ? AND seat_number = ? AND journey_date = ? AND status = 'CONFIRMED'
                     FOR UPDATE`,
                    [train_id, coach_id, seat_number, journey_date]
                );

                if (existing && existing.length > 0) {
                    const conflictErr = new Error(`Seat ${seat_number} is already booked on ${journey_date}.`);
                    conflictErr.statusCode = 409;
                    throw conflictErr;
                }

                const [insertRes] = await conn.execute(
                    `INSERT INTO tickets (pnr_no, passenger_id, train_id, coach_id, seat_number, journey_date, fare, status)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 'CONFIRMED')`,
                    [pnr_no, passenger_id, train_id, coach_id, seat_number, journey_date, parsedFare]
                );

                // Update physical seat status
                await conn.execute(
                    `UPDATE seats SET status = 'BOOKED' WHERE coach_id = ? AND seat_number = ?`,
                    [coach_id, seat_number]
                );

                return {
                    ticket_id: insertRes.insertId,
                    pnr_no,
                    passenger_id,
                    train_id,
                    coach_id,
                    seat_number,
                    journey_date,
                    fare: parsedFare,
                    status: 'CONFIRMED'
                };
            } else {
                // Mock In-Memory Transaction
                const conflict = db.mockDb.tickets.find(t => 
                    t.train_id === parseInt(train_id) &&
                    t.coach_id === parseInt(coach_id) &&
                    t.seat_number === parseInt(seat_number) &&
                    t.journey_date === journey_date &&
                    t.status === 'CONFIRMED'
                );

                if (conflict) {
                    const err = new Error(`Seat ${seat_number} is already booked on ${journey_date}.`);
                    err.statusCode = 409;
                    throw err;
                }

                const newId = db.mockDb.tickets.length > 0 ? Math.max(...db.mockDb.tickets.map(t => t.ticket_id)) + 1 : 1;
                const newTicket = {
                    ticket_id: newId,
                    pnr_no,
                    passenger_id: parseInt(passenger_id),
                    train_id: parseInt(train_id),
                    coach_id: parseInt(coach_id),
                    seat_number: parseInt(seat_number),
                    journey_date,
                    booking_date: new Date().toISOString().replace('T', ' ').substring(0, 19),
                    fare: parsedFare,
                    status: 'CONFIRMED'
                };

                db.mockDb.tickets.unshift(newTicket);

                const seatObj = db.mockDb.seats.find(s => s.coach_id === parseInt(coach_id) && s.seat_number === parseInt(seat_number));
                if (seatObj) {
                    seatObj.status = 'BOOKED';
                }

                return newTicket;
            }
        });

        res.status(201).json({
            message: 'Ticket booked successfully under ACID transaction!',
            ticket: result,
            pnr: pnr_no
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
                    s_src.station_name AS source_station, s_src.station_code AS source_code,
                    s_dst.station_name AS destination_station, s_dst.station_code AS dest_code
                FROM tickets tk
                JOIN passengers p ON tk.passenger_id = p.passenger_id
                JOIN trains t ON tk.train_id = t.train_id
                JOIN routes r ON t.route_id = r.route_id
                JOIN stations s_src ON r.source_station_id = s_src.station_id
                JOIN stations s_dst ON r.destination_station_id = s_dst.station_id
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
            const src = route ? db.mockDb.stations.find(s => s.station_id === route.source_station_id) : null;
            const dst = route ? db.mockDb.stations.find(s => s.station_id === route.destination_station_id) : null;
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
                    s_src.station_name AS source_station, s_src.station_code AS source_code,
                    s_dst.station_name AS destination_station, s_dst.station_code AS dest_code
                FROM tickets tk
                JOIN passengers p ON tk.passenger_id = p.passenger_id
                JOIN trains t ON tk.train_id = t.train_id
                JOIN routes r ON t.route_id = r.route_id
                JOIN stations s_src ON r.source_station_id = s_src.station_id
                JOIN stations s_dst ON r.destination_station_id = s_dst.station_id
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
        const src = route ? db.mockDb.stations.find(s => s.station_id === route.source_station_id) : null;
        const dst = route ? db.mockDb.stations.find(s => s.station_id === route.destination_station_id) : null;
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

