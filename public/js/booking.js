// ============================================================================
// REAL-TIME COACH & SEAT SELECTION GRID & ACID BOOKING CONTROLLER
// ============================================================================

let currentTrain = null;
let currentCoaches = [];
let currentStops = [];
let selectedCoach = null;
let selectedSeats = [];
let selectedFare = 1500;
let journeyDate = '';

document.addEventListener('DOMContentLoaded', async () => {
    // Set default journey date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    journeyDate = tomorrow.toISOString().split('T')[0];

    const dateInput = document.getElementById('book-journey-date');
    if (dateInput) {
        dateInput.value = journeyDate;
        dateInput.min = new Date().toISOString().split('T')[0];
        dateInput.addEventListener('change', (e) => {
            journeyDate = e.target.value;
            selectedSeats = [];
            updateSelectionSummary();
            if (currentTrain && selectedCoach) {
                loadSeats(currentTrain.train_id, selectedCoach.coach_id);
            }
        });
    }

    const fromSelect = document.getElementById('book-from-station');
    const toSelect = document.getElementById('book-to-station');
    if (fromSelect) {
        fromSelect.addEventListener('change', () => {
            updateDestinationOptions();
            refreshJourneyAvailability();
        });
    }
    if (toSelect) {
        toSelect.addEventListener('change', refreshJourneyAvailability);
    }

    await loadTrainsDropdown();
    await checkPassengerSession();

    // Check URL parameters for preselected train
    const params = new URLSearchParams(window.location.search);
    const trainIdParam = params.get('train_id');
    if (trainIdParam) {
        const select = document.getElementById('book-train-select');
        if (select) {
            select.value = trainIdParam;
            handleTrainSelect(trainIdParam);
        }
    }

    const bookingForm = document.getElementById('ticket-reservation-form');
    if (bookingForm) {
        bookingForm.addEventListener('submit', handleReservationSubmit);
    }
});

async function checkPassengerSession() {
    const user = window.RailwayAuth ? window.RailwayAuth.getUser() : null;
    const nameEl = document.getElementById('passenger-name-display');
    const hiddenIdEl = document.getElementById('book-passenger-id');

    if (user && user.role === 'passenger') {
        if (nameEl) nameEl.textContent = `${user.name} (${user.email}) - Primary Passenger`;
        if (hiddenIdEl) hiddenIdEl.value = user.passenger_id;
    } else {
        // If not logged in as passenger, load passenger list or prompt
        const selectContainer = document.getElementById('passenger-select-container');
        if (selectContainer) {
            try {
                const res = await fetch('/api/passengers');
                const passengers = await res.json();
                let opts = '<option value="">-- Select Passenger Account --</option>';
                passengers.forEach(p => {
                    opts += `<option value="${p.passenger_id}">${p.name} (${p.city || p.email})</option>`;
                });
                selectContainer.innerHTML = `
                    <label class="form-label">Select Passenger <span style="color: var(--danger)">*</span></label>
                    <select id="book-passenger-id" class="form-control" required>
                        ${opts}
                    </select>
                    <small style="color: var(--text-muted); margin-top: 4px;">
                        Tip: <a href="login.html" style="color: var(--primary);">Sign in</a> to auto-fill your passenger identity.
                    </small>
                `;
            } catch (e) {
                console.error(e);
            }
        }
    }
}

async function loadTrainsDropdown() {
    const select = document.getElementById('book-train-select');
    if (!select) return;

    try {
        const res = await fetch('/api/trains');
        const trains = await res.json();
        
        select.innerHTML = '<option value="">-- Choose a Train Service --</option>';
        trains.forEach(t => {
            select.insertAdjacentHTML('beforeend', `
                <option value="${t.train_id}">
                    #${t.train_number} ${t.train_name} (${t.source_station} ➔ ${t.destination_station})
                </option>
            `);
        });

        select.addEventListener('change', (e) => {
            handleTrainSelect(e.target.value);
        });
    } catch (err) {
        console.error('Error loading trains:', err);
    }
}

