// ============================================================================
// DYNAMIC NAVIGATION SIDEBAR INJECTOR & SESSION MANAGER
// ============================================================================

(function () {
    function getStoredUser() {
        try {
            const raw = localStorage.getItem('railway_user');
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function logout() {
        localStorage.removeItem('railway_user');
        localStorage.removeItem('railway_token');
        window.location.href = 'index.html';
    }

    function initSidebar() {
        const user = getStoredUser();
        const path = window.location.pathname.split('/').pop() || 'index.html';

        const isPassenger = user && user.role === 'passenger';
        const isEmployee = user && user.role === 'employee';

        // Build navigation items
        let navHtml = `
            <div class="nav-section-title">Operations & Booking</div>
            <a href="index.html" class="nav-link ${path === 'index.html' || path === '' ? 'active' : ''}">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                Train Schedules
            </a>
            <a href="booking.html" class="nav-link ${path === 'booking.html' ? 'active' : ''}">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="16" rx="2"/><path d="M4 11h16"/><path d="M12 3v8"/></svg>
                Book Seats
            </a>
            <a href="dashboard.html" class="nav-link ${path === 'dashboard.html' ? 'active' : ''}">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></svg>
                My Tickets & PNR
            </a>
        `;

        if (isPassenger) {
            navHtml += `
                <div class="nav-section-title">Account</div>
                <a href="profile.html" class="nav-link ${path === 'profile.html' ? 'active' : ''}">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    Profile & Next of Kin
                </a>
            `;
        } else if (isEmployee) {
            navHtml += `
                <div class="nav-section-title">Administration</div>
                <a href="admin.html" class="nav-link ${path === 'admin.html' ? 'active' : ''}">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    Admin Panel
                </a>
                <a href="passenger_inspection.html" class="nav-link ${path === 'passenger_inspection.html' ? 'active' : ''}">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>
                    Staff Passenger Lookup
                </a>
                <a href="profile.html" class="nav-link ${path === 'profile.html' ? 'active' : ''}">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    Staff Profile
                </a>
            `;
        } else {
            navHtml += `
                <div class="nav-section-title">Authentication</div>
                <a href="login.html" class="nav-link ${path === 'login.html' ? 'active' : ''}">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                    Passenger Login
                </a>
                <a href="register.html" class="nav-link ${path === 'register.html' ? 'active' : ''}">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                    Register Account
                </a>
                <a href="emp_login.html" class="nav-link ${path === 'emp_login.html' ? 'active' : ''}">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    Employee Portal
                </a>
            `;
        }

        // Build User card in footer
        let userFooterHtml = '';
        if (user) {
            const initial = (user.name || 'U').charAt(0).toUpperCase();
            userFooterHtml = `
                <div class="user-status-card">
                    <div class="user-profile-meta">
                        <div class="user-avatar">${initial}</div>
                        <div class="user-name-role">
                            <span class="user-name">${user.name || 'User'}</span>
                            <span class="user-role-badge">${user.role === 'employee' ? (user.designation || 'Staff') : 'Passenger'}</span>
                        </div>
                    </div>
                    <button id="btn-sidebar-logout" class="btn-icon-logout" title="Sign Out">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    </button>
                </div>
            `;
        }

        const sidebarMarkup = `
            <aside class="app-sidebar" id="main-sidebar">
                <div class="sidebar-header">
                    <div class="brand-symbol">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="4" y="3" width="16" height="16" rx="2"/>
                            <path d="M4 11h16"/>
                            <path d="M12 3v8"/>
                            <path d="m8 19-2 3"/>
                            <path d="m16 19 2 3"/>
                        </svg>
                    </div>
                    <div class="brand-info">
                        <span class="brand-title">RailTransit</span>
                        <span class="brand-sub">Relational Operations</span>
                    </div>
                </div>

                <nav class="sidebar-nav">
                    ${navHtml}
                </nav>

                <div class="sidebar-footer">
                    ${userFooterHtml}
                    <div class="db-latency-pill" title="Live Database Engine & Latency">
                        <div>
                            <span class="status-dot" id="sidebar-db-dot"></span>
                            <span id="sidebar-db-status">MySQL 8.0 Live</span>
                        </div>
                        <span class="latency-val" id="sidebar-db-latency">-- ms</span>
                    </div>
                </div>
            </aside>
        `;

        const container = document.getElementById('sidebar-container');
        if (container) {
            container.innerHTML = sidebarMarkup;
        } else {
            document.body.insertAdjacentHTML('afterbegin', sidebarMarkup);
        }

        // Attach logout event
        const logoutBtn = document.getElementById('btn-sidebar-logout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', logout);
        }

        // Poll or check status
        fetchSystemStatus();
    }

    async function fetchSystemStatus() {
        try {
            const res = await fetch('/api/status');
            const data = await res.json();
            const latencyEl = document.getElementById('sidebar-db-latency');
            const statusEl = document.getElementById('sidebar-db-status');
            const dotEl = document.getElementById('sidebar-db-dot');

            if (latencyEl && data.lastDbLatencyMs !== undefined) {
                latencyEl.textContent = `${data.lastDbLatencyMs} ms`;
            }
            if (statusEl && data.databaseEngine) {
                statusEl.textContent = data.connectedToMySQL ? 'MySQL Live' : 'In-Memory (3NF)';
            }
            if (dotEl) {
                dotEl.style.backgroundColor = data.connectedToMySQL ? 'var(--success)' : 'var(--warning)';
            }
        } catch (e) {
            // Ignore error in status ping
        }
    }

    window.RailwayAuth = {
        getUser: getStoredUser,
        logout: logout,
        requirePassenger: function () {
            const u = getStoredUser();
            if (!u || u.role !== 'passenger') {
                alert('Please sign in as a passenger to access this service.');
                window.location.href = 'login.html';
            }
        },
        requireEmployee: function () {
            const u = getStoredUser();
            if (!u || u.role !== 'employee') {
                alert('Access restricted to Railway Staff & Administrators.');
                window.location.href = 'emp_login.html';
            }
        }
    };

    document.addEventListener('DOMContentLoaded', initSidebar);
})();

