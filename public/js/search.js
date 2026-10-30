// ============================================================================
// SEARCH & TIMETABLE CONTROLLER (index.html)
// ============================================================================

let stations = [];

async function loadStations() {
    try {
        const res = await fetch('/api/stations');
        stations = await res.json();
        
        const fromSelect = document.getElementById('search-from');
        const toSelect = document.getElementById('search-to');

        if (!fromSelect || !toSelect) return;

        fromSelect.innerHTML = '<option value="">Select Origin Station</option>';
        toSelect.innerHTML = '<option value="">Select Destination Station</option>';

        stations.forEach(s => {
            const opt1 = `<option value="${s.station_id}">${s.station_name} (${s.station_code}) - ${s.city}</option>`;
            const opt2 = `<option value="${s.station_id}">${s.station_name} (${s.station_code}) - ${s.city}</option>`;
            fromSelect.insertAdjacentHTML('beforeend', opt1);
            toSelect.insertAdjacentHTML('beforeend', opt2);
        });

        // Set default selection (New Delhi to Mumbai Central)
        fromSelect.value = "1";
        toSelect.value = "2";
    } catch (err) {
        console.error('Failed to load stations:', err);
    }
}

async function loadStats() {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();

        const trainsEl = document.getElementById('stat-trains');
        const stationsEl = document.getElementById('stat-stations');
        const passEl = document.getElementById('stat-passengers');
        const bookEl = document.getElementById('stat-bookings');

        if (trainsEl) trainsEl.textContent = data.trains || 0;
        if (stationsEl) stationsEl.textContent = data.stations || 0;
        if (passEl) passEl.textContent = data.passengers || 0;
        if (bookEl) bookEl.textContent = data.activeBookings || 0;
    } catch (err) {
        console.error('Failed to load stats:', err);
    }
}

