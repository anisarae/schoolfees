(async () => {
  await App.init({ roles: ['admin'], active: 'students.html' });
  const { esc, money, api, openModal, toast } = App;
  let students = [];

  const tbody = document.getElementById('rows');
  const search = document.getElementById('search');

  function render() {
    const q = search.value.trim().toLowerCase();
    const list = students.filter((s) => !q || s.name.toLowerCase().includes(q) || s.admissionNo.toLowerCase().includes(q));
    App.fillRows(
      tbody,
      list.map((s) => `
        <tr>
          <td>${esc(s.admissionNo)}</td>
          <td>${esc(s.name)}</td>
          <td>${esc(s.yearLabel)}</td>
          <td>${money(s.totalFees)}</td>
          <td>${money(s.paid)}</td>
          <td>${money(s.balance)}</td>
          <td>${App.feeBadge(s.status)}</td>
        </tr>`),
      7,
      students.length ? 'No students match your search.' : 'No students yet. Click "+ Add Student" to add one.'
    );
  }

  async function load() {
    students = (await api('/api/students')).students;
    render();
  }
  search.addEventListener('input', render);

  /* ---------- Record payment ---------- */
  document.getElementById('btn-record').addEventListener('click', async () => {
    const owing = students.filter((s) => s.balance > 0);
    if (!owing.length) return toast('Every student has cleared their fees.');
    const today = (await api('/api/auth/me')).today;
    const modes = ['M-Pesa', 'Bank Deposit', 'Cash', 'Cheque'];
    const m = openModal({
      title: 'Record Payment',
      subtitle: 'A receipt number is generated automatically.',
      body: `
        <div class="form-group"><label>Student</label>
          <select id="rp-student">${owing.map((s) => `<option value="${esc(s.admissionNo)}">${esc(s.admissionNo)} - ${esc(s.name)}</option>`).join('')}</select>
          <span class="muted" id="rp-balance" style="margin-top:6px"></span>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Amount (KSh)</label><input type="number" id="rp-amount" min="1" step="1" inputmode="numeric"></div>
          <div class="form-group"><label>Payment mode</label><select id="rp-mode">${modes.map((x) => `<option>${x}</option>`).join('')}</select></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Date paid</label><input type="date" id="rp-date" value="${today}" max="${today}"></div>
          <div class="form-group"><label>Reference (optional)</label><input type="text" id="rp-ref" maxlength="60" placeholder="e.g. M-Pesa code"></div>
        </div>`,
      buttons: [
        { label: 'Cancel', onClick: ({ close }) => close() },
        {
          label: 'Save payment', primary: true,
          onClick: async ({ root, close }) => {
            const v = (id) => root.querySelector(id).value;
            const res = await api('/api/payments', {
              method: 'POST',
              body: { admissionNo: v('#rp-student'), amount: Number(v('#rp-amount')), mode: v('#rp-mode'), paidOn: v('#rp-date'), reference: v('#rp-ref') },
            });
            close();
            toast(`Payment saved. Receipt ${res.receiptNo} issued.`);
            await load();
          },
        },
      ],
    });
    const sel = m.root.querySelector('#rp-student');
    const hint = () => {
      const s = owing.find((x) => x.admissionNo === sel.value);
      m.root.querySelector('#rp-balance').textContent = `Outstanding balance: ${money(s.balance)}`;
    };
    sel.addEventListener('change', hint);
    hint();
  });

  /* ---------- Add student ---------- */
  document.getElementById('btn-add-student').addEventListener('click', () => {
    openModal({
      title: 'Add Student',
      subtitle: 'A login is created for the student (and the parent, if you enter an email).',
      body: `
        <div class="form-row">
          <div class="form-group"><label>Admission No.</label><input type="text" id="as-adm" placeholder="STU011" maxlength="20"></div>
          <div class="form-group"><label>Year of study</label><select id="as-year">${[1, 2, 3, 4].map((y) => `<option value="${y}">Year ${y}</option>`).join('')}</select></div>
        </div>
        <div class="form-group"><label>Full name</label><input type="text" id="as-name" maxlength="100"></div>
        <div class="form-group"><label>Total fees for the year (KSh)</label><input type="number" id="as-fees" min="0" step="1" inputmode="numeric"></div>
        <div class="form-group"><label>Parent email (optional)</label><input type="email" id="as-parent" placeholder="parent@example.com"></div>`,
      buttons: [
        { label: 'Cancel', onClick: ({ close }) => close() },
        {
          label: 'Add student', primary: true,
          onClick: async ({ root, close }) => {
            const v = (id) => root.querySelector(id).value;
            const res = await api('/api/students', {
              method: 'POST',
              body: { admissionNo: v('#as-adm'), name: v('#as-name'), year: Number(v('#as-year')), totalFees: Number(v('#as-fees')), parentEmail: v('#as-parent') },
            });
            close();
            await load();
            showCredentials(res);
          },
        },
      ],
    });
  });

  function showCredentials({ student, credentials }) {
    const row = (label, c) => !c ? '' : `
      <div class="cred-box"><strong>${label}</strong><br>
        Username: <code>${esc(c.username)}</code><br>
        ${c.password ? `Temporary password: <code>${esc(c.password)}</code>` : esc(c.note || '')}
      </div>`;
    openModal({
      title: `${student.name} added`,
      subtitle: 'Copy these now - temporary passwords are shown only once. Users must change them at first login.',
      body: row('Student login', credentials.student) + row('Parent login', credentials.parent),
      buttons: [{ label: 'Done', primary: true, onClick: ({ close }) => close() }],
    });
  }

  await load();
})().catch((e) => e.message !== 'redirecting' && App.toast(e.message, true));
