const http = require('http');
const app = require('./server');
const db = require('./database/db');

let server;
const PORT = 3999;
const BASE_URL = `http://localhost:${PORT}`;

function request(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const reqHeaders = { 'Content-Type': 'application/json', ...headers };
        const req = http.request(url, { method, headers: reqHeaders }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = JSON.parse(data);
                } catch (e) {
                    parsed = data;
                }
                resolve({ status: res.statusCode, headers: res.headers, body: parsed });
            });
        });
        req.on('error', reject);
        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function runTests() {
    console.log('========================================================');
    console.log('STARTING RAILTRANSIT SYSTEM END-TO-END TEST SUITE');
    console.log('========================================================\n');

    await db.initDatabase();
    server = app.listen(PORT);
    let passed = 0;
    let failed = 0;

    function assert(name, condition, details = '') {
        if (condition) {
            console.log(`PASS: ${name}`);
            passed++;
        } else {
            console.error(`FAIL: ${name} - ${details}`);
            failed++;
        }
    }

    try {
        // 1. Health & Status
        const statusRes = await request('GET', '/api/status');
        assert('Status endpoint returns online', statusRes.status === 200 && statusRes.body.status === 'online');

        // 2. Network Stats
        const statsRes = await request('GET', '/api/stats');
        assert('Stats returns counts', statsRes.status === 200 && typeof statsRes.body.trains === 'number');

        // 3. Stations & Routes
        const stationsRes = await request('GET', '/api/stations');
        assert('Stations list populated', stationsRes.status === 200 && stationsRes.body.length >= 8);

        const routesRes = await request('GET', '/api/routes');
        assert('Routes list populated', routesRes.status === 200 && routesRes.body.length >= 5);

        // 4. Train Search & Timetables
        const searchRes = await request('GET', '/api/trains/search?from=1&to=2');
        assert('Train search finds New Delhi to Mumbai train', searchRes.status === 200 && searchRes.body.length > 0);

        const scheduleRes = await request('GET', '/api/trains/1/schedule');
        assert('Train halts schedule populated', scheduleRes.status === 200 && scheduleRes.body.length >= 5);

        // 5. Auth: Passenger Registration with bcrypt
        const testEmail = `test_${Date.now()}@example.com`;
        const regRes = await request('POST', '/api/auth/register', {
            name: 'Kavya Sen',
            dob: '2000-08-10',
            gender: 'Female',
            primary_phone: '9876500000',
            email: testEmail,
            password: 'password123',
            street: '10 Park Avenue',
            city: 'New Delhi',
            state: 'Delhi',
            pincode: '110002'
        });
        assert('Passenger registration returns token & user', regRes.status === 201 && regRes.body.token && regRes.body.user);
        const newPassengerId = regRes.body.user.passenger_id;

        // 6. Auth: Passenger Login with bcrypt verification
        const loginRes = await request('POST', '/api/auth/login', {
            email: testEmail,
            password: 'password123'
        });
        assert('Passenger login successful with bcrypt comparison', loginRes.status === 200 && loginRes.body.token);

        // Wrong password test
        const badLoginRes = await request('POST', '/api/auth/login', {
            email: testEmail,
            password: 'wrongpassword'
        });
        assert('Passenger login fails with invalid password (401)', badLoginRes.status === 401);

        // 7. Auth: Employee Login with bcrypt
        const empLoginRes = await request('POST', '/api/auth/emp-login', {
            email: 'rajesh.admin@railtransit.gov.in',
            password: 'password123'
        });
        assert('Employee login authenticates station master', empLoginRes.status === 200 && empLoginRes.body.user.designation === 'Station Master');

        // 8. Interactive Seat Grid & Availability
        const seatsRes = await request('GET', '/api/trains/1/seats?coach_id=3&journey_date=2026-11-25');
        assert('Real-time seat grid retrieved', seatsRes.status === 200 && Array.isArray(seatsRes.body.seats));

        // 9. ACID Ticket Reservation Transaction
        const bookRes = await request('POST', '/api/bookings/reserve', {
            passenger_id: newPassengerId,
            train_id: 1,
            coach_id: 3,
            seat_number: 7,
            journey_date: '2026-11-25',
            fare: 2150.00
        });
        assert('ACID Ticket Booking completes and returns PNR', bookRes.status === 201 && bookRes.body.pnr);
        const bookedPnr = bookRes.body.pnr;
        const bookedTicketId = bookRes.body.ticket.ticket_id;

        // 10. Concurrency / Collision Check (Booking the SAME seat on the SAME date)
        const conflictRes = await request('POST', '/api/bookings/reserve', {
            passenger_id: 1,
            train_id: 1,
            coach_id: 3,
            seat_number: 7,
            journey_date: '2026-11-25',
            fare: 2150.00
        });
        assert('Seat collision correctly rejected with 409 Conflict', conflictRes.status === 409);

        // 11. PNR Inquiry Lookup
        const pnrRes = await request('GET', `/api/bookings/pnr/${bookedPnr}`);
        assert('PNR status lookup returns confirmed ticket details', pnrRes.status === 200 && pnrRes.body.status === 'CONFIRMED');

        // 12. Passenger History
        const myTicketsRes = await request('GET', `/api/bookings/my-tickets?passenger_id=${newPassengerId}`);
        assert('Passenger tickets history retrieves newly booked ticket', myTicketsRes.status === 200 && myTicketsRes.body.length >= 1);

        // 13. Atomic Cancellation & Seat Freeing
        const cancelRes = await request('PUT', `/api/bookings/${bookedTicketId}/cancel`);
        assert('Atomic ticket cancellation calculates refund & frees seat', cancelRes.status === 200 && cancelRes.body.refund_amount);

        // 14. Emergency Contact (Next of Kin) CRUD
        const addKinRes = await request('POST', '/api/passengers/kin', {
            passenger_id: newPassengerId,
            kin_name: 'Anand Sen',
            relation: 'Father',
            phone_number: '9811002200'
        });
        assert('Add Next of Kin emergency contact successful', addKinRes.status === 201);

        const getKinRes = await request('GET', `/api/passengers/kin?passenger_id=${newPassengerId}`);
        assert('Next of Kin list contains added contact', getKinRes.status === 200 && getKinRes.body.length === 1);

        const delKinRes = await request('DELETE', `/api/passengers/kin?passenger_id=${newPassengerId}&kin_name=Anand%20Sen`);
        assert('Remove Next of Kin emergency contact successful', delKinRes.status === 200);

        // 15. Administrative Views
        const adminSchedRes = await request('GET', '/api/admin/views/schedules');
        assert('Administrative View: vw_train_schedules loaded', adminSchedRes.status === 200 && adminSchedRes.body.length > 0);

        const adminCapRes = await request('GET', '/api/admin/views/capacity');
        assert('Administrative View: vw_coach_capacity_utilization loaded', adminCapRes.status === 200 && adminCapRes.body.length > 0);

        const adminRosterRes = await request('GET', '/api/admin/views/rosters');
        assert('Administrative View: vw_station_employee_rosters loaded', adminRosterRes.status === 200 && adminRosterRes.body.length > 0);

        // 16. Admin Operations: Add Train, Add Route, Update Delay
        const addTrainRes = await request('POST', '/api/admin/trains', {
            train_number: '12430',
            train_name: 'Lucknow AC Superfast',
            train_type: 'Superfast Express',
            total_coaches: 16,
            route_id: 1
        });
        assert('Admin adds new train line with auto-provisioned coaches', addTrainRes.status === 201);

        const addRouteRes = await request('POST', '/api/admin/routes', {
            source_station_id: 3,
            destination_station_id: 4,
            distance_km: 359.00,
            duration_hours: 4.5
        });
        assert('Admin registers new railway route', addRouteRes.status === 201);

        const delayRes = await request('PUT', '/api/admin/schedules/delay', {
            schedule_id: 1,
            arrival_time: null,
            departure_time: '17:15:00',
            platform_no: 4
        });
        assert('Admin updates schedule departure timing and platform', delayRes.status === 200);

        // 17. Staff Passenger Inspection
        const inspectRes = await request('GET', '/api/passengers?search=Rahul');
        assert('Staff passenger inspection searches database', inspectRes.status === 200 && inspectRes.body.length > 0);

    } catch (err) {
        console.error('Test execution error:', err);
        failed++;
    } finally {
        server.close();
        console.log('\n========================================================');
        console.log(`TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
        console.log('========================================================');
        process.exit(failed > 0 ? 1 : 0);
    }
}

runTests();
