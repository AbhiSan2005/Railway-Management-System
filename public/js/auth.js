// ============================================================================
// AUTHENTICATION CONTROLLER (login.html, register.html, emp_login.html)
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // 1. Passenger Login Handler
    const loginForm = document.getElementById('passenger-login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            const errorBox = document.getElementById('login-error');

            if (errorBox) errorBox.style.display = 'none';

            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || 'Authentication failed');
                }

                localStorage.setItem('railway_token', data.token);
                localStorage.setItem('railway_user', JSON.stringify(data.user));

                // Redirect to booking or dashboard
                window.location.href = 'dashboard.html';
            } catch (err) {
                if (errorBox) {
                    errorBox.textContent = err.message;
                    errorBox.style.display = 'block';
                } else {
                    alert(err.message);
                }
            }
        });
    }

    // 2. Passenger Registration Handler
    const regForm = document.getElementById('passenger-register-form');
    if (regForm) {
        regForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('reg-name').value;
            const dob = document.getElementById('reg-dob').value;
            const gender = document.getElementById('reg-gender').value;
            const primary_phone = document.getElementById('reg-phone').value;
            const email = document.getElementById('reg-email').value;
            const password = document.getElementById('reg-password').value;
            const street = document.getElementById('reg-street').value;
            const city = document.getElementById('reg-city').value;
            const state = document.getElementById('reg-state').value;
            const pincode = document.getElementById('reg-pincode').value;
            const errorBox = document.getElementById('reg-error');

            if (errorBox) errorBox.style.display = 'none';

            try {
                const res = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name, dob, gender, primary_phone, email, password,
                        street, city, state, pincode
                    })
                });

                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || 'Registration failed');
                }

                localStorage.setItem('railway_token', data.token);
                localStorage.setItem('railway_user', JSON.stringify(data.user));

                alert('Account registered successfully! Welcome aboard, ' + name);
                window.location.href = 'dashboard.html';
            } catch (err) {
                if (errorBox) {
                    errorBox.textContent = err.message;
                    errorBox.style.display = 'block';
                } else {
                    alert(err.message);
                }
            }
        });
    }

    // 3. Employee / Staff Login Handler
    const empForm = document.getElementById('employee-login-form');
    if (empForm) {
        empForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('emp-email').value;
            const password = document.getElementById('emp-password').value;
            const errorBox = document.getElementById('emp-error');

            if (errorBox) errorBox.style.display = 'none';

            try {
                const res = await fetch('/api/auth/emp-login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || 'Staff authentication failed');
                }

                localStorage.setItem('railway_token', data.token);
                localStorage.setItem('railway_user', JSON.stringify(data.user));

                window.location.href = 'admin.html';
            } catch (err) {
                if (errorBox) {
                    errorBox.textContent = err.message;
                    errorBox.style.display = 'block';
                } else {
                    alert(err.message);
                }
            }
        });
    }
});

