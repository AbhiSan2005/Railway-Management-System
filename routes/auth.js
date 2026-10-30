const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || 'railway_jwt_secret_key_2026';

// ----------------------------------------------------------------------------
// PASSENGER REGISTRATION
// ----------------------------------------------------------------------------
router.post('/register', async (req, res) => {
    try {
        const { name, dob, gender, primary_phone, email, password, street, city, state, pincode } = req.body;

        if (!name || !dob || !primary_phone || !email || !password || !city) {
            return res.status(400).json({ error: 'Name, Date of Birth, Phone, Email, Password, and City are required.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const birthYear = new Date(dob).getFullYear();
        const calculatedAge = new Date().getFullYear() - birthYear;

        if (!db.isMock()) {
            const existing = await db.query('SELECT passenger_id FROM passengers WHERE email = ?', [email], req);
            if (existing && existing.length > 0) {
                return res.status(409).json({ error: 'A passenger with this email already exists.' });
            }

            const sql = `
                INSERT INTO passengers (name, dob, age, gender, primary_phone, email, password_hash, street, city, state, pincode)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const result = await db.query(sql, [name, dob, calculatedAge, gender || 'Male', primary_phone, email, hashedPassword, street || '', city, state || '', pincode || ''], req);
            const passengerId = result.insertId;

            // Also insert into passenger_phones for 1NF compliance
            await db.query('INSERT INTO passenger_phones (passenger_id, phone_number, phone_type) VALUES (?, ?, ?)', [passengerId, primary_phone, 'Mobile'], req);

            const token = jwt.sign({ id: passengerId, role: 'passenger', email, name }, JWT_SECRET, { expiresIn: '7d' });
            return res.status(201).json({
                message: 'Registration successful!',
                token,
                user: { passenger_id: passengerId, name, email, role: 'passenger', primary_phone, city }
            });
        }

        // Mock Fallback
        const exists = db.mockDb.passengers.find(p => p.email.toLowerCase() === email.toLowerCase().trim());
        if (exists) {
            return res.status(409).json({ error: 'A passenger with this email already exists.' });
        }

        const newPassengerId = db.mockDb.passengers.length > 0 ? Math.max(...db.mockDb.passengers.map(p => p.passenger_id)) + 1 : 1;
        const newPassenger = {
            passenger_id: newPassengerId,
            name,
            dob,
            age: calculatedAge,
            gender: gender || 'Male',
            primary_phone,
            email,
            password_hash: hashedPassword,
            street: street || '',
            city,
            state: state || '',
            pincode: pincode || ''
        };

        db.mockDb.passengers.unshift(newPassenger);
        db.mockDb.passenger_phones.push({ passenger_id: newPassengerId, phone_number: primary_phone, phone_type: 'Mobile' });

        const token = jwt.sign({ id: newPassengerId, role: 'passenger', email, name }, JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({
            message: 'Registration successful!',
            token,
            user: { passenger_id: newPassengerId, name, email, role: 'passenger', primary_phone, city }
        });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: err.message || 'Internal server error during registration.' });
    }
});

// ----------------------------------------------------------------------------
// PASSENGER LOGIN
// ----------------------------------------------------------------------------
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        let passenger = null;
        if (!db.isMock()) {
            const rows = await db.query('SELECT * FROM passengers WHERE email = ?', [email], req);
            if (rows && rows.length > 0) {
                passenger = rows[0];
            }
        } else {
            passenger = db.mockDb.passengers.find(p => p.email.toLowerCase() === email.toLowerCase().trim());
        }

        if (!passenger) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const match = await bcrypt.compare(password, passenger.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const token = jwt.sign(
            { id: passenger.passenger_id, role: 'passenger', email: passenger.email, name: passenger.name },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        const safeUser = { ...passenger };
        delete safeUser.password_hash;
        safeUser.role = 'passenger';

        res.json({
            message: 'Login successful!',
            token,
            user: safeUser
        });
    } catch (err) {
        console.error('Passenger login error:', err);
        res.status(500).json({ error: err.message || 'Server error during passenger login.' });
    }
});

// ----------------------------------------------------------------------------
// EMPLOYEE / STAFF LOGIN
// ----------------------------------------------------------------------------
router.post('/emp-login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Employee email and password are required.' });
        }

        let employee = null;
        if (!db.isMock()) {
            const rows = await db.query('SELECT * FROM employees WHERE email = ?', [email], req);
            if (rows && rows.length > 0) {
                employee = rows[0];
            }
        } else {
            employee = db.mockDb.employees.find(e => e.email.toLowerCase() === email.toLowerCase().trim());
        }

        if (!employee) {
            return res.status(401).json({ error: 'Invalid employee credentials.' });
        }

        const match = await bcrypt.compare(password, employee.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'Invalid employee credentials.' });
        }

        const token = jwt.sign(
            { id: employee.employee_id, role: 'employee', designation: employee.designation, email: employee.email, name: employee.name },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        const safeEmployee = { ...employee };
        delete safeEmployee.password_hash;
        safeEmployee.role = 'employee';

        res.json({
            message: 'Staff authentication successful!',
            token,
            user: safeEmployee
        });
    } catch (err) {
        console.error('Employee login error:', err);
        res.status(500).json({ error: err.message || 'Server error during employee login.' });
    }
});

// ----------------------------------------------------------------------------
// GET CURRENT USER / SESSION VERIFICATION
// ----------------------------------------------------------------------------
router.get('/me', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No authorization token provided.' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role === 'passenger') {
            let p = null;
            if (!db.isMock()) {
                const rows = await db.query('SELECT * FROM passengers WHERE passenger_id = ?', [decoded.id], req);
                p = rows[0];
            } else {
                p = db.mockDb.passengers.find(x => x.passenger_id === decoded.id);
            }
            if (!p) return res.status(404).json({ error: 'Passenger account not found.' });
            const safeUser = { ...p };
            delete safeUser.password_hash;
            safeUser.role = 'passenger';
            return res.json({ user: safeUser });
        } else {
            let e = null;
            if (!db.isMock()) {
                const rows = await db.query('SELECT * FROM employees WHERE employee_id = ?', [decoded.id], req);
                e = rows[0];
            } else {
                e = db.mockDb.employees.find(x => x.employee_id === decoded.id);
            }
            if (!e) return res.status(404).json({ error: 'Staff account not found.' });
            const safeStaff = { ...e };
            delete safeStaff.password_hash;
            safeStaff.role = 'employee';
            return res.json({ user: safeStaff });
        }
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token.' });
    }
});

module.exports = router;

