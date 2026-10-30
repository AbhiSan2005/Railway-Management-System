// ============================================================================
// STAFF PASSENGER LOOKUP & VERIFICATION CONTROLLER (passenger_inspection.html)
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    if (window.RailwayAuth) {
        window.RailwayAuth.requireEmployee();
    }

    const searchForm = document.getElementById('inspection-search-form');
    if (searchForm) {
        searchForm.addEventListener('submit', handleInspectionSearch);
    }
});

async function handleInspectionSearch(e) {
    e.preventDefault();
    const query = document.getElementById('inspection-query-input').value.trim();
    const resultsContainer = document.getElementById('inspection-results-container');

    if (!query) {
        alert('Please enter a PNR, Passenger Name, or Email.');
        return;
    }

    resultsContainer.innerHTML = '<div style="padding: 30px; text-align: center; color: var(--text-muted);">Querying passenger and ticket registry...</div>';

    // If query starts with PNR, try PNR lookup first
    if (query.toUpperCase().startsWith('PNR') || query.length >= 6) {
        try {
            const pnrRes = await fetch(`/api/bookings/pnr/${query}`);
            if (pnrRes.ok) {
                const ticketData = await pnrRes.json();
                renderPnrInspectionCard(ticketData);
                return;
            }
        } catch (e) {
            // Fall through to passenger search
        }
    }

    // Try passenger search
    try {
        const res = await fetch(`/api/passengers?search=${encodeURIComponent(query)}`);
        const passengers = await res.json();

        if (!passengers || passengers.length === 0) {
            resultsContainer.innerHTML = `
                <div class="panel-card" style="text-align: center; padding: 40px;">
                    <p style="color: var(--text-muted);">No matching passenger or PNR found for "${query}".</p>
                </div>
            `;
            return;
        }

        renderPassengerList(passengers);
    } catch (err) {
        resultsContainer.innerHTML = `<div style="color: var(--danger); padding: 20px;">Lookup error: ${err.message}</div>`;
    }
}

function renderPnrInspectionCard(tk) {
    const container = document.getElementById('inspection-results-container');
    if (!container) return;

    let kinHtml = '<p style="color: var(--text-muted); font-size: 0.85rem;">No emergency contact on file.</p>';
    if (tk.next_of_kin && tk.next_of_kin.length > 0) {
        kinHtml = tk.next_of_kin.map(k => `
            <div style="background: var(--bg-card); padding: 10px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); margin-top: 6px;">
                <strong>${k.kin_name}</strong> (${k.relation}) ➔ 📞 <a href="tel:${k.phone_number}" style="color: var(--primary); font-weight: 700;">${k.phone_number}</a>
            </div>
        `).join('');
    }

    container.innerHTML = `
        <div class="panel-card">
            <div class="panel-header">
                <div class="panel-title">
                    <span class="badge badge-info" style="font-family: var(--font-mono); font-size: 1rem;">${tk.pnr_no}</span>
                    <span>Passenger: <strong>${tk.passenger_name}</strong></span>
                </div>
                <span class="badge ${tk.status === 'CONFIRMED' ? 'badge-success' : 'badge-danger'}">
                    ${tk.status}
                </span>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 18px; margin-bottom: 20px;">
                <div>
                    <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Identity & Contact</span>
                    <div style="font-size: 0.95rem; font-weight: 700; color: #fff;">${tk.passenger_name} (${tk.gender || 'M'}, Age: ${tk.age || 'N/A'})</div>
                    <div style="font-size: 0.82rem; color: var(--text-secondary);">Phone: ${tk.primary_phone || 'N/A'}</div>
                    <div style="font-size: 0.82rem; color: var(--text-muted);">Email: ${tk.email || 'N/A'}</div>
                </div>
                <div>
                    <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Composite Residential Address</span>
                    <div style="font-size: 0.88rem; color: #fff;">${tk.street || 'Address on file'}</div>
                    <div style="font-size: 0.82rem; color: var(--text-secondary);">${tk.city}, ${tk.state} - ${tk.pincode}</div>
                </div>
                <div>
                    <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Seat Assignment</span>
                    <div style="font-size: 1.1rem; font-weight: 800; color: var(--primary);">Coach ${tk.coach_number} / Seat #${tk.seat_number}</div>
                    <div style="font-size: 0.82rem; color: var(--text-secondary);">${tk.berth_type || 'LOWER'} (${tk.coach_type})</div>
                </div>
                <div>
                    <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Journey Service</span>
                    <div style="font-size: 0.95rem; font-weight: 700; color: #fff;">#${tk.train_number} - ${tk.train_name}</div>
                    <div style="font-size: 0.82rem; color: var(--text-secondary);">${tk.source_station} ➔ ${tk.destination_station}</div>
                    <div style="font-size: 0.82rem; color: var(--text-muted);">Date: ${tk.journey_date}</div>
                </div>
            </div>

            <div style="border-top: 1px solid var(--border-color); padding-top: 16px;">
                <h4 style="font-size: 0.9rem; font-weight: 700; color: #fff; margin-bottom: 8px;">Emergency Contacts (Next of Kin):</h4>
                ${kinHtml}
            </div>
        </div>
    `;
}

