const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openDb, seedDemoData } = require('../server/db');
const { createApp } = require('../server/app');
const { today } = require('../server/util');

const config = { nodeEnv: 'test', jwtSecret: 'test-secret', schoolName: 'Test School', timezone: 'Africa/Nairobi' };
let server, base;

/** Tiny HTTP client with its own cookie jar (one per "browser"). */
function client() {
  let cookie = '';
  async function call(method, path, body) {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, type, data, headers: res.headers };
  }
  return {
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b || {}),
    put: (p, b) => call('PUT', p, b),
    async login(username, password) {
      const r = await call('POST', '/api/auth/login', { username, password });
      assert.equal(r.status, 200, `login failed for ${username}: ${JSON.stringify(r.data)}`);
      return r;
    },
  };
}

before(async () => {
  const db = openDb(':memory:');
  seedDemoData(db, { adminPassword: 'Admin@12345', studentPassword: 'Student@12345', parentPassword: 'Parent@12345' });
  const app = createApp({ db, config });
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

/* ---------------- Authentication ---------------- */
test('API rejects requests when not logged in', async () => {
  const c = client();
  for (const p of ['/api/students', '/api/dashboard', '/api/payments', '/api/attendance', '/api/portal/student', '/api/reports/collection.pdf']) {
    assert.equal((await c.get(p)).status, 401, p);
  }
});

test('login: wrong password, unknown user and SQL-injection attempt all fail the same way', async () => {
  const c = client();
  const a = await c.post('/api/auth/login', { username: 'admin', password: 'wrong' });
  const b = await c.post('/api/auth/login', { username: 'nobody', password: 'whatever' });
  const d = await c.post('/api/auth/login', { username: "' OR 1=1 --", password: "' OR 1=1 --" });
  for (const r of [a, b, d]) assert.equal(r.status, 401);
  assert.equal(a.data.error, b.data.error); // no hint about which usernames exist
  assert.equal((await c.post('/api/auth/login', {})).status, 400);
});

test('login works with username OR email, and sends users to the right home page', async () => {
  let r = await client().login('admin', 'Admin@12345');
  assert.equal(r.data.user.home, 'index.html');
  r = await client().login('admin@feeflow.edu', 'Admin@12345');
  assert.equal(r.data.user.role, 'admin');
  r = await client().login('STU001', 'Student@12345');
  assert.equal(r.data.user.home, 'student-portal.html');
  r = await client().login('parent1', 'Parent@12345');
  assert.equal(r.data.user.home, 'parent-portal.html');
});

test('login cookie is HttpOnly and SameSite=Strict, and logout clears the session', async () => {
  const res = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@12345' }),
  });
  const set = res.headers.get('set-cookie');
  assert.match(set, /HttpOnly/i);
  assert.match(set, /SameSite=Strict/i);

  const c = client();
  await c.login('admin', 'Admin@12345');
  assert.equal((await c.get('/api/auth/me')).status, 200);
  await c.post('/api/auth/logout');
  assert.equal((await c.get('/api/auth/me')).status, 401);
});

test('a forged or tampered token is rejected', async () => {
  const res = await fetch(base + '/api/students', { headers: { Cookie: 'ff_token=abc.def.ghi' } });
  assert.equal(res.status, 401);
});

/* ---------------- Admin: data & calculations ---------------- */
test('dashboard totals are calculated from real payments', async () => {
  const c = client(); await c.login('admin', 'Admin@12345');
  const { data } = await c.get('/api/dashboard');
  assert.equal(data.studentCount, 10);
  assert.equal(data.collected, 456500);
  assert.equal(data.outstanding, 1085600 - 456500);
  assert.equal(data.recentPayments.length, 9);
});