async function searchTrains(e) {
    if (e) e.preventDefault();

    const from = document.getElementById('search-from').value;
    const to = document.getElementById('search-to').value;
    const date = document.getElementById('search-date').value;

    if (!from || !to) {
        alert('Please select both Origin and Destination stations.');
        return;
    }

    if (from === to) {
        alert('Origin and Destination stations must be distinct.');
        return;
    }

    const resultsContainer = document.getElementById('train-results-container');
    if (!resultsContainer) return;

    resultsContainer.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-muted);">
            Searching database for direct and intermediate train schedules...
        </div>
    `;

    try {
        const res = await fetch(`/api/trains/search?from=${from}&to=${to}&date=${date || ''}`);
        const trains = await res.json();

        if (!trains || trains.length === 0) {
            resultsContainer.innerHTML = `
                <div class="panel-card" style="text-align: center; padding: 40px;">
                    <p style="color: var(--text-muted); margin-bottom: 12px;">No direct or intermediate train services found connecting these stations.</p>
                    <button class="btn btn-secondary btn-sm" onclick="showAllTrains()">View All Network Trains</button>
                </div>
            `;
            return;
        }

        renderTrainCards(trains);
    } catch (err) {
        console.error('Search error:', err);
        resultsContainer.innerHTML = `<div class="panel-card" style="color: var(--danger);">Failed to search trains: ${err.message}</div>`;
    }
}

async function showAllTrains() {
    const resultsContainer = document.getElementById('train-results-container');
    if (!resultsContainer) return;

    try {
        const res = await fetch('/api/trains');
        const trains = await res.json();
        renderTrainCards(trains);
    } catch (err) {
        console.error('All trains fetch error:', err);
    }
}

function renderTrainCards(trains) {
    const resultsContainer = document.getElementById('train-results-container');
    if (!resultsContainer) return;

    let html = '';
    trains.forEach(t => {
        const origin = t.origin_station || t.source_station || 'Origin';
        const dest = t.destination_station || 'Destination';
        const dep = t.departure_time || '16:00:00';
        const arr = t.arrival_time || '08:30:00';
        const dist = t.distance_km || 0;
        const dur = t.duration_hours || 0;

        html += `
            <div class="panel-card" style="margin-bottom: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; margin-bottom: 16px;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
                            <span class="badge badge-info" style="font-family: var(--font-mono); font-size: 0.85rem;">#${t.train_number}</span>
                            <h3 style="font-size: 1.15rem; font-weight: 700; color: #fff;">${t.train_name}</h3>
                            <span class="badge badge-warning">${t.train_type}</span>
                        </div>
                        <p style="font-size: 0.82rem; color: var(--text-muted);">
                            Total Coaches: ${t.total_coaches} | Route Distance: ${dist} km | Approx: ${dur} hrs
                        </p>
                    </div>

                    <div style="display: flex; gap: 10px;">
                        <button class="btn btn-secondary btn-sm" onclick="openTimetableModal(${t.train_id}, '${t.train_number} - ${t.train_name}')">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            View Halts
                        </button>
                        <a href="booking.html?train_id=${t.train_id}" class="btn btn-primary btn-sm">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/></svg>
                            Select Seats
                        </a>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; background: var(--bg-card); padding: 14px 18px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
                    <div>
                        <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600;">Departs</span>
                        <div style="font-size: 1rem; font-weight: 700; color: #fff;">${dep}</div>
                        <div style="font-size: 0.8rem; color: var(--text-secondary);">${origin}</div>
                    </div>
                    <div>
                        <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600;">Journey Time</span>
                        <div style="font-size: 1rem; font-weight: 700; color: var(--primary);">${dur} Hours</div>
                        <div style="font-size: 0.8rem; color: var(--text-muted);">${dist} km track</div>
                    </div>
                    <div>
                        <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600;">Arrives</span>
                        <div style="font-size: 1rem; font-weight: 700; color: #fff;">${arr}</div>
                        <div style="font-size: 0.8rem; color: var(--text-secondary);">${dest}</div>
                    </div>
                </div>
            </div>
        `;
    });

    resultsContainer.innerHTML = html;
}

// Intermediate Halts Timetable Modal
async function openTimetableModal(trainId, title) {
    const modal = document.getElementById('timetable-modal');
    const titleEl = document.getElementById('modal-train-title');
    const bodyEl = document.getElementById('modal-stops-body');

    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.innerHTML = '<tr><td colspan="6" style="text-align: center;">Loading timetable...</td></tr>';
    if (modal) modal.classList.add('active');

    try {
        const res = await fetch(`/api/trains/${trainId}/schedule`);
        const stops = await res.json();

        if (!stops || stops.length === 0) {
            bodyEl.innerHTML = '<tr><td colspan="6" style="text-align: center;">No halts recorded for this train.</td></tr>';
            return;
        }

        let rows = '';
        stops.forEach(s => {
            rows += `
                <tr>
                    <td style="font-weight: 700; color: var(--primary);">${s.stop_sequence}</td>
                    <td><strong>${s.station_name}</strong> <span style="font-size: 0.75rem; color: var(--text-muted);">(${s.station_code})</span></td>
                    <td>${s.city || '-'}</td>
                    <td style="font-family: var(--font-mono);">${s.arrival_time || '<span style="color: var(--success);">ORIGIN</span>'}</td>
                    <td style="font-family: var(--font-mono);">${s.departure_time || '<span style="color: var(--danger);">TERMINUS</span>'}</td>
                    <td><span class="badge badge-info">Platform ${s.platform_no || 1}</span></td>
                </tr>
            `;
        });
        bodyEl.innerHTML = rows;
    } catch (err) {
        bodyEl.innerHTML = `<tr><td colspan="6" style="color: var(--danger);">Failed to load schedule: ${err.message}</td></tr>`;
    }
}

function closeTimetableModal() {
    const modal = document.getElementById('timetable-modal');
    if (modal) modal.classList.remove('active');
}

document.addEventListener('DOMContentLoaded', () => {
    loadStations();
    loadStats();
    showAllTrains();

    const searchForm = document.getElementById('train-search-form');
    if (searchForm) {
        searchForm.addEventListener('submit', searchTrains);
    }

    // Set tomorrow date
    const dateInput = document.getElementById('search-date');
    if (dateInput) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        dateInput.value = tomorrow.toISOString().split('T')[0];
        dateInput.min = new Date().toISOString().split('T')[0];
    }
});

