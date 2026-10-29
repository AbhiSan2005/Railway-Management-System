// ============================================================================
// RAILWAY MANAGEMENT SYSTEM - CLIENT SCRIPT
// ============================================================================

const API_BASE = '/api';

// Global cache for dropdowns and fast lookups
let stationsList = [];
let trainsList = [];
let passengersList = [];

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
// 1. TABS MANAGEMENT
// ----------------------------------------------------------------------------
function initTabs() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

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

            // Refresh tab-specific data
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
    // Train Search
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

    // Booking: Train change loads coaches
    document.getElementById('book-train').addEventListener('change', (e) => {
        loadCoachesForTrain(e.target.value);
    });

    // Booking: Coach change updates fare
    document.getElementById('book-coach').addEventListener('change', (e) => {
        const selectedOpt = e.target.selectedOptions[0];
        if (selectedOpt && selectedOpt.dataset.fare) {
            document.getElementById('book-fare').value = selectedOpt.dataset.fare;
        }
    });

    // Booking Form Submit
    document.getElementById('booking-form').addEventListener('submit', handleTicketBooking);

    // Passenger Form Submit
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

    // Modal Close
    document.getElementById('modal-close-btn').addEventListener('click', closeModal);
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('schedule-modal');
        if (e.target === modal) closeModal();
    });
}

// ----------------------------------------------------------------------------
// 3. SYSTEM STATUS & STATS
// ----------------------------------------------------------------------------
async function fetchSystemStatus() {
    try {
        const res = await fetch(`${API_BASE}/status`);
        const data = await res.json();
        const dot = document.getElementById('status-dot');
        const text = document.getElementById('status-text');

        dot.classList.add('online');
        text.textContent = data.databaseEngine;
    } catch {
        document.getElementById('status-text').textContent = 'Backend Offline';
    }
}

async function fetchStats() {
    try {
        const res = await fetch(`${API_BASE}/stats`);
        const data = await res.json();
        document.getElementById('stat-trains').textContent = data.trains || 0;
        document.getElementById('stat-stations').textContent = data.stations || 0;
        document.getElementById('stat-passengers').textContent = data.passengers || 0;
        document.getElementById('stat-bookings').textContent = data.activeBookings || 0;
    } catch (err) {
        console.error('Failed to load stats', err);
    }
}

// ----------------------------------------------------------------------------
// 4. STATIONS & TRAINS
// ----------------------------------------------------------------------------
async function loadStations() {
    try {
        const res = await fetch(`${API_BASE}/stations`);
        stationsList = await res.json();

        const fromSelect = document.getElementById('search-from');
        const toSelect = document.getElementById('search-to');

        fromSelect.innerHTML = '<option value="">-- All Source Stations --</option>';
        toSelect.innerHTML = '<option value="">-- All Destination Stations --</option>';

        stationsList.forEach(st => {
            const opt1 = `<option value="${st.station_id}">${st.station_name} (${st.station_code}) - ${st.city}</option>`;
            const opt2 = `<option value="${st.station_id}">${st.station_name} (${st.station_code}) - ${st.city}</option>`;
            fromSelect.insertAdjacentHTML('beforeend', opt1);
            toSelect.insertAdjacentHTML('beforeend', opt2);
        });
    } catch (err) {
        showToast('Error loading stations', true);
    }
}

