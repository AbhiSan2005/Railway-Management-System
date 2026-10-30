// ============================================================================
// ADMINISTRATIVE PANEL & OPERATIONS CONTROLLER (admin.html)
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    // Restrict access to employees/admin
    if (window.RailwayAuth) {
        window.RailwayAuth.requireEmployee();
    }

    await loadAdminViews();
    await loadRoutesAndStationsForAdmin();

    // Attach form listeners
    const addTrainForm = document.getElementById('admin-add-train-form');
    if (addTrainForm) addTrainForm.addEventListener('submit', handleAddTrain);

    const addRouteForm = document.getElementById('admin-add-route-form');
    if (addRouteForm) addRouteForm.addEventListener('submit', handleAddRoute);

    const delayForm = document.getElementById('admin-delay-form');
    if (delayForm) delayForm.addEventListener('submit', handleUpdateDelay);
});

async function loadAdminViews() {
    loadSchedulesView();
    loadCapacityView();
    loadRostersView();
}

// 1. Schedules View
async function loadSchedulesView() {
    const tableBody = document.getElementById('admin-schedules-body');
    if (!tableBody) return;

    try {
        const res = await fetch('/api/admin/views/schedules');
        const rows = await res.json();

        let html = '';
        rows.forEach(r => {
            html += `
                <tr>
                    <td style="font-family: var(--font-mono); font-weight: 700;">#${r.train_number}</td>
                    <td><strong>${r.train_name}</strong> <span class="badge badge-info">${r.train_type}</span></td>
                    <td style="font-weight: 700; color: var(--primary);">${r.stop_sequence}</td>
                    <td>${r.station_name} (${r.station_code})</td>
                    <td style="font-family: var(--font-mono);">${r.arrival_time || '<span style="color: var(--success)">ORIGIN</span>'}</td>
                    <td style="font-family: var(--font-mono);">${r.departure_time || '<span style="color: var(--danger)">DEST</span>'}</td>
                    <td><span class="badge badge-warning">Platform ${r.platform_no || 1}</span></td>
                </tr>
            `;
        });
        tableBody.innerHTML = html || '<tr><td colspan="7">No schedule records.</td></tr>';
    } catch (e) {
        console.error(e);
    }
}

// 2. Capacity & Utilization View
async function loadCapacityView() {
    const tableBody = document.getElementById('admin-capacity-body');
    if (!tableBody) return;

    try {
        const res = await fetch('/api/admin/views/capacity');
        const rows = await res.json();

        let html = '';
        rows.forEach(c => {
            const pct = c.utilization_percent || 0;
            const barColor = pct > 80 ? 'var(--danger)' : pct > 40 ? 'var(--warning)' : 'var(--success)';

            html += `
                <tr>
                    <td><strong>${c.train_name}</strong> (#${c.train_number})</td>
                    <td style="font-weight: 700;">Coach ${c.coach_number} <span class="badge badge-info">${c.coach_type}</span></td>
                    <td>${c.capacity}</td>
                    <td style="color: var(--danger); font-weight: 700;">${c.booked_seats}</td>
                    <td style="color: var(--success); font-weight: 700;">${c.available_seats}</td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="flex: 1; height: 8px; background: var(--bg-card); border-radius: 4px; overflow: hidden; border: 1px solid var(--border-color);">
                                <div style="width: ${pct}%; height: 100%; background: ${barColor};"></div>
                            </div>
                            <span style="font-size: 0.75rem; font-family: var(--font-mono); font-weight: 700;">${pct}%</span>
                        </div>
                    </td>
                </tr>
            `;
        });
        tableBody.innerHTML = html || '<tr><td colspan="6">No coach capacity records.</td></tr>';
    } catch (e) {
        console.error(e);
    }
}

