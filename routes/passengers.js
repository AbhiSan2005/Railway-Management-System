const express = require('express');
const router = express.Router();
const db = require('../database/db');

// Helper to extract passenger ID from query or authorization header
function getPassengerId(req) {
    if (req.query.passenger_id) return parseInt(req.query.passenger_id);
    if (req.body.passenger_id) return parseInt(req.body.passenger_id);
    return null;
}

// ----------------------------------------------------------------------------
// GET PASSENGER PROFILE
// ----------------------------------------------------------------------------
router.get('/profile', async (req, res) => {
    const passengerId = getPassengerId(req);
    if (!passengerId) {
        return res.status(400).json({ error: 'passenger_id query parameter is required.' });
    }

    try {
        let passenger = null;
        let phones = [];
        let nextOfKin = [];

        if (!db.isMock()) {
            const pRows = await db.query('SELECT * FROM passengers WHERE passenger_id = ?', [passengerId], req);
            if (!pRows || pRows.length === 0) {
                return res.status(404).json({ error: 'Passenger not found.' });
            }
            passenger = { ...pRows[0] };
            delete passenger.password_hash;

            phones = await db.query('SELECT * FROM passenger_phones WHERE passenger_id = ?', [passengerId], req);
            nextOfKin = await db.query('SELECT * FROM next_of_kin WHERE passenger_id = ?', [passengerId], req);
        } else {
            const p = db.mockDb.passengers.find(x => x.passenger_id === passengerId);
            if (!p) {
                return res.status(404).json({ error: 'Passenger not found.' });
            }
            passenger = { ...p };
            delete passenger.password_hash;

            phones = db.mockDb.passenger_phones.filter(x => x.passenger_id === passengerId);
            nextOfKin = db.mockDb.next_of_kin.filter(x => x.passenger_id === passengerId);
        }

        res.json({
            profile: passenger,
            phone_numbers: phones,
            next_of_kin: nextOfKin
        });
    } catch (err) {
        console.error('Fetch profile error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------------------------------
// UPDATE PASSENGER PROFILE (Composite address, phone, etc.)
// ----------------------------------------------------------------------------
router.put('/profile', async (req, res) => {
    const { passenger_id, name, primary_phone, street, city, state, pincode } = req.body;
    if (!passenger_id) {
        return res.status(400).json({ error: 'passenger_id is required.' });
    }

    try {
        if (!db.isMock()) {
            const sql = `
                UPDATE passengers
                SET name = COALESCE(?, name),
                    primary_phone = COALESCE(?, primary_phone),
                    street = COALESCE(?, street),
                    city = COALESCE(?, city),
                    state = COALESCE(?, state),
                    pincode = COALESCE(?, pincode)
                WHERE passenger_id = ?
            `;
            await db.query(sql, [name, primary_phone, street, city, state, pincode, passenger_id], req);
            return res.json({ message: 'Profile updated successfully.' });
        }

        const p = db.mockDb.passengers.find(x => x.passenger_id === parseInt(passenger_id));
        if (!p) {
            return res.status(404).json({ error: 'Passenger not found.' });
        }
        if (name) p.name = name;
        if (primary_phone) p.primary_phone = primary_phone;
        if (street !== undefined) p.street = street;
        if (city) p.city = city;
        if (state !== undefined) p.state = state;
        if (pincode !== undefined) p.pincode = pincode;

        res.json({ message: 'Profile updated successfully.', profile: p });
    } catch (err) {
        console.error('Update profile error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------------------------------
// GET NEXT OF KIN (Emergency Contacts)
// ----------------------------------------------------------------------------
router.get('/kin', async (req, res) => {
    const passengerId = getPassengerId(req);
    if (!passengerId) {
        return res.status(400).json({ error: 'passenger_id is required.' });
    }

    try {
        if (!db.isMock()) {
            const rows = await db.query('SELECT * FROM next_of_kin WHERE passenger_id = ?', [passengerId], req);
            return res.json(rows);
        }
        const kin = db.mockDb.next_of_kin.filter(x => x.passenger_id === passengerId);
        res.json(kin);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------------------------------
// ADD NEXT OF KIN
// ----------------------------------------------------------------------------
router.post('/kin', async (req, res) => {
    const { passenger_id, kin_name, relation, phone_number } = req.body;
    if (!passenger_id || !kin_name || !relation || !phone_number) {
        return res.status(400).json({ error: 'All fields (passenger_id, kin_name, relation, phone_number) are required.' });
    }

    try {
        if (!db.isMock()) {
            const check = await db.query('SELECT * FROM next_of_kin WHERE passenger_id = ? AND kin_name = ?', [passenger_id, kin_name], req);
            if (check && check.length > 0) {
                return res.status(409).json({ error: 'Emergency contact with this name already exists for this passenger.' });
            }

            await db.query(
                'INSERT INTO next_of_kin (passenger_id, kin_name, relation, phone_number) VALUES (?, ?, ?, ?)',
                [passenger_id, kin_name, relation, phone_number],
                req
            );
            return res.status(201).json({ message: 'Emergency contact added successfully.' });
        }

        const exists = db.mockDb.next_of_kin.find(k => k.passenger_id === parseInt(passenger_id) && k.kin_name.toLowerCase() === kin_name.toLowerCase().trim());
        if (exists) {
            return res.status(409).json({ error: 'Emergency contact with this name already exists.' });
        }

        const newKin = {
            passenger_id: parseInt(passenger_id),
            kin_name: kin_name.trim(),
            relation: relation.trim(),
            phone_number: phone_number.trim()
        };
        db.mockDb.next_of_kin.push(newKin);

        res.status(201).json({ message: 'Emergency contact added successfully.', kin: newKin });
    } catch (err) {
        console.error('Add kin error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------------------------------
// DELETE NEXT OF KIN
// ----------------------------------------------------------------------------
router.delete('/kin', async (req, res) => {
    const passenger_id = (req.body && req.body.passenger_id) || req.query.passenger_id;
    const kin_name = (req.body && req.body.kin_name) || req.query.kin_name;
    if (!passenger_id || !kin_name) {
        return res.status(400).json({ error: 'passenger_id and kin_name are required.' });
    }

    try {
        if (!db.isMock()) {
            await db.query('DELETE FROM next_of_kin WHERE passenger_id = ? AND kin_name = ?', [passenger_id, kin_name], req);
            return res.json({ message: 'Emergency contact removed successfully.' });
        }

        const index = db.mockDb.next_of_kin.findIndex(k => k.passenger_id === parseInt(passenger_id) && k.kin_name === kin_name);
        if (index === -1) {
            return res.status(404).json({ error: 'Emergency contact not found.' });
        }
        db.mockDb.next_of_kin.splice(index, 1);
        res.json({ message: 'Emergency contact removed successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------------------------------
// PASSENGER LIST (For Employee inspection or admin)
// ----------------------------------------------------------------------------
router.get('/', async (req, res) => {
    const { search } = req.query;
    try {
        if (!db.isMock()) {
            let sql = `
                SELECT p.passenger_id, p.name, p.dob, p.age, p.gender, p.primary_phone, p.email, p.city, p.state
                FROM passengers p
            `;
            const params = [];
            if (search) {
                sql += ' WHERE p.name LIKE ? OR p.email LIKE ? OR p.primary_phone LIKE ? ';
                const q = `%${search}%`;
                params.push(q, q, q);
            }
            sql += ' ORDER BY p.passenger_id DESC';
            const rows = await db.query(sql, params, req);
            return res.json(rows);
        }

        let list = db.mockDb.passengers.map(p => {
            const copy = { ...p };
            delete copy.password_hash;
            return copy;
        });

        if (search) {
            const q = search.toLowerCase();
            list = list.filter(p => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || p.primary_phone.includes(q));
        }
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