async function handleTrainSelect(trainId) {
    selectedSeats = [];
    selectedCoach = null;
    currentTrain = null;
    currentCoaches = [];
    currentStops = [];
    updateSelectionSummary();

    if (!trainId) {
        const from = document.getElementById('book-from-station');
        const to = document.getElementById('book-to-station');
        from.innerHTML = '<option value="">Select a train first</option>';
        to.innerHTML = '<option value="">Select a train first</option>';
        from.disabled = true;
        to.disabled = true;
        document.getElementById('coach-tabs-container').innerHTML = '';
        document.getElementById('seat-grid-container').innerHTML = '<div style="padding: 30px; text-align: center; color: var(--text-muted);">Select a train to inspect coach layout.</div>';
        return;
    }

    try {
        const res = await fetch(`/api/trains`);
        const allTrains = await res.json();
        if (!res.ok) throw new Error(allTrains.error || 'Unable to load train services.');
        currentTrain = allTrains.find(t => t.train_id === parseInt(trainId, 10));
        if (!currentTrain) throw new Error('The selected train could not be found.');

        const coachesRes = await fetch(`/api/trains/${trainId}/coaches`);
        currentCoaches = await coachesRes.json();
        if (!coachesRes.ok) throw new Error(currentCoaches.error || 'Unable to load train coaches.');
        const scheduleRes = await fetch(`/api/trains/${trainId}/schedule`);
        currentStops = await scheduleRes.json();
        if (!scheduleRes.ok) throw new Error(currentStops.error || 'Unable to load this train schedule.');
        if (currentStops.length < 2) throw new Error('This train does not have a complete station schedule.');
        populateJourneyStations();

        renderCoachTabs();
    } catch (err) {
        console.error('Failed to load coaches:', err);
        document.getElementById('coach-tabs-container').innerHTML =
            `<p class="booking-error">${escapeHtml(err.message)}</p>`;
    }
}

function populateJourneyStations() {
    const from = document.getElementById('book-from-station');
    const to = document.getElementById('book-to-station');
    if (!from || !to) return;
    const originStops = currentStops.slice(0, -1);
    from.innerHTML = originStops.map(stop =>
        `<option value="${stop.station_id}">${escapeHtml(stop.station_name)} (${escapeHtml(stop.station_code)})</option>`
    ).join('');
    from.disabled = originStops.length === 0;
    from.value = String(originStops[0].station_id);
    to.disabled = false;
    updateDestinationOptions(currentStops[currentStops.length - 1].station_id);
}

function updateDestinationOptions(preferredDestinationId) {
    const from = document.getElementById('book-from-station');
    const to = document.getElementById('book-to-station');
    if (!from || !to || !currentStops.length) return;

    const originSequence = Number(
        currentStops.find(stop => String(stop.station_id) === from.value)?.stop_sequence
    );
    const destinations = currentStops.filter(stop => Number(stop.stop_sequence) > originSequence);
    const previousDestination = preferredDestinationId || to.value;
    to.innerHTML = destinations.map(stop =>
        `<option value="${stop.station_id}">${escapeHtml(stop.station_name)} (${escapeHtml(stop.station_code)})</option>`
    ).join('');
    to.disabled = destinations.length === 0;
    if (destinations.some(stop => String(stop.station_id) === String(previousDestination))) {
        to.value = String(previousDestination);
    } else if (destinations.length) {
        to.value = String(destinations[destinations.length - 1].station_id);
    }
}

function refreshJourneyAvailability() {
    selectedSeats = [];
    updateSelectionSummary();
    if (currentTrain && selectedCoach) {
        loadSeats(currentTrain.train_id, selectedCoach.coach_id);
    }
}

function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}

function renderCoachTabs() {
    const container = document.getElementById('coach-tabs-container');
    if (!container) return;

    if (!currentCoaches || currentCoaches.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted);">No coaches configured for this train.</p>';
        return;
    }

    let tabsHtml = '';
    currentCoaches.forEach((c, idx) => {
        const isActive = idx === 0 ? 'active' : '';
        tabsHtml += `
            <button type="button" class="coach-tab-btn ${isActive}" data-coach-id="${c.coach_id}" onclick="selectCoach(${c.coach_id})">
                <span>Coach ${c.coach_number}</span>
                <span class="coach-tab-sub">${c.coach_type} | ₹${c.base_fare}</span>
            </button>
        `;
    });

    container.innerHTML = tabsHtml;

    // Default select first coach
    if (currentCoaches.length > 0) {
        selectCoach(currentCoaches[0].coach_id);
    }
}