async function loadTrains(from = '', to = '') {
    const container = document.getElementById('trains-container');
    const badge = document.getElementById('trains-count-badge');
    container.innerHTML = '<p class="text-muted">Loading trains...</p>';

    try {
        let url = `${API_BASE}/trains`;
        if (from && to) {
            url += `?from=${from}&to=${to}`;
        }
        const res = await fetch(url);
        trainsList = await res.json();

        badge.textContent = `${trainsList.length} train${trainsList.length === 1 ? '' : 's'} found`;

        if (trainsList.length === 0) {
            container.innerHTML = '<div class="card"><p class="text-muted">No direct trains found matching your search.</p></div>';
            return;
        }

        container.innerHTML = '';
        const trainSelect = document.getElementById('book-train');
        trainSelect.innerHTML = '<option value="">-- Select Train --</option>';

        trainsList.forEach(train => {
            // Populate card
            const card = document.createElement('div');
            card.className = 'train-card';
            card.innerHTML = `
                <div>
                    <div class="train-card-top">
                        <span class="train-number">${train.train_number}</span>
                        <span class="train-type-badge">${train.train_type}</span>
                    </div>
                    <h4 class="train-title">${train.train_name}</h4>
                    <div class="train-route-visual">
                        <div class="route-stop">
                            <div class="route-code">${train.source_code || 'SRC'}</div>
                            <div class="route-city">${train.source_station || 'Source'}</div>
                        </div>
                        <div class="route-arrow">
                            <span>➔</span>
                            <span>${train.duration_hours || '16'}h • ${train.distance_km || '1000'} km</span>
                        </div>
                        <div class="route-stop">
                            <div class="route-code">${train.dest_code || 'DST'}</div>
                            <div class="route-city">${train.destination_station || 'Destination'}</div>
                        </div>
                    </div>
                    <div class="text-muted" style="font-size: 0.8rem;">Coaches: ${train.total_coaches || 12} coaches</div>
                </div>
                <div class="train-card-actions">
                    <button class="btn btn-secondary" onclick="viewSchedule(${train.train_id}, '${train.train_name}')">⏱️ Timetable</button>
                    <button class="btn btn-primary" onclick="prepareBooking(${train.train_id})">Book Seat</button>
                </div>
            `;
            container.appendChild(card);

            // Populate booking dropdown
            const opt = `<option value="${train.train_id}">${train.train_number} - ${train.train_name}</option>`;
            trainSelect.insertAdjacentHTML('beforeend', opt);
        });
    } catch (err) {
        container.innerHTML = '<p class="text-muted">Failed to load trains.</p>';
    }
}

// ----------------------------------------------------------------------------
// 5. SCHEDULE MODAL
// ----------------------------------------------------------------------------
async function viewSchedule(trainId, trainName) {
    const modal = document.getElementById('schedule-modal');
    const title = document.getElementById('modal-train-title');
    const tbody = document.getElementById('modal-schedule-tbody');

    title.textContent = `Schedule: ${trainName}`;
    tbody.innerHTML = '<tr><td colspan="6" class="text-muted">Loading schedule...</td></tr>';
    modal.classList.add('open');

    try {
        const res = await fetch(`${API_BASE}/trains/${trainId}/schedule`);
        const schedules = await res.json();

        if (schedules.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-muted">No stops scheduled for this train.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        schedules.forEach(s => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>#${s.stop_sequence}</strong></td>
                <td>${s.station_name}</td>
                <td><code>${s.station_code}</code></td>
                <td>${s.arrival_time ? s.arrival_time : '<em>Source</em>'}</td>
                <td>${s.departure_time ? s.departure_time : '<em>Destination</em>'}</td>
                <td>Platform ${s.platform_no || 1}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-muted">Error loading schedule.</td></tr>';
    }
}

function closeModal() {
    document.getElementById('schedule-modal').classList.remove('open');
}

// ----------------------------------------------------------------------------
// 6. BOOKING FLOW
// ----------------------------------------------------------------------------
async function prepareBooking(trainId) {
    // Switch to Booking Tab
    document.querySelector('[data-tab="book-tab"]').click();

    const trainSelect = document.getElementById('book-train');
    trainSelect.value = trainId;
    await loadCoachesForTrain(trainId);
}

async function loadCoachesForTrain(trainId) {
    const coachSelect = document.getElementById('book-coach');
    coachSelect.innerHTML = '<option value="">-- Select Coach --</option>';
    if (!trainId) return;

    try {
        const res = await fetch(`${API_BASE}/trains/${trainId}/coaches`);
        const coaches = await res.json();

        coaches.forEach(c => {
            const fare = c.base_fare || (c.coach_type === '1A' ? 3200 : c.coach_type === '2A' ? 2400 : c.coach_type === '3A' ? 1800 : 650);
            const opt = `<option value="${c.coach_id}" data-fare="${fare}">${c.coach_code} (${c.coach_type}) - ₹${fare}</option>`;
            coachSelect.insertAdjacentHTML('beforeend', opt);
        });

        if (coaches.length > 0) {
            coachSelect.selectedIndex = 1;
            const fare = coaches[0].base_fare || 2150;
            document.getElementById('book-fare').value = fare;
        }
    } catch (err) {
        showToast('Error loading coaches', true);
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
        showToast('Please fill all required booking fields', true);
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/tickets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passenger_id, train_id, coach_id, seat_number, journey_date, fare })
        });

        const data = await res.json();

        if (!res.ok) {
            showToast(data.error || 'Booking failed', true);
            return;
        }

        showToast(`🎉 Ticket booked! PNR: ${data.pnr}`);
        fetchStats();
        // Switch to tickets tab
        setTimeout(() => {
            document.querySelector('[data-tab="tickets-tab"]').click();
        }, 600);
    } catch (err) {
        showToast('Network error during booking', true);
    }
}