function renderPassengerList(passengers) {
    const container = document.getElementById('inspection-results-container');
    if (!container) return;

    let html = '';
    passengers.forEach(p => {
        html += `
            <div class="panel-card" style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                <div>
                    <div style="font-size: 1.05rem; font-weight: 700; color: #fff;">
                        ${p.name} <span class="badge badge-info">ID: #${p.passenger_id}</span>
                    </div>
                    <div style="font-size: 0.82rem; color: var(--text-secondary); margin-top: 4px;">
                        📞 ${p.primary_phone} | ✉️ ${p.email} | 📍 ${p.city}, ${p.state}
                    </div>
                </div>
                <button class="btn btn-primary btn-sm" onclick="inspectPassengerDetails(${p.passenger_id})">
                    View Full File & Emergency Contacts
                </button>
            </div>
        `;
    });

    container.innerHTML = html;
}

async function inspectPassengerDetails(passengerId) {
    const container = document.getElementById('inspection-results-container');
    try {
        const [profileRes, ticketsRes] = await Promise.all([
            fetch(`/api/passengers/profile?passenger_id=${passengerId}`),
            fetch(`/api/bookings/my-tickets?passenger_id=${passengerId}`)
        ]);

        const profileData = await profileRes.json();
        const tickets = await ticketsRes.json();

        const p = profileData.profile;
        const kin = profileData.next_of_kin || [];

        let kinHtml = '<p style="color: var(--text-muted);">No emergency contacts on file.</p>';
        if (kin.length > 0) {
            kinHtml = kin.map(k => `
                <div style="background: var(--bg-card); padding: 10px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); margin-top: 6px;">
                    <strong>${k.kin_name}</strong> (${k.relation}) ➔ 📞 <a href="tel:${k.phone_number}" style="color: var(--primary); font-weight: 700;">${k.phone_number}</a>
                </div>
            `).join('');
        }

        let ticketsHtml = '<p style="color: var(--text-muted);">No tickets on record.</p>';
        if (tickets.length > 0) {
            ticketsHtml = tickets.map(t => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: var(--bg-card); border-radius: var(--radius-sm); margin-top: 6px; border: 1px solid var(--border-color);">
                    <div>
                        <span style="font-family: var(--font-mono); font-weight: 700; color: var(--primary);">${t.pnr_no}</span>
                        | ${t.train_name} (#${t.train_number}) | Coach ${t.coach_number} Seat #${t.seat_number}
                    </div>
                    <div>
                        <span class="badge ${t.status === 'CONFIRMED' ? 'badge-success' : 'badge-danger'}">${t.status}</span>
                        <span style="font-size: 0.8rem; color: var(--text-muted); margin-left: 8px;">${t.journey_date}</span>
                    </div>
                </div>
            `).join('');
        }

        container.innerHTML = `
            <div class="panel-card">
                <div class="panel-header">
                    <div class="panel-title">
                        Passenger File: <strong>${p.name}</strong> (ID: #${p.passenger_id})
                    </div>
                    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('inspection-search-form').dispatchEvent(new Event('submit'))">
                        Back to Search
                    </button>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 18px; margin-bottom: 20px;">
                    <div>
                        <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Personal Info</span>
                        <div style="font-size: 0.95rem; font-weight: 700; color: #fff;">${p.name} (${p.gender}, Age: ${p.age || 'N/A'})</div>
                        <div style="font-size: 0.82rem; color: var(--text-secondary);">DOB: ${p.dob ? p.dob.substring(0, 10) : 'N/A'}</div>
                        <div style="font-size: 0.82rem; color: var(--text-secondary);">Primary Phone: ${p.primary_phone}</div>
                    </div>
                    <div>
                        <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Decomposed 1NF Address</span>
                        <div style="font-size: 0.88rem; color: #fff;">${p.street || 'Street not specified'}</div>
                        <div style="font-size: 0.82rem; color: var(--text-secondary);">${p.city}, ${p.state} - ${p.pincode}</div>
                    </div>
                </div>

                <div style="border-top: 1px solid var(--border-color); padding-top: 16px; margin-bottom: 18px;">
                    <h4 style="font-size: 0.9rem; font-weight: 700; color: #fff; margin-bottom: 8px;">Emergency Contacts (Next of Kin):</h4>
                    ${kinHtml}
                </div>

                <div style="border-top: 1px solid var(--border-color); padding-top: 16px;">
                    <h4 style="font-size: 0.9rem; font-weight: 700; color: #fff; margin-bottom: 8px;">Recent Travel Bookings:</h4>
                    ${ticketsHtml}
                </div>
            </div>
        `;
    } catch (e) {
        container.innerHTML = `<div style="color: var(--danger); padding: 20px;">Failed to inspect file: ${e.message}</div>`;
    }
}

