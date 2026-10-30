// ============================================================================
// PROFILE & EMERGENCY CONTACT (NEXT OF KIN) CONTROLLER (profile.html)
// ============================================================================

let currentPassenger = null;

document.addEventListener('DOMContentLoaded', async () => {
    const user = window.RailwayAuth ? window.RailwayAuth.getUser() : null;

    if (!user) {
        alert('Please log in to manage your profile.');
        window.location.href = 'login.html';
        return;
    }

    if (user.role === 'employee') {
        renderEmployeeProfile(user);
    } else {
        await loadPassengerProfile(user.passenger_id);
    }

    // Attach listeners
    const profileForm = document.getElementById('passenger-profile-form');
    if (profileForm) {
        profileForm.addEventListener('submit', handleProfileUpdate);
    }

    const kinForm = document.getElementById('add-kin-form');
    if (kinForm) {
        kinForm.addEventListener('submit', handleAddKin);
    }
});

async function loadPassengerProfile(passengerId) {
    const employeePanel = document.getElementById('employee-profile-panel');
    const passengerPanel = document.getElementById('passenger-profile-panel');

    if (employeePanel) employeePanel.style.display = 'none';
    if (passengerPanel) passengerPanel.style.display = 'block';

    try {
        const res = await fetch(`/api/passengers/profile?passenger_id=${passengerId}`);
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Failed to load profile.');

        currentPassenger = data.profile;

        // Populate Form
        document.getElementById('prof-name').value = currentPassenger.name || '';
        document.getElementById('prof-email').value = currentPassenger.email || '';
        document.getElementById('prof-dob').value = currentPassenger.dob ? currentPassenger.dob.substring(0, 10) : '';
        document.getElementById('prof-age').value = currentPassenger.age || calculateAge(currentPassenger.dob);
        document.getElementById('prof-phone').value = currentPassenger.primary_phone || '';
        document.getElementById('prof-street').value = currentPassenger.street || '';
        document.getElementById('prof-city').value = currentPassenger.city || '';
        document.getElementById('prof-state').value = currentPassenger.state || '';
        document.getElementById('prof-pincode').value = currentPassenger.pincode || '';

        // Render Kin List
        renderKinList(data.next_of_kin || []);
    } catch (err) {
        console.error('Error loading profile:', err);
    }
}

function calculateAge(dob) {
    if (!dob) return 0;
    return new Date().getFullYear() - new Date(dob).getFullYear();
}

function renderKinList(kinList) {
    const container = document.getElementById('kin-list-container');
    if (!container) return;

    if (kinList.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 20px; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius-sm);">
                No emergency contacts registered yet. Please add at least one next of kin.
            </div>
        `;
        return;
    }

    let html = '';
    kinList.forEach(k => {
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-bottom: 10px;">
                <div>
                    <div style="font-weight: 700; color: #fff;">${k.kin_name} <span class="badge badge-info" style="margin-left: 8px;">${k.relation}</span></div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">
                        📞 ${k.phone_number}
                    </div>
                </div>
                <button class="btn btn-danger btn-sm" onclick="deleteKin('${k.kin_name}')">
                    Remove
                </button>
            </div>
        `;
    });

    container.innerHTML = html;
}

async function handleProfileUpdate(e) {
    e.preventDefault();
    if (!currentPassenger) return;

    const name = document.getElementById('prof-name').value;
    const primary_phone = document.getElementById('prof-phone').value;
    const street = document.getElementById('prof-street').value;
    const city = document.getElementById('prof-city').value;
    const state = document.getElementById('prof-state').value;
    const pincode = document.getElementById('prof-pincode').value;

    try {
        const res = await fetch('/api/passengers/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                passenger_id: currentPassenger.passenger_id,
                name, primary_phone, street, city, state, pincode
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update profile.');

        // Update local storage name
        const user = window.RailwayAuth ? window.RailwayAuth.getUser() : null;
        if (user) {
            user.name = name;
            localStorage.setItem('railway_user', JSON.stringify(user));
        }

        alert('Passenger profile & composite address updated successfully!');
    } catch (err) {
        alert(err.message);
    }
}

async function handleAddKin(e) {
    e.preventDefault();
    if (!currentPassenger) return;

    const kin_name = document.getElementById('kin-name').value;
    const relation = document.getElementById('kin-relation').value;
    const phone_number = document.getElementById('kin-phone').value;

    try {
        const res = await fetch('/api/passengers/kin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                passenger_id: currentPassenger.passenger_id,
                kin_name, relation, phone_number
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to add emergency contact.');

        // Reset form
        document.getElementById('kin-name').value = '';
        document.getElementById('kin-phone').value = '';

        // Reload profile kin
        loadPassengerProfile(currentPassenger.passenger_id);
    } catch (err) {
        alert(err.message);
    }
}

async function deleteKin(kinName) {
    if (!confirm(`Are you sure you want to remove ${kinName} from your emergency contacts?`)) return;

    try {
        const res = await fetch('/api/passengers/kin', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                passenger_id: currentPassenger.passenger_id,
                kin_name: kinName
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to remove contact.');

        loadPassengerProfile(currentPassenger.passenger_id);
    } catch (err) {
        alert(err.message);
    }
}

function renderEmployeeProfile(emp) {
    const employeePanel = document.getElementById('employee-profile-panel');
    const passengerPanel = document.getElementById('passenger-profile-panel');

    if (passengerPanel) passengerPanel.style.display = 'none';
    if (employeePanel) employeePanel.style.display = 'block';

    const detailsEl = document.getElementById('employee-details-container');
    if (detailsEl) {
        detailsEl.innerHTML = `
            <div class="panel-card">
                <div class="panel-header">
                    <div class="panel-title">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                        Official Staff Credentials & Deployment
                    </div>
                    <span class="badge badge-success">Active Duty</span>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px;">
                    <div>
                        <div class="form-label">Employee ID</div>
                        <div style="font-size: 1.1rem; font-weight: 700; color: #fff; font-family: var(--font-mono);">#EMP-${emp.employee_id}</div>
                    </div>
                    <div>
                        <div class="form-label">Full Name</div>
                        <div style="font-size: 1.1rem; font-weight: 700; color: #fff;">${emp.name}</div>
                    </div>
                    <div>
                        <div class="form-label">Designation</div>
                        <div style="font-size: 1.1rem; font-weight: 700; color: var(--primary);">${emp.designation}</div>
                    </div>
                    <div>
                        <div class="form-label">Official Email</div>
                        <div style="font-size: 1rem; color: var(--text-secondary);">${emp.email}</div>
                    </div>
                    <div>
                        <div class="form-label">Basic Salary</div>
                        <div style="font-size: 1rem; font-weight: 700; color: var(--success);">₹${parseFloat(emp.salary || 50000).toFixed(2)}</div>
                    </div>
                    <div>
                        <div class="form-label">Assignment Type</div>
                        <div style="font-size: 1rem; color: #fff;">
                            ${emp.assigned_station_id ? `Station Posting (ID: ${emp.assigned_station_id})` : emp.assigned_train_id ? `Onboard Train Crew (${emp.role_on_train || 'Crew'})` : 'Field Staff'}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

