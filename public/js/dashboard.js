// ============================================================================
// PASSENGER DASHBOARD & TICKET OPERATIONS (dashboard.html)
// ============================================================================

let currentTickets = [];

document.addEventListener('DOMContentLoaded', () => {
    loadUserTickets();

    const pnrForm = document.getElementById('pnr-search-form');
    if (pnrForm) {
        pnrForm.addEventListener('submit', handlePnrSearch);
    }
});

async function loadUserTickets() {
    const user = window.RailwayAuth ? window.RailwayAuth.getUser() : null;
    const tableBody = document.getElementById('tickets-table-body');
    const guestNotice = document.getElementById('guest-dashboard-notice');

    if (!user || user.role !== 'passenger') {
        if (guestNotice) guestNotice.style.display = 'block';
        if (tableBody) tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">Please log in as a passenger or search a PNR above.</td></tr>';
        return;
    }

    if (guestNotice) guestNotice.style.display = 'none';
    if (tableBody) tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center;">Loading your tickets...</td></tr>';

    try {
        const res = await fetch(`/api/bookings/my-tickets?passenger_id=${user.passenger_id}`);
        currentTickets = await res.json();

        if (!currentTickets || currentTickets.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 30px;">
                        No tickets booked yet. <a href="booking.html" style="color: var(--primary); font-weight: 600;">Book your first journey now!</a>
                    </td>
                </tr>
            `;
            return;
        }

        renderTicketsTable(currentTickets);
    } catch (err) {
        console.error('Error fetching tickets:', err);
        tableBody.innerHTML = `<tr><td colspan="8" style="color: var(--danger);">Failed to load tickets: ${err.message}</td></tr>`;
    }
}

function renderTicketsTable(tickets) {
    const tableBody = document.getElementById('tickets-table-body');
    if (!tableBody) return;

    let html = '';
    tickets.forEach(tk => {
        const isCancelled = tk.status === 'CANCELLED';
        const badgeClass = isCancelled ? 'badge-danger' : 'badge-success';

        html += `
            <tr>
                <td style="font-family: var(--font-mono); font-weight: 700; color: var(--primary);">
                    ${tk.pnr_no}
                </td>
                <td>
                    <strong>${tk.train_name}</strong>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">#${tk.train_number} (${tk.train_type || 'Express'})</div>
                </td>
                <td>
                    ${tk.source_station || 'Origin'} ➔ ${tk.destination_station || 'Dest'}
                </td>
                <td>
                    <strong>Coach ${tk.coach_number}</strong> (${tk.coach_type})
                    <div style="font-size: 0.75rem; color: var(--text-secondary);">Seat ${tk.seat_number} [${tk.berth_type || 'LOWER'}]</div>
                </td>
                <td>
                    <strong>${tk.journey_date}</strong>
                    <div style="font-size: 0.72rem; color: var(--text-muted);">${tk.booking_date ? tk.booking_date.substring(0, 10) : ''}</div>
                </td>
                <td>
                    <strong>₹${parseFloat(tk.fare).toFixed(2)}</strong>
                </td>
                <td>
                    <span class="badge ${badgeClass}">${tk.status}</span>
                </td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary btn-sm" onclick="viewETicket('${tk.pnr_no}')" title="Print E-Ticket">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                            Pass
                        </button>
                        ${!isCancelled ? `
                            <button class="btn btn-danger btn-sm" onclick="cancelTicket(${tk.ticket_id}, '${tk.pnr_no}')" title="Cancel Reservation">
                                Cancel
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    });

    tableBody.innerHTML = html;
}

async function handlePnrSearch(e) {
    e.preventDefault();
    const pnrInput = document.getElementById('search-pnr-input');
    const pnr = pnrInput ? pnrInput.value.trim() : '';

    if (!pnr) {
        alert('Please enter a valid PNR number.');
        return;
    }

    const container = document.getElementById('pnr-result-card');
    if (container) {
        container.style.display = 'block';
        container.innerHTML = '<div style="padding: 20px; text-align: center;">Searching PNR database...</div>';
    }

    try {
        const res = await fetch(`/api/bookings/pnr/${pnr}`);
        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'PNR record not found.');
        }

        renderPnrLookupCard(data);
    } catch (err) {
        if (container) {
            container.innerHTML = `<div style="color: var(--danger); padding: 20px;">${err.message}</div>`;
        }
    }
}

function renderPnrLookupCard(tk) {
    const container = document.getElementById('pnr-result-card');
    if (!container) return;

    const isCancelled = tk.status === 'CANCELLED';

    container.innerHTML = `
        <div class="panel-header" style="margin-bottom: 14px;">
            <div class="panel-title">
                <span class="badge badge-info" style="font-family: var(--font-mono); font-size: 1rem;">${tk.pnr_no}</span>
                <span>Booking Status: <span class="badge ${isCancelled ? 'badge-danger' : 'badge-success'}">${tk.status}</span></span>
            </div>
            <div>
                <button class="btn btn-secondary btn-sm" onclick="viewETicket('${tk.pnr_no}')">Print Official Pass</button>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 16px;">
            <div>
                <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Passenger</span>
                <div style="font-size: 0.95rem; font-weight: 700; color: #fff;">${tk.passenger_name}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">Phone: ${tk.primary_phone || 'N/A'}</div>
            </div>
            <div>
                <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Train Service</span>
                <div style="font-size: 0.95rem; font-weight: 700; color: #fff;">${tk.train_name} (#${tk.train_number})</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">${tk.source_station} ➔ ${tk.destination_station}</div>
            </div>
            <div>
                <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Seat / Berth</span>
                <div style="font-size: 0.95rem; font-weight: 700; color: var(--primary);">Coach ${tk.coach_number} / Seat #${tk.seat_number}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">Berth Type: ${tk.berth_type || 'LOWER'} (${tk.coach_type})</div>
            </div>
            <div>
                <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Travel Date</span>
                <div style="font-size: 0.95rem; font-weight: 700; color: #fff;">${tk.journey_date}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">Fare: ₹${parseFloat(tk.fare).toFixed(2)}</div>
            </div>
        </div>

        ${tk.next_of_kin && tk.next_of_kin.length > 0 ? `
            <div style="padding-top: 12px; border-top: 1px solid var(--border-color); font-size: 0.82rem; color: var(--text-secondary);">
                <strong>Emergency Contact on Record:</strong> ${tk.next_of_kin[0].kin_name} (${tk.next_of_kin[0].relation}) - 📞 ${tk.next_of_kin[0].phone_number}
            </div>
        ` : ''}
    `;
}

async function cancelTicket(ticketId, pnrNo) {
    if (!confirm(`Are you sure you want to cancel ticket ${pnrNo}? A cancellation fee applies and your seat will be immediately released.`)) {
        return;
    }

    try {
        const res = await fetch(`/api/bookings/${ticketId}/cancel`, {
            method: 'PUT'
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || 'Failed to cancel reservation.');
        }

        alert(`Reservation ${pnrNo} has been cancelled under an atomic transaction.\nRefund Approved: ₹${data.refund_amount}`);
        loadUserTickets();
    } catch (err) {
        alert(`Cancellation error: ${err.message}`);
    }
}

async function viewETicket(pnr) {
    try {
        const res = await fetch(`/api/bookings/pnr/${pnr}`);
        const tk = await res.json();
        if (!res.ok) throw new Error(tk.error || 'Could not fetch ticket details.');

        const modal = document.getElementById('eticket-modal');
        const passContainer = document.getElementById('eticket-render-container');

        if (passContainer) {
            passContainer.innerHTML = `
                <div class="ticket-pass">
                    <div class="ticket-pass-header">
                        <div class="ticket-pass-brand">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="16" rx="2"/><path d="M4 11h16"/><path d="M12 3v8"/></svg>
                            INDIAN RAILWAYS E-RESERVATION PASS
                        </div>
                        <div class="pnr-box">
                            <div class="ticket-label">PNR NUMBER</div>
                            <div class="pnr-code">${tk.pnr_no}</div>
                        </div>
                    </div>

                    <div class="ticket-pass-grid">
                        <div>
                            <div class="ticket-label">TRAIN NUMBER & NAME</div>
                            <div class="ticket-value">#${tk.train_number} - ${tk.train_name}</div>
                        </div>
                        <div>
                            <div class="ticket-label">CLASS & COACH</div>
                            <div class="ticket-value">${tk.coach_type} | Coach ${tk.coach_number}</div>
                        </div>
                        <div>
                            <div class="ticket-label">ORIGIN ➔ DESTINATION</div>
                            <div class="ticket-value">${tk.source_station} ➔ ${tk.destination_station}</div>
                        </div>
                        <div>
                            <div class="ticket-label">SEAT & BERTH</div>
                            <div class="ticket-value" style="color: #1e40af; font-size: 1.1rem; font-weight: 800;">
                                SEAT #${tk.seat_number} (${tk.berth_type || 'LOWER'})
                            </div>
                        </div>
                        <div>
                            <div class="ticket-label">JOURNEY DATE</div>
                            <div class="ticket-value">${tk.journey_date}</div>
                        </div>
                        <div>
                            <div class="ticket-label">TOTAL FARE PAID</div>
                            <div class="ticket-value">₹${parseFloat(tk.fare).toFixed(2)}</div>
                        </div>
                    </div>

                    <div style="border-top: 1px dashed #d1d5db; padding-top: 12px; margin-top: 12px; font-size: 0.8rem;">
                        <strong>Passenger:</strong> ${tk.passenger_name} | Age: ${tk.age || 'N/A'} | Contact: ${tk.primary_phone || 'N/A'}<br>
                        <strong>Address:</strong> ${tk.street || ''}, ${tk.city || ''}, ${tk.state || ''} ${tk.pincode || ''}<br>
                        ${tk.next_of_kin && tk.next_of_kin.length > 0 ? `<strong>Emergency Next of Kin:</strong> ${tk.next_of_kin[0].kin_name} (${tk.next_of_kin[0].relation}) - ${tk.next_of_kin[0].phone_number}` : ''}
                    </div>

                    <div style="text-align: right; margin-top: 16px; font-size: 0.7rem; color: #6b7280;">
                        Generated via RailTransit Relational System | Status: ${tk.status}
                    </div>
                </div>
            `;
        }

        if (modal) modal.classList.add('active');
    } catch (e) {
        alert(e.message);
    }
}

function closeETicketModal() {
    const modal = document.getElementById('eticket-modal');
    if (modal) modal.classList.remove('active');
}