async function selectCoach(coachId) {
    selectedCoach = currentCoaches.find(c => c.coach_id === coachId);
    if (!selectedCoach) return;

    // Highlight tab
    document.querySelectorAll('.coach-tab-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.coachId) === coachId);
    });

    // Reset selected seat
    selectedSeats = [];
    updateSelectionSummary();

    if (currentTrain) {
        await loadSeats(currentTrain.train_id, coachId);
    }
}

async function loadSeats(trainId, coachId) {
    const gridContainer = document.getElementById('seat-grid-container');
    if (!gridContainer) return;

    gridContainer.innerHTML = '<div style="padding: 30px; text-align: center; color: var(--text-muted);">Querying live seat availability...</div>';

    try {
        const date = document.getElementById('book-journey-date').value || journeyDate;
        const from = document.getElementById('book-from-station').value;
        const to = document.getElementById('book-to-station').value;
        const res = await fetch(`/api/trains/${trainId}/seats?coach_id=${coachId}&journey_date=${date}&from_station_id=${from}&to_station_id=${to}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Unable to load seat availability.');
        const seats = data.seats || [];

        if (seats.length === 0) {
            gridContainer.innerHTML = '<div style="padding: 30px; text-align: center; color: var(--text-muted);">No seats found in this coach catalog.</div>';
            return;
        }

        let gridHtml = '';
        seats.forEach(s => {
            const isBooked = s.status === 'BOOKED';
            const isSelected = selectedSeats.some(seat => seat.seat_number === s.seat_number);
            const cellClass = isBooked ? 'booked' : isSelected ? 'selected' : 'available';

            gridHtml += `
                <div class="seat-cell ${cellClass}" data-seat="${s.seat_number}" onclick="onSeatClick(${s.seat_number}, '${s.berth_type}', '${s.status}')">
                    <span class="seat-number">${s.seat_number}</span>
                    <span class="berth-label">${s.berth_type}</span>
                </div>
            `;
        });

        gridContainer.innerHTML = gridHtml;
    } catch (err) {
        console.error('Failed to load seats:', err);
        gridContainer.innerHTML = `<div style="color: var(--danger); padding: 20px;">Error loading seat grid: ${err.message}</div>`;
    }
}

function onSeatClick(seatNumber, berthType, status) {
    if (status === 'BOOKED') {
        alert(`Seat ${seatNumber} is already occupied on this journey date. Please choose another seat.`);
        return;
    }

    const existingIndex = selectedSeats.findIndex(seat => seat.seat_number === seatNumber);
    if (existingIndex >= 0) selectedSeats.splice(existingIndex, 1);
    else selectedSeats.push({ seat_number: seatNumber, berth_type: berthType });
    const cell = document.querySelector(`.seat-cell[data-seat="${seatNumber}"]`);
    if (cell) cell.classList.toggle('selected', existingIndex < 0);

    updateSelectionSummary();
}

function updateSelectionSummary() {
    const summarySeatEl = document.getElementById('selected-seat-badge');
    const summaryCoachEl = document.getElementById('selected-coach-badge');
    const summaryFareEl = document.getElementById('total-fare-display');
    const submitBtn = document.getElementById('btn-submit-booking');

    if (selectedCoach) {
        if (summaryCoachEl) summaryCoachEl.textContent = `Coach ${selectedCoach.coach_number} (${selectedCoach.coach_type})`;
        const from = document.getElementById('book-from-station');
        const to = document.getElementById('book-to-station');
        const fromIndex = currentStops.findIndex(stop => String(stop.station_id) === from.value);
        const toIndex = currentStops.findIndex(stop => String(stop.station_id) === to.value);
        const distanceRatio = fromIndex >= 0 && toIndex > fromIndex && currentStops.length > 1
            ? (currentStops[toIndex].stop_sequence - currentStops[fromIndex].stop_sequence) /
                (currentStops[currentStops.length - 1].stop_sequence - currentStops[0].stop_sequence) : 1;
        selectedFare = Number(selectedCoach.base_fare || 1500) * distanceRatio;
        if (summaryFareEl) summaryFareEl.textContent =
            `₹${(selectedFare * selectedSeats.length).toFixed(2)}`;
    }

    if (selectedSeats.length) {
        if (summarySeatEl) {
            summarySeatEl.textContent = selectedSeats.map(seat => `#${seat.seat_number}`).join(', ');
            summarySeatEl.className = 'badge badge-success';
        }
        if (submitBtn) submitBtn.disabled = false;
    } else {
        if (summarySeatEl) {
            summarySeatEl.textContent = 'None Selected';
            summarySeatEl.className = 'badge badge-warning';
        }
        if (submitBtn) submitBtn.disabled = true;
    }
    if (submitBtn && selectedSeats.length) {
        submitBtn.innerHTML = `Confirm Reservation & Pay ₹${(selectedFare * selectedSeats.length).toFixed(2)}`;
    } else if (submitBtn) {
        submitBtn.innerHTML = 'Confirm Reservation & Pay';
    }
}

