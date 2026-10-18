/* Shared helpers for every FeeFlow page. */
const App = (() => {
  const MENU = {
    admin: [
      ['index.html', 'Dashboard'],
      ['students.html', 'Students Fees & Payments'],
      ['receipts.html', 'Receipts'],
      ['attendance.html', 'Attendance'],
      ['reports.html', 'Reports'],
      ['student-portal.html', 'Student Portal'],
      ['parent-portal.html', 'Parent Portal'],
    ],
    student: [['student-portal.html', 'Student Portal']],
    parent: [['parent-portal.html', 'Parent Portal']],
  };

  const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => 'KSh ' + Number(n).toLocaleString('en-US');
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const prettyDate = (s) => {
    if (!s) return '--';
    const [y, m, d] = s.split('-');
    return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
  };
  const feeBadge = (status) => `<span class="badge ${status === 'Cleared' ? 'paid' : 'pending'}">${esc(status)}</span>`;

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    let data = null;
    try { data = await res.json(); } catch (_) { /* non-JSON response */ }
    if (res.status === 401 && !path.startsWith('/api/auth/login')) {
      location.href = 'login.html';
      throw new Error('Please log in.');
    }
    if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
    return data;
  }

  function toast(message, isError = false) {
    const el = document.createElement('div');
    el.className = 'toast' + (isError ? ' error' : '');
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  /** Opens a modal. body is an HTML string. Returns { root, close, setError }. */
  function openModal({ title, subtitle = '', body, buttons = [], dismissable = true }) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h3>${esc(title)}</h3>
        ${subtitle ? `<p class="modal-sub">${esc(subtitle)}</p>` : ''}
        <div class="form-error" hidden></div>
        <div class="modal-body">${body}</div>
        <div class="modal-actions"></div>
      </div>`;
    document.body.appendChild(backdrop);
    const close = () => backdrop.remove();
    const errBox = backdrop.querySelector('.form-error');
    const setError = (m) => { errBox.hidden = !m; errBox.textContent = m || ''; };
    const actions = backdrop.querySelector('.modal-actions');
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn' + (b.primary ? '' : ' btn-outline');
      btn.textContent = b.label;
      btn.addEventListener('click', async () => {
        setError('');
        btn.disabled = true;
        try { await b.onClick({ close, setError, root: backdrop }); }
        catch (e) { setError(e.message); }
        finally { btn.disabled = false; }
      });
      actions.appendChild(btn);
    }
    if (dismissable) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    const first = backdrop.querySelector('input, select');
    if (first) first.focus();
    return { root: backdrop, close, setError };
  }

  function changePasswordModal(forced) {
    openModal({
      title: 'Change password',
      subtitle: forced ? 'You are using a temporary password. Please choose your own to continue.' : 'Choose a new password (at least 8 characters).',
      dismissable: !forced,
      body: `
        <div class="form-group"><label>Current password</label><input type="password" id="cp-old" autocomplete="current-password"></div>
        <div class="form-group"><label>New password</label><input type="password" id="cp-new" autocomplete="new-password"></div>
        <div class="form-group"><label>Repeat new password</label><input type="password" id="cp-new2" autocomplete="new-password"></div>`,
      buttons: [
        ...(forced ? [] : [{ label: 'Cancel', onClick: ({ close }) => close() }]),
        {
          label: 'Save password', primary: true,
          onClick: async ({ root, close }) => {
            const v = (id) => root.querySelector(id).value;
            if (v('#cp-new') !== v('#cp-new2')) throw new Error('The new passwords do not match.');
            await api('/api/auth/change-password', { method: 'POST', body: { currentPassword: v('#cp-old'), newPassword: v('#cp-new') } });
            close();
            toast('Password changed.');
          },
        },
      ],
    });
  }

  function renderSidebar(user, active) {
    const items = MENU[user.role].map(
      ([href, label]) => `<li class="${href === active ? 'active' : ''}"><a href="${href}">${esc(label)}</a></li>`
    ).join('');
    document.getElementById('sidebar').innerHTML = `
      <div>
        <div class="sidebar-brand"><h2>FeeFlow</h2><p>School Management System</p></div>
        <ul class="sidebar-menu">${items}</ul>
      </div>
      <div class="sidebar-footer">
        <span class="who">${esc(user.name)}</span>
        <span class="role">${esc(user.role === 'admin' ? 'Admin account' : user.role + ' account')}</span>
        <button class="link-btn" id="btn-chpw">Change password</button>
        <button class="link-btn" id="btn-logout">Log out</button>
      </div>`;
    document.getElementById('btn-chpw').addEventListener('click', () => changePasswordModal(false));
    document.getElementById('btn-logout').addEventListener('click', async () => {
      try { await api('/api/auth/logout', { method: 'POST' }); } catch (_) { /* ignore */ }
      location.href = 'login.html';
    });
  }

  /** Call once per page. Redirects to login if needed. Returns { user, today }. */
  async function init({ roles, active }) {
    const me = await api('/api/auth/me');
    if (!roles.includes(me.user.role)) { location.href = me.user.home; throw new Error('redirecting'); }
    renderSidebar(me.user, active);
    if (me.user.mustChangePassword) changePasswordModal(true);
    return me;
  }

  /** Small helper to fill a <tbody>. */
  function fillRows(tbody, rows, colCount, emptyText) {
    tbody.innerHTML = rows.length ? rows.join('') : `<tr class="empty-row"><td colspan="${colCount}">${esc(emptyText)}</td></tr>`;
  }

  return { api, esc, money, prettyDate, feeBadge, toast, openModal, init, fillRows };
})();