test('student balances are computed (fixes the wrong hardcoded values in the old HTML)', async () => {
  const c = client(); await c.login('admin', 'Admin@12345');
  const { data } = await c.get('/api/students');
  const brian = data.students.find((s) => s.admissionNo === 'STU001');
  assert.equal(brian.balance, 111400 - 45000);
  assert.equal(brian.status, 'Pending'); // old page wrongly said "Cleared"
  assert.equal(brian.yearLabel, '3rd');
  const amina = data.students.find((s) => s.admissionNo === 'STU002');
  assert.equal(amina.balance, 11200);
  const emmanuel = data.students.find((s) => s.admissionNo === 'STU007');
  assert.equal(emmanuel.paid, 0);
});

test('recording a payment: receipt number, balance update, validation', async () => {
  const c = client(); await c.login('admin', 'Admin@12345');
  const t = today(config.timezone);

  const ok = await c.post('/api/payments', { admissionNo: 'STU007', amount: 12000, mode: 'M-Pesa', reference: 'ABC123' });
  assert.equal(ok.status, 201);
  assert.match(ok.data.receiptNo, new RegExp(`^RCT-${t.slice(0, 4)}-\\d{3}$`));
  assert.equal(ok.data.student.paid, 12000);
  assert.equal(ok.data.student.balance, 100000);

  const second = await c.post('/api/payments', { admissionNo: 'STU007', amount: 1000, mode: 'Cash' });
  const n = (r) => Number(r.data.receiptNo.split('-')[2]);
  assert.equal(n(second), n(ok) + 1); // receipt numbers increase, never repeat

  const bad = [
    [{ admissionNo: 'STU007', amount: 0, mode: 'Cash' }, 400],
    [{ admissionNo: 'STU007', amount: -5, mode: 'Cash' }, 400],
    [{ admissionNo: 'STU007', amount: 10.5, mode: 'Cash' }, 400],
    [{ admissionNo: 'STU007', amount: 'abc', mode: 'Cash' }, 400],
    [{ admissionNo: 'STU007', amount: 100, mode: 'Bitcoin' }, 400],
    [{ admissionNo: 'STU007', amount: 100, mode: 'Cash', paidOn: '2999-01-01' }, 400],
    [{ admissionNo: 'STU007', amount: 100, mode: 'Cash', paidOn: 'not-a-date' }, 400],
    [{ admissionNo: 'NOPE', amount: 100, mode: 'Cash' }, 404],
    [{ admissionNo: 'STU007', amount: 99999999, mode: 'Cash' }, 409], // more than owed
  ];
  for (const [body, status] of bad) {
    const r = await c.post('/api/payments', body);
    assert.equal(r.status, status, JSON.stringify(body));
  }
});

test('paying the exact balance clears the student, and further payments are refused', async () => {
  const c = client(); await c.login('admin', 'Admin@12345');
  const before = (await c.get('/api/students')).data.students.find((s) => s.admissionNo === 'STU002');
  const r = await c.post('/api/payments', { admissionNo: 'STU002', amount: before.balance, mode: 'Bank Deposit' });
  assert.equal(r.status, 201);
  assert.equal(r.data.student.status, 'Cleared');
  assert.equal(r.data.student.balance, 0);
  assert.equal((await c.post('/api/payments', { admissionNo: 'STU002', amount: 1, mode: 'Cash' })).status, 409);
});

test('receipt shows balance as it was after that payment', async () => {
  const c = client(); await c.login('admin', 'Admin@12345');
  const { data, status } = await c.get('/api/receipts/RCT-2026-081');
  assert.equal(status, 200);
  assert.equal(data.receipt.amount, 45000);
  assert.equal(data.receipt.balanceAfter, 111400 - 45000);
  assert.equal(data.receipt.school, 'Test School');
  assert.equal((await c.get('/api/receipts/RCT-9999-001')).status, 404);
});