// ----------------------------------------------------------------------------
// 7. TICKETS & PNR LOOKUP
// ----------------------------------------------------------------------------
async function loadTickets(pnrFilter = '') {
    const tbody = document.getElementById('tickets-tbody');
    tbody.innerHTML = '<tr><td colspan="9" class="text-muted">Loading reservations...</td></tr>';

    try {
        let url = `${API_BASE}/tickets`;
        if (pnrFilter) {
            url += `?pnr=${encodeURIComponent(pnrFilter)}`;
        }
        const res = await fetch(url);
        const tickets = await res.json();

        if (tickets.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-muted">No tickets found.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        tickets.forEach(tk => {
            const isConfirmed = tk.status === 'CONFIRMED';
            const statusClass = isConfirmed ? 'status-confirmed' : tk.status === 'CANCELLED' ? 'status-cancelled' : 'status-waitlist';
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="mono-pnr">${tk.pnr_number}</td>
                <td><strong>${tk.passenger_name || 'Passenger'}</strong></td>
                <td>${tk.primary_phone || 'N/A'}</td>
                <td>${tk.train_number} - ${tk.train_name}</td>
                <td>Coach ${tk.coach_code || 'B1'} / Seat #${tk.seat_number} (${tk.coach_type || '3A'})</td>
                <td>${tk.journey_date ? tk.journey_date.split('T')[0] : 'N/A'}</td>
                <td>₹${tk.fare}</td>
                <td><span class="status-badge ${statusClass}">${tk.status}</span></td>
                <td>
                    ${isConfirmed ? `<button class="btn btn-danger-outline" onclick="cancelTicket(${tk.ticket_id})">Cancel</button>` : '—'}
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-muted">Error loading tickets.</td></tr>';
    }
}

async function cancelTicket(ticketId) {
    if (!confirm('Are you sure you want to cancel this ticket?')) return;

    try {
        const res = await fetch(`${API_BASE}/tickets/${ticketId}/cancel`, {
            method: 'PUT'
        });
        const data = await res.json();
        if (res.ok) {
            showToast('Ticket cancelled successfully');
            loadTickets();
            fetchStats();
        } else {
            showToast(data.error || 'Failed to cancel', true);
        }
    } catch (err) {
        showToast('Error cancelling ticket', true);
    }
}

// ----------------------------------------------------------------------------
// 8. PASSENGERS
// ----------------------------------------------------------------------------
async function loadPassengers() {
    try {
        const res = await fetch(`${API_BASE}/passengers`);
        passengersList = await res.json();

        // Populate table
        const tbody = document.getElementById('passengers-tbody');
        tbody.innerHTML = '';

        // Populate booking select
        const bookSelect = document.getElementById('book-passenger');
        bookSelect.innerHTML = '<option value="">-- Select Registered Passenger --</option>';

        passengersList.forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>#${p.passenger_id}</td>
                <td><strong>${p.name}</strong> <span class="badge" style="font-size:0.7rem;">${p.gender}</span></td>
                <td>${p.dob ? p.dob.split('T')[0] : ''} (${p.age || 'N/A'} yrs)</td>
                <td>${p.primary_phone}</td>
                <td>${p.city}, ${p.state}</td>
            `;
            tbody.appendChild(tr);

            const opt = `<option value="${p.passenger_id}">${p.name} (${p.city}) - ${p.primary_phone}</option>`;
            bookSelect.insertAdjacentHTML('beforeend', opt);
        });
    } catch (err) {
        console.error('Failed to load passengers', err);
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
        const res = await fetch(`${API_BASE}/passengers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, dob, gender, primary_phone, email, street, city, state, pincode })
        });
        const data = await res.json();

        if (res.ok) {
            showToast('Passenger registered successfully!');
            document.getElementById('passenger-form').reset();
            loadPassengers();
            fetchStats();
        } else {
            showToast(data.error || 'Failed to register', true);
        }
    } catch (err) {
        showToast('Error registering passenger', true);
    }
}

// ----------------------------------------------------------------------------
// 9. TOAST NOTIFICATIONS
// ----------------------------------------------------------------------------
function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show' + (isError ? ' error' : ' success');
    setTimeout(() => {
        toast.className = 'toast';
    }, 3500);
}

// Global modal close on Escape key
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});