async function handleReservationSubmit(e) {
    e.preventDefault();

    const passengerIdEl = document.getElementById('book-passenger-id');
    const passengerId = passengerIdEl ? passengerIdEl.value : null;

    if (!passengerId) {
        alert('Please specify the passenger traveling.');
        return;
    }

    if (!currentTrain || !selectedCoach || selectedSeats.length === 0) {
        alert('Please select a train, coach, and seat from the grid.');
        return;
    }

    const date = document.getElementById('book-journey-date').value || journeyDate;
    const submitBtn = document.getElementById('btn-submit-booking');

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Executing ACID Transaction...';
    }

    try {
        const res = await fetch('/api/bookings/reserve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                passenger_id: parseInt(passengerId),
                train_id: currentTrain.train_id,
                coach_id: selectedCoach.coach_id,
                reservations: selectedSeats.map(seat => ({
                    passenger_id: parseInt(passengerId),
                    seat_number: seat.seat_number
                })),
                from_station_id: parseInt(document.getElementById('book-from-station').value),
                to_station_id: parseInt(document.getElementById('book-to-station').value),
                journey_date: date,
            })
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || 'Failed to complete reservation transaction.');
        }

        // Show Confirmation Modal
        showBookingSuccessModal(data);
        selectedSeats = [];
        updateSelectionSummary();
        if (currentTrain && selectedCoach) loadSeats(currentTrain.train_id, selectedCoach.coach_id);
    } catch (err) {
        console.error('Reservation error:', err);
        alert(`Booking Failed: ${err.message}`);
        // Refresh seat grid to reflect recent state
        if (currentTrain && selectedCoach) {
            loadSeats(currentTrain.train_id, selectedCoach.coach_id);
        }
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `Confirm Reservation & Pay ₹${(selectedFare * selectedSeats.length).toFixed(2)}`;
        }
    }
}

function showBookingSuccessModal(data) {
    const modal = document.getElementById('booking-confirmed-modal');
    const pnrEl = document.getElementById('confirmed-pnr-code');
    const detailsEl = document.getElementById('confirmed-ticket-details');

    if (pnrEl) pnrEl.textContent = data.tickets && data.tickets.length > 1
        ? `${data.tickets.length} tickets confirmed` : data.pnr || 'PNR CONFIRMED';
    if (detailsEl) {
        const seatSummary = (data.tickets || []).map(ticket =>
            `${selectedCoach.coach_number} / Seat #${ticket.seat_number} (${selectedSeats.find(seat => seat.seat_number === ticket.seat_number)?.berth_type || ''}) — ${ticket.pnr_no}`
        ).join('<br>');
        detailsEl.innerHTML = `
            <p><strong>Train:</strong> ${currentTrain.train_name} (#${currentTrain.train_number})</p>
            <p><strong>Coach & Seat:</strong><br>${seatSummary}</p>
            <p><strong>Route:</strong> ${document.getElementById('book-from-station').selectedOptions[0].text} ➔ ${document.getElementById('book-to-station').selectedOptions[0].text}</p>
            <p><strong>Date of Journey:</strong> ${document.getElementById('book-journey-date').value}</p>
            <p><strong>Fare Paid:</strong> ₹${Number(data.total_fare || 0).toFixed(2)}</p>
            <p style="color: var(--success); font-weight: 600; margin-top: 8px;">ACID transaction committed successfully with row lock protection.</p>
        `;
    }

    if (modal) modal.classList.add('active');
}