test('attendance: save, read back, rate; rejects bad input', async () => {
  const c = client(); await c.login('admin', 'Admin@12345');
  const t = today(config.timezone);
  let r = await c.get(`/api/attendance?date=${t}`);
  assert.equal(r.data.summary.marked, 0);
  assert.equal(r.data.summary.rate, null);

  r = await c.put('/api/attendance', {
    date: t,
    records: [
      { admissionNo: 'STU001', status: 'present' }, { admissionNo: 'STU002', status: 'present' },
      { admissionNo: 'STU003', status: 'present' }, { admissionNo: 'STU004', status: 'absent' },
    ],
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.summary.present, 3);
  assert.equal(r.data.summary.rate, 75);

  // changing an existing mark updates (no duplicates)
  r = await c.put('/api/attendance', { date: t, records: [{ admissionNo: 'STU004', status: 'present' }] });
  assert.equal(r.data.summary.marked, 4);
  assert.equal(r.data.summary.rate, 100);

  assert.equal((await c.put('/api/attendance', { date: '2999-01-01', records: [{ admissionNo: 'STU001', status: 'present' }] })).status, 400);
  assert.equal((await c.put('/api/attendance', { date: t, records: [{ admissionNo: 'STU001', status: 'maybe' }] })).status, 400);
  assert.equal((await c.put('/api/attendance', { date: t, records: [{ admissionNo: 'NOPE', status: 'present' }] })).status, 404);
  assert.equal((await c.put('/api/attendance', { date: t, records: [] })).status, 400);
  assert.equal((await c.get('/api/attendance?date=garbage')).status, 400);

  // the seeded 10 Oct 2026 register from the original page
  r = await c.get('/api/attendance?date=2026-10-10');
  assert.equal(r.data.summary.present, 8);
  assert.equal(r.data.summary.absent, 2);
});

test('PDF reports download correctly', async () => {
  const c = client(); await c.login('admin', 'Admin@12345');
  for (const p of ['collection', 'balances', 'attendance']) {
    const r = await c.get(`/api/reports/${p}.pdf`);
    assert.equal(r.status, 200, p);
    assert.match(r.type, /application\/pdf/);
    assert.equal(r.data.subarray(0, 4).toString(), '%PDF');
    assert.match(r.headers.get('content-disposition'), /attachment/);
  }
});

/* ---------------- Adding students / accounts ---------------- */
test('adding a student creates working logins that must change their temporary password', async () => {
  const admin = client(); await admin.login('admin', 'Admin@12345');

  assert.equal((await admin.post('/api/students', { admissionNo: 'STU011', name: 'Test Child', year: 9, totalFees: 1000 })).status, 400);
  assert.equal((await admin.post('/api/students', { admissionNo: 'x', name: 'Test Child', year: 1, totalFees: 1000 })).status, 400);
  assert.equal((await admin.post('/api/students', { admissionNo: 'STU011', name: 'Test Child', year: 1, totalFees: -1 })).status, 400);

  const r = await admin.post('/api/students', {
    admissionNo: 'stu011', name: 'Test Child', year: 1, totalFees: 90000, parentEmail: 'Mum@Example.com',
  });
  assert.equal(r.status, 201);
  assert.equal(r.data.student.admissionNo, 'STU011');
  assert.equal(r.data.student.balance, 90000);
  const { student, parent } = r.data.credentials;
  assert.ok(student.password.length >= 12 && parent.password.length >= 12);

  // duplicate admission number
  assert.equal((await admin.post('/api/students', { admissionNo: 'STU011', name: 'Dup', year: 1, totalFees: 1 })).status, 409);

  // student logs in with the temp password, is forced to change it
  const s = client();
  const login = await s.login('STU011', student.password);
  assert.equal(login.data.user.mustChangePassword, true);
  assert.equal((await s.post('/api/auth/change-password', { currentPassword: 'wrong', newPassword: 'NewPass123' })).status, 400);
  assert.equal((await s.post('/api/auth/change-password', { currentPassword: student.password, newPassword: 'short' })).status, 400);
  assert.equal((await s.post('/api/auth/change-password', { currentPassword: student.password, newPassword: 'NewPass123' })).status, 200);
  assert.equal((await s.get('/api/auth/me')).data.user.mustChangePassword, false);
  assert.equal((await client().post('/api/auth/login', { username: 'STU011', password: student.password })).status, 401); // old one dead
  await client().login('STU011', 'NewPass123');

  // parent (lower-cased email) sees only this child
  const p = client(); await p.login('mum@example.com', parent.password);
  const kids = (await p.get('/api/portal/parent')).data.children;
  assert.deepEqual(kids.map((k) => k.admissionNo), ['STU011']);

  // adding a second child with the same parent email links to the same account (no new password)
  const r2 = await admin.post('/api/students', { admissionNo: 'STU012', name: 'Second Child', year: 2, totalFees: 50000, parentEmail: 'mum@example.com' });
  assert.equal(r2.data.credentials.parent.password, null);
  assert.equal((await p.get('/api/portal/parent')).data.children.length, 2);
});

/* ---------------- Access control ---------------- */
test('students and parents cannot use admin endpoints', async () => {
  for (const [u, pw] of [['STU001', 'Student@12345'], ['parent1', 'Parent@12345']]) {
    const c = client(); await c.login(u, pw);
    for (const p of ['/api/students', '/api/dashboard', '/api/payments', '/api/attendance', '/api/reports/summary', '/api/reports/collection.pdf']) {
      assert.equal((await c.get(p)).status, 403, `${u} ${p}`);
    }
    assert.equal((await c.post('/api/payments', { admissionNo: 'STU001', amount: 1, mode: 'Cash' })).status, 403);
    assert.equal((await c.post('/api/students', { admissionNo: 'STU099', name: 'Hacker', year: 1, totalFees: 0 })).status, 403);
    assert.equal((await c.put('/api/attendance', { date: '2026-10-10', records: [{ admissionNo: 'STU001', status: 'present' }] })).status, 403);
  }
});

test('student portal shows only the student\'s own data; ?adm= is ignored for students', async () => {
  const c = client(); await c.login('STU001', 'Student@12345');
  let r = await c.get('/api/portal/student');
  assert.equal(r.data.student.admissionNo, 'STU001');
  assert.equal(r.data.payments.length, 1);
  r = await c.get('/api/portal/student?adm=STU003');
  assert.equal(r.data.student.admissionNo, 'STU001');
  assert.equal((await c.get('/api/portal/parent')).status, 403);
});

test('receipts and statements: own = OK, someone else\'s = 404', async () => {
  const s = client(); await s.login('STU001', 'Student@12345');
  assert.equal((await s.get('/api/receipts/RCT-2026-081')).status, 200);
  assert.equal((await s.get('/api/receipts/RCT-2026-083')).status, 404); // Kevin's
  assert.equal((await s.get('/api/portal/statement/STU001.pdf')).status, 200);
  assert.equal((await s.get('/api/portal/statement/STU003.pdf')).status, 404);

  const p = client(); await p.login('parent1', 'Parent@12345');
  const st = await p.get('/api/portal/statement/STU001.pdf');
  assert.equal(st.status, 200);
  assert.equal(st.data.subarray(0, 4).toString(), '%PDF');
  assert.equal((await p.get('/api/portal/statement/STU003.pdf')).status, 404);
  assert.equal((await p.get('/api/receipts/RCT-2026-083')).status, 404);
});

test('admin can preview the portals for any student', async () => {
  const c = client(); await c.login('admin', 'Admin@12345');
  assert.equal((await c.get('/api/portal/student?adm=STU003')).data.student.name, 'Kevin Otieno');
  assert.equal((await c.get('/api/portal/parent?adm=STU003')).data.children[0].admissionNo, 'STU003');
});

/* ---------------- Server behaviour ---------------- */
test('static pages are served; unknown API routes and bad JSON give clean JSON errors', async () => {
  for (const p of ['/login.html', '/index.html', '/style.css', '/js/app.js']) {
    assert.equal((await fetch(base + p)).status, 200, p);
  }
  const r = await fetch(base + '/api/nope');
  assert.equal(r.status, 404);
  assert.ok((await r.json()).error);
  const bad = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
  assert.equal(bad.status, 400);
});

test('security headers are present (CSP, no X-Powered-By)', async () => {
  const r = await fetch(base + '/login.html');
  assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(r.headers.get('x-powered-by'), null);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});
