// ============================================================================
// NATIONAL RAIL TRANSIT OPERATIONS - CLIENT CONTROLLER & LATENCY PROFILER
// ============================================================================

const API_BASE = '/api';

let stationsList = [];
let trainsList = [];
let passengersList = [];

// High-precision API fetch wrapper that profiles round-trip and DB latency
async function apiFetch(endpoint, options = {}) {
    const t0 = performance.now();
    try {
        const response = await fetch(endpoint, options);
        const clientRtt = parseFloat((performance.now() - t0).toFixed(2));

        // Read server-reported DB execution time from headers
        const dbLatency = response.headers.get('X-Response-Time-DB');
        const serverTiming = response.headers.get('Server-Timing');

        if (dbLatency) {
            updateLatencyDisplay(dbLatency, clientRtt);
            console.log(`[Latency Profiler] ${endpoint} | Total RTT: ${clientRtt}ms | MySQL Engine: ${dbLatency} (${serverTiming})`);
        }

        return response;
    } catch (err) {
        console.error(`[Network Error] ${endpoint}:`, err);
        throw err;
    }
}

function updateLatencyDisplay(dbLatency, clientRtt) {
    const badge = document.getElementById('latency-text');
    if (badge) {
        badge.textContent = `DB: ${dbLatency}`;
        badge.title = `MySQL Query: ${dbLatency} | Total Round-Trip: ${clientRtt}ms`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initEventListeners();
    fetchSystemStatus();
    fetchStats();
    loadStations();
    loadTrains();
    loadPassengers();
    loadTickets();

    // Default journey date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateInput = document.getElementById('book-date');
    if (dateInput) {
        dateInput.value = tomorrow.toISOString().split('T')[0];
        dateInput.min = new Date().toISOString().split('T')[0];
    }
});

// ----------------------------------------------------------------------------
// 1. TAB CONTROLLER
// ----------------------------------------------------------------------------
function initTabs() {
    const navButtons = document.querySelectorAll('.nav-tab');
    const tabPanes = document.querySelectorAll('.view-panel');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-tab');

            navButtons.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            const targetPane = document.getElementById(targetId);
            if (targetPane) {
                targetPane.classList.add('active');
            }

            if (targetId === 'tickets-tab') loadTickets();
            if (targetId === 'passengers-tab') loadPassengers();
            if (targetId === 'trains-tab') loadTrains();
        });
    });
}

// ----------------------------------------------------------------------------
// 2. EVENT LISTENERS
// ----------------------------------------------------------------------------
function initEventListeners() {
    // Train Filter
    document.getElementById('btn-search-trains').addEventListener('click', () => {
        const from = document.getElementById('search-from').value;
        const to = document.getElementById('search-to').value;
        loadTrains(from, to);
    });

    document.getElementById('btn-reset-trains').addEventListener('click', () => {
        document.getElementById('search-from').value = '';
        document.getElementById('search-to').value = '';
        loadTrains();
    });

    // Booking: Train selection triggers coaches load
    document.getElementById('book-train').addEventListener('change', (e) => {
        loadCoachesForTrain(e.target.value);
    });

    // Booking: Coach change updates fare calculation
    document.getElementById('book-coach').addEventListener('change', (e) => {
        const selectedOpt = e.target.selectedOptions[0];
        if (selectedOpt && selectedOpt.dataset.fare) {
            document.getElementById('book-fare').value = selectedOpt.dataset.fare;
        }
    });

    // Booking submission
    document.getElementById('booking-form').addEventListener('submit', handleTicketBooking);

    // Passenger registration submission
    document.getElementById('passenger-form').addEventListener('submit', handlePassengerRegister);

    // PNR Search
    document.getElementById('btn-search-pnr').addEventListener('click', () => {
        const pnr = document.getElementById('pnr-input').value;
        loadTickets(pnr);
    });

    document.getElementById('btn-clear-pnr').addEventListener('click', () => {
        document.getElementById('pnr-input').value = '';
        loadTickets();
    });

    // Timetable Modal Close
    document.getElementById('modal-close-btn').addEventListener('click', closeModal);
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('schedule-modal');
        if (e.target === modal) closeModal();
    });
}