// 3. Station Employee Rosters View
async function loadRostersView() {
    const tableBody = document.getElementById('admin-rosters-body');
    if (!tableBody) return;

    try {
        const res = await fetch('/api/admin/views/rosters');
        const rows = await res.json();

        let html = '';
        rows.forEach(emp => {
            html += `
                <tr>
                    <td style="font-family: var(--font-mono); font-weight: 700;">#EMP-${emp.employee_id}</td>
                    <td><strong>${emp.employee_name}</strong></td>
                    <td><span class="badge badge-info">${emp.designation}</span></td>
                    <td>${emp.station_name ? `${emp.station_name} (${emp.station_code || 'STN'})` : '<span style="color: var(--text-muted)">Onboard Crew</span>'}</td>
                    <td>${emp.assigned_train_name ? `${emp.assigned_train_name} - ${emp.role_on_train || 'Staff'}` : '<span style="color: var(--text-muted)">Station Based</span>'}</td>
                    <td style="font-family: var(--font-mono); color: var(--success); font-weight: 700;">₹${parseFloat(emp.salary).toFixed(2)}</td>
                </tr>
            `;
        });
        tableBody.innerHTML = html || '<tr><td colspan="6">No employee records found.</td></tr>';
    } catch (e) {
        console.error(e);
    }
}

async function loadRoutesAndStationsForAdmin() {
    try {
        const [routesRes, stationsRes] = await Promise.all([
            fetch('/api/routes'),
            fetch('/api/stations')
        ]);
        const routes = await routesRes.json();
        const stations = await stationsRes.json();

        const routeSelect = document.getElementById('train-route-select');
        if (routeSelect) {
            routeSelect.innerHTML = '<option value="">-- Choose Assigned Route --</option>';
            routes.forEach(r => {
                routeSelect.insertAdjacentHTML('beforeend', `
                    <option value="${r.route_id}">
                        Route #${r.route_id}: ${r.source_station} ➔ ${r.destination_station} (${r.distance_km} km)
                    </option>
                `);
            });
        }

        const srcSelect = document.getElementById('route-source-select');
        const dstSelect = document.getElementById('route-dest-select');

        if (srcSelect && dstSelect) {
            srcSelect.innerHTML = '<option value="">Select Origin Station</option>';
            dstSelect.innerHTML = '<option value="">Select Destination Station</option>';
            stations.forEach(s => {
                const opt = `<option value="${s.station_id}">${s.station_name} (${s.station_code})</option>`;
                srcSelect.insertAdjacentHTML('beforeend', opt);
                dstSelect.insertAdjacentHTML('beforeend', opt);
            });
        }
    } catch (e) {
        console.error(e);
    }
}

async function handleAddTrain(e) {
    e.preventDefault();
    const train_number = document.getElementById('train-number-input').value;
    const train_name = document.getElementById('train-name-input').value;
    const train_type = document.getElementById('train-type-select').value;
    const total_coaches = document.getElementById('train-coaches-input').value;
    const route_id = document.getElementById('train-route-select').value;

    try {
        const res = await fetch('/api/admin/trains', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ train_number, train_name, train_type, total_coaches, route_id })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to add train.');

        alert(`Train #${train_number} (${train_name}) added successfully with initial coaches and seat grid!`);
        document.getElementById('admin-add-train-form').reset();
        loadAdminViews();
    } catch (err) {
        alert(err.message);
    }
}

async function handleAddRoute(e) {
    e.preventDefault();
    const source_station_id = document.getElementById('route-source-select').value;
    const destination_station_id = document.getElementById('route-dest-select').value;
    const distance_km = document.getElementById('route-distance-input').value;
    const duration_hours = document.getElementById('route-duration-input').value;

    try {
        const res = await fetch('/api/admin/routes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source_station_id, destination_station_id, distance_km, duration_hours })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to add route.');

        alert('New railway route successfully registered!');
        document.getElementById('admin-add-route-form').reset();
        loadRoutesAndStationsForAdmin();
    } catch (err) {
        alert(err.message);
    }
}

async function handleUpdateDelay(e) {
    e.preventDefault();
    const schedule_id = document.getElementById('delay-sched-id').value;
    const arrival_time = document.getElementById('delay-arr-time').value;
    const departure_time = document.getElementById('delay-dep-time').value;
    const platform_no = document.getElementById('delay-platform').value;

    try {
        const res = await fetch('/api/admin/schedules/delay', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                schedule_id,
                arrival_time: arrival_time || undefined,
                departure_time: departure_time || undefined,
                platform_no: platform_no || undefined
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update schedule.');

        alert('Schedule delay/platform updated successfully.');
        document.getElementById('admin-delay-form').reset();
        loadSchedulesView();
    } catch (err) {
        alert(err.message);
    }
}

