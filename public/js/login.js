const form = document.getElementById('login-form');
const errorBox = document.getElementById('error');
const submit = document.getElementById('submit');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.style.display = 'none';
  submit.disabled = true;
  submit.textContent = 'Signing in...';
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('username').value,
        password: document.getElementById('password').value,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Login failed.');
    location.href = data.user.home;
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
    submit.disabled = false;
    submit.textContent = 'Login to Dashboard';
  }
});

// Already signed in? Go straight to your page.
fetch('/api/auth/me', { credentials: 'same-origin' })
  .then((r) => (r.ok ? r.json() : null))
  .then((d) => { if (d && d.user) location.href = d.user.home; })
  .catch(() => {});