// ----------------------------------------------------------------------------
// 3. SYSTEM STATUS & METRICS
// ----------------------------------------------------------------------------
async function fetchSystemStatus() {
    try {
        const res = await apiFetch(`${API_BASE}/status`);
        const data = await res.json();
        const dot = document.getElementById('status-dot');
        const text = document.getElementById('status-text');

        dot.classList.add('online');
        text.textContent = data.databaseEngine;

        if (data.lastDbLatencyMs !== undefined) {
            updateLatencyDisplay(`${data.lastDbLatencyMs}ms`, 10);
        }
    } catch {
        document.getElementById('status-text').textContent = 'Server Offline';
    }
}

async function fetchStats() {
    try {
        const res = await apiFetch(`${API_BASE}/stats`);
        const data = await res.json();
        document.getElementById('stat-trains').textContent = data.trains || 0;
        document.getElementById('stat-stations').textContent = data.stations || 0;
        document.getElementById('stat-passengers').textContent = data.passengers || 0;
        document.getElementById('stat-bookings').textContent = data.activeBookings || 0;
    } catch (err) {
        console.error('Metrics fetch error:', err);
    }
}

// ----------------------------------------------------------------------------
// 4. STATIONS & TRAIN SERVICES
// ----------------------------------------------------------------------------
async function loadStations() {
    try {
        const res = await apiFetch(`${API_BASE}/stations`);
        stationsList = await res.json();

        const fromSelect = document.getElementById('search-from');
        const toSelect = document.getElementById('search-to');

        fromSelect.innerHTML = '<option value="">All Stations</option>';
        toSelect.innerHTML = '<option value="">All Stations</option>';

        stationsList.forEach(st => {
            const opt1 = `<option value="${st.station_id}">${st.station_name} (${st.station_code}) - ${st.city}</option>`;
            const opt2 = `<option value="${st.station_id}">${st.station_name} (${st.station_code}) - ${st.city}</option>`;
            fromSelect.insertAdjacentHTML('beforeend', opt1);
            toSelect.insertAdjacentHTML('beforeend', opt2);
        });
    } catch (err) {
        showToast('Unable to load station database.', true);
    }
}

async function loadTrains(from = '', to = '') {
    const container = document.getElementById('trains-container');
    const badge = document.getElementById('trains-count-badge');
    container.innerHTML = '<p class="field-help">Loading train lines...</p>';

    try {
        let url = `${API_BASE}/trains`;
        if (from && to) {
            url += `?from=${from}&to=${to}`;
        }
        const res = await apiFetch(url);
        trainsList = await res.json();

        badge.textContent = `${trainsList.length} service${trainsList.length === 1 ? '' : 's'} available`;

        if (trainsList.length === 0) {
            container.innerHTML = '<div class="panel-card"><p class="field-help">No direct scheduled services found for the selected route.</p></div>';
            return;
        }

        container.innerHTML = '';
        const trainSelect = document.getElementById('book-train');
        trainSelect.innerHTML = '<option value="">Select operational train</option>';

        trainsList.forEach(train => {
            const card = document.createElement('div');
            card.className = 'train-item-card';
            card.innerHTML = `
                <div>
                    <div class="train-top-row">
                        <span class="train-id-badge">${train.train_number}</span>
                        <span class="train-service-type">${train.train_type}</span>
                    </div>
                    <h4 class="train-name-heading">${train.train_name}</h4>
                    <div class="route-flight-bar">
                        <div class="station-node">
                            <span class="station-iata">${train.source_code || 'ORIGIN'}</span>
                            <span class="station-full-name">${train.source_station || 'Origin Station'}</span>
                        </div>
                        <div class="route-duration-indicator">
                            <span>${train.duration_hours || '16'}h • ${train.distance_km || '1000'} km</span>
                            <div class="route-line"></div>
                        </div>
                        <div class="station-node text-right">
                            <span class="station-iata">${train.dest_code || 'DEST'}</span>
                            <span class="station-full-name">${train.destination_station || 'Terminus'}</span>
                        </div>
                    </div>
                    <div class="field-help">Configuration: ${train.total_coaches || 12} coaches</div>
                </div>
                <div class="card-foot-actions">
                    <button class="btn btn-outline" onclick="viewSchedule(${train.train_id}, '${train.train_name}')">Timetable</button>
                    <button class="btn btn-primary" onclick="prepareBooking(${train.train_id})">Reserve Seat</button>
                </div>
            `;
            container.appendChild(card);

            const opt = `<option value="${train.train_id}">${train.train_number} - ${train.train_name}</option>`;
            trainSelect.insertAdjacentHTML('beforeend', opt);
        });
    } catch (err) {
        container.innerHTML = '<p class="field-help">Failed to retrieve train records.</p>';
    }
}

// ----------------------------------------------------------------------------
// 5. TIMETABLE MODAL
// ----------------------------------------------------------------------------
async function viewSchedule(trainId, trainName) {
    const modal = document.getElementById('schedule-modal');
    const title = document.getElementById('modal-train-title');
    const tbody = document.getElementById('modal-schedule-tbody');

    title.textContent = `Timetable: ${trainName}`;
    tbody.innerHTML = '<tr><td colspan="6" class="field-help">Retrieving stop sequence...</td></tr>';
    modal.classList.add('open');

    try {
        const res = await apiFetch(`${API_BASE}/trains/${trainId}/schedule`);
        const schedules = await res.json();

        if (schedules.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="field-help">No intermediate halts scheduled for this service.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        schedules.forEach(s => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${s.stop_sequence}</strong></td>
                <td>${s.station_name}</td>
                <td><span class="code-ref">${s.station_code}</span></td>
                <td>${s.arrival_time ? s.arrival_time : 'Origin Point'}</td>
                <td>${s.departure_time ? s.departure_time : 'Terminus'}</td>
                <td>Platform ${s.platform_no || 1}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="6" class="field-help">Error retrieving schedule stops.</td></tr>';
    }
}

function closeModal() {
    document.getElementById('schedule-modal').classList.remove('open');
}

// ----------------------------------------------------------------------------
// 6. BOOKING TRANSACTION
// ----------------------------------------------------------------------------
async function prepareBooking(trainId) {
    document.querySelector('[data-tab="book-tab"]').click();
    const trainSelect = document.getElementById('book-train');
    trainSelect.value = trainId;
    await loadCoachesForTrain(trainId);
}

async function loadCoachesForTrain(trainId) {
    const coachSelect = document.getElementById('book-coach');
    coachSelect.innerHTML = '<option value="">Select coach</option>';
    if (!trainId) return;

    try {
        const res = await apiFetch(`${API_BASE}/trains/${trainId}/coaches`);
        const coaches = await res.json();

        coaches.forEach(c => {
            const fare = c.base_fare || (c.coach_type === '1A' ? 3200 : c.coach_type === '2A' ? 2400 : c.coach_type === '3A' ? 1800 : 650);
            const opt = `<option value="${c.coach_id}" data-fare="${fare}">${c.coach_code} (${c.coach_type}) - INR ${fare}</option>`;
            coachSelect.insertAdjacentHTML('beforeend', opt);
        });

        if (coaches.length > 0) {
            coachSelect.selectedIndex = 1;
            const fare = coaches[0].base_fare || 2150;
            document.getElementById('book-fare').value = fare;
        }
    } catch (err) {
        showToast('Error loading coach configurations.', true);
    }
}

async function handleTicketBooking(e) {
    e.preventDefault();

    const passenger_id = document.getElementById('book-passenger').value;
    const train_id = document.getElementById('book-train').value;
    const coach_id = document.getElementById('book-coach').value;
    const seat_number = document.getElementById('book-seat').value;
    const journey_date = document.getElementById('book-date').value;
    const fare = document.getElementById('book-fare').value;

    if (!passenger_id || !train_id || !coach_id || !seat_number || !journey_date) {
        showToast('All reservation parameters are mandatory.', true);
        return;
    }

    try {
        const res = await apiFetch(`${API_BASE}/tickets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passenger_id, train_id, coach_id, seat_number, journey_date, fare })
        });

        const data = await res.json();

        if (!res.ok) {
            showToast(data.error || 'Booking transaction rejected.', true);
            return;
        }

        showToast(`Reservation confirmed. PNR Reference: ${data.pnr}`);
        fetchStats();

        setTimeout(() => {
            document.querySelector('[data-tab="tickets-tab"]').click();
        }, 500);
    } catch (err) {
        showToast('Network error during reservation.', true);
    }
}

// ----------------------------------------------------------------------------
// 7. PNR INQUIRY & CANCELLATION
// ----------------------------------------------------------------------------
async function loadTickets(pnrFilter = '') {
    const tbody = document.getElementById('tickets-tbody');
    tbody.innerHTML = '<tr><td colspan="9" class="field-help">Loading reservations...</td></tr>';

    try {
        let url = `${API_BASE}/tickets`;
        if (pnrFilter) {
            url += `?pnr=${encodeURIComponent(pnrFilter)}`;
        }
        const res = await apiFetch(url);
        const tickets = await res.json();

        if (tickets.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="field-help">No reservations match the query criteria.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        tickets.forEach(tk => {
            const isConfirmed = tk.status === 'CONFIRMED';
            const statusClass = isConfirmed ? 'confirmed' : tk.status === 'CANCELLED' ? 'cancelled' : 'waitlist';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="code-ref">${tk.pnr_number}</span></td>
                <td><strong>${tk.passenger_name || 'Passenger'}</strong></td>
                <td>${tk.primary_phone || 'N/A'}</td>
                <td>${tk.train_number} ${tk.train_name}</td>
                <td>Coach ${tk.coach_code || 'B1'} • Seat ${tk.seat_number} (${tk.coach_type || '3A'})</td>
                <td>${tk.journey_date ? tk.journey_date.split('T')[0] : 'N/A'}</td>
                <td>₹${tk.fare}</td>
                <td><span class="status-pill ${statusClass}">${tk.status}</span></td>
                <td class="text-right">
                    ${isConfirmed ? `<button class="btn-danger-link" onclick="cancelTicket(${tk.ticket_id})">Cancel</button>` : '—'}
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="9" class="field-help">Error retrieving tickets list.</td></tr>';
    }
}

async function cancelTicket(ticketId) {
    if (!confirm('Confirm cancellation for this reservation?')) return;

    try {
        const res = await apiFetch(`${API_BASE}/tickets/${ticketId}/cancel`, {
            method: 'PUT'
        });
        const data = await res.json();
        if (res.ok) {
            showToast('Reservation status updated to CANCELLED.');
            loadTickets();
            fetchStats();
        } else {
            showToast(data.error || 'Failed to cancel reservation.', true);
        }
    } catch (err) {
        showToast('Error processing cancellation.', true);
    }
}

// ----------------------------------------------------------------------------
// 8. PASSENGER REGISTRY
// ----------------------------------------------------------------------------
async function loadPassengers() {
    try {
        const res = await apiFetch(`${API_BASE}/passengers`);
        passengersList = await res.json();

        const tbody = document.getElementById('passengers-tbody');
        tbody.innerHTML = '';

        const bookSelect = document.getElementById('book-passenger');
        bookSelect.innerHTML = '<option value="">Select registered passenger</option>';

        passengersList.forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>#${p.passenger_id}</td>
                <td><strong>${p.name}</strong> (${p.gender})</td>
                <td>${p.dob ? p.dob.split('T')[0] : ''} (${p.age || 'N/A'} yrs)</td>
                <td>${p.primary_phone}</td>
                <td>${p.city}, ${p.state}</td>
            `;
            tbody.appendChild(tr);

            const opt = `<option value="${p.passenger_id}">${p.name} (${p.city}) - ${p.primary_phone}</option>`;
            bookSelect.insertAdjacentHTML('beforeend', opt);
        });
    } catch (err) {
        console.error('Passenger loading error:', err);
    }
}

async function handlePassengerRegister(e) {
    e.preventDefault();

    const name = document.getElementById('pass-name').value;
    const dob = document.getElementById('pass-dob').value;
    const gender = document.getElementById('pass-gender').value;
    const primary_phone = document.getElementById('pass-phone').value;
    const email = document.getElementById('pass-email').value;
    const street = document.getElementById('pass-street').value;
    const city = document.getElementById('pass-city').value;
    const state = document.getElementById('pass-state').value;
    const pincode = document.getElementById('pass-pin').value;

    try {
        const res = await apiFetch(`${API_BASE}/passengers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, dob, gender, primary_phone, email, street, city, state, pincode })
        });
        const data = await res.json();

        if (res.ok) {
            showToast('Passenger enrolled successfully.');
            document.getElementById('passenger-form').reset();
            loadPassengers();
            fetchStats();
        } else {
            showToast(data.error || 'Enrollment rejected.', true);
        }
    } catch (err) {
        showToast('Error registering passenger record.', true);
    }
}

// ----------------------------------------------------------------------------
// 9. TOAST NOTIFICATION
// ----------------------------------------------------------------------------
function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast-notification show' + (isError ? ' error' : ' success');
    setTimeout(() => {
        toast.className = 'toast-notification';
    }, 3500);
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});
